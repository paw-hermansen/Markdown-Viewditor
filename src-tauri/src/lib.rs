use serde::{Deserialize, Serialize};
use std::env;
use std::sync::Mutex;
use tauri::http::Response;
use tauri::{Manager, State};
use thiserror::Error;

#[derive(Serialize, Deserialize, Clone, Debug)]
struct WindowState {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    maximized: bool,
}

#[derive(Debug, Error)]
enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    NotFound(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[derive(Serialize, Deserialize)]
struct FileInfo {
    path: String,
    name: String,
    is_dir: bool,
    size: u64,
}

struct InitialFile(Mutex<Option<String>>);

#[tauri::command]
fn get_initial_file(state: State<InitialFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[tauri::command]
fn greet(name: String) -> String {
    format!("Hello, {name}!")
}

#[tauri::command]
fn force_close_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.destroy();
    }
}

#[tauri::command]
async fn read_file(path: String) -> Result<String, AppError> {
    Ok(std::fs::read_to_string(&path)?)
}

#[tauri::command]
async fn write_file(path: String, content: String) -> Result<(), AppError> {
    std::fs::write(&path, &content)?;
    Ok(())
}

#[tauri::command]
async fn list_files(dir: String) -> Result<Vec<FileInfo>, AppError> {
    let entries = std::fs::read_dir(&dir)?;
    let mut files = Vec::new();

    for entry in entries {
        let entry = entry?;
        let metadata = entry.metadata()?;
        let path = entry.path();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        files.push(FileInfo {
            path: path.to_string_lossy().to_string(),
            name,
            is_dir: metadata.is_dir(),
            size: metadata.len(),
        });
    }

    Ok(files)
}

#[tauri::command]
async fn create_file(path: String) -> Result<(), AppError> {
    std::fs::File::create(&path)?;
    Ok(())
}

#[tauri::command]
async fn delete_file(path: String) -> Result<(), AppError> {
    let metadata = std::fs::metadata(&path)?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(&path)?;
    } else {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

#[tauri::command]
async fn save_window_state(app: tauri::AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("main") {
        let position = window.outer_position().map_err(|e| AppError::NotFound(e.to_string()))?;
        let size = window.inner_size().map_err(|e| AppError::NotFound(e.to_string()))?;
        let is_maximized = window.is_maximized().unwrap_or(false);

        let state = WindowState {
            x: position.x as f64,
            y: position.y as f64,
            width: size.width as f64,
            height: size.height as f64,
            maximized: is_maximized,
        };

        if let Ok(store) = tauri_plugin_store::StoreBuilder::new(&app, "window-state.json").build() {
            store.set("windowState", serde_json::to_value(&state).unwrap());
            let _ = store.save();
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_file = env::args().nth(1);

    tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(
            "localimg",
            |_app, request, responder| {
                std::thread::spawn(move || {
                    let raw = request.uri().path();
                    // The URI path always starts with '/' (the URI root); drop it
                    // before decoding so an encoded leading '/' (e.g. "%2FC%3A..."
                    // for "C:/...") does not produce a double-slash UNC path.
                    let stripped = if raw.as_bytes().first() == Some(&b'/') {
                        &raw[1..]
                    } else {
                        raw
                    };
                    let decoded = percent_encoding::percent_decode_str(stripped)
                        .decode_utf8_lossy()
                        .to_string();
                    let path: String = if decoded.len() >= 3
                        && decoded.as_bytes()[0] == b'/'
                        && decoded.as_bytes()[2] == b':'
                        && (decoded.as_bytes()[1] as char).is_ascii_alphabetic()
                    {
                        decoded[1..].to_string()
                    } else {
                        decoded
                    };
                    match std::fs::read(&path) {
                        Ok(bytes) => {
                            let mime = mime_guess::from_path(&path)
                                .first_or_octet_stream()
                                .to_string();
                            responder.respond(
                                Response::builder()
                                    .status(200)
                                    .header("Content-Type", mime)
                                    .header("Access-Control-Allow-Origin", "*")
                                    .body(bytes)
                                    .unwrap(),
                            );
                        }
                        Err(e) => {
                            responder.respond(
                                Response::builder()
                                    .status(404)
                                    .body(e.to_string().into_bytes())
                                    .unwrap(),
                            );
                        }
                    }
                });
            },
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .manage(InitialFile(Mutex::new(initial_file)))
        .invoke_handler(tauri::generate_handler![
            greet,
            read_file,
            write_file,
            list_files,
            create_file,
            delete_file,
            get_initial_file,
            save_window_state,
            force_close_window
        ])
        .setup(|app| {
            // Restore window state before frontend loads
            if let Ok(store) = tauri_plugin_store::StoreBuilder::new(app.handle(), "window-state.json").build() {
                if let Some(value) = store.get("windowState") {
                    if let Ok(state) = serde_json::from_value::<WindowState>(value.clone()) {
                        if let Some(window) = app.get_webview_window("main") {
                            if state.maximized {
                                let _ = window.maximize();
                            } else {
                                // Set size immediately
                                let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                                    width: state.width as u32,
                                    height: state.height as u32,
                                }));
                                // Defer position restore — Linux WMs override set_position
                                // if called before the window is fully mapped
                                let win = window.clone();
                                std::thread::spawn(move || {
                                    std::thread::sleep(std::time::Duration::from_millis(100));
                                    let _ = win.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                                        x: state.x as i32,
                                        y: state.y as i32,
                                    }));
                                });
                            }
                        }
                    }
                }
            }

            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| {
                    match event {
                        tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                            save_window_state_debounced(&app_handle);
                        }
                        _ => {}
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use std::sync::Mutex as StdMutex;
use std::time::Instant;

static LAST_SAVE: StdMutex<Option<Instant>> = StdMutex::new(None);

fn save_window_state_debounced(app: &tauri::AppHandle) {
    let now = Instant::now();
    let should_save = {
        let mut last = LAST_SAVE.lock().unwrap();
        if last.is_none_or(|t| now.duration_since(t).as_millis() > 500) {
            *last = Some(now);
            true
        } else {
            false
        }
    };
    if should_save {
        if let Some(window) = app.get_webview_window("main") {
            if let (Ok(position), Ok(size)) = (window.outer_position(), window.inner_size()) {
                let is_maximized = window.is_maximized().unwrap_or(false);
                let state = WindowState {
                    x: position.x as f64,
                    y: position.y as f64,
                    width: size.width as f64,
                    height: size.height as f64,
                    maximized: is_maximized,
                };
                if let Ok(store) = tauri_plugin_store::StoreBuilder::new(app, "window-state.json").build() {
                    store.set("windowState", serde_json::to_value(&state).unwrap());
                    let _ = store.save();
                }
            }
        }
    }
}


