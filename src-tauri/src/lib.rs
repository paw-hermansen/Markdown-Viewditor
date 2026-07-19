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
                    let path = normalize_localimg_path(raw);
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

/// Normalize a URI path received by the `localimg://` protocol handler into a
/// filesystem path. Handles Windows drive-absolute paths (`C:/...`), UNC paths
/// (`//server/share/...`), and Unix-absolute paths (`/home/...`) on every
/// platform, regardless of how many leading slashes the URI parser produced.
fn normalize_localimg_path(raw_uri_path: &str) -> String {
    // The URI path always starts with '/' (the URI root). Drop exactly one
    // leading '/' *before* decoding so that an encoded leading '/' (e.g.
    // "%2FC%3A..." for an input like "C:/...") does not produce a double-slash
    // UNC-style path after decoding.
    let stripped = raw_uri_path.strip_prefix('/').unwrap_or(raw_uri_path);
    let decoded = percent_encoding::percent_decode_str(stripped)
        .decode_utf8_lossy()
        .to_string();
    normalize_decoded_path(&decoded)
}

/// Reconstruct a normalized filesystem path from the percent-decoded URI body.
/// After decoding, the body can be in one of these forms (depending on what
/// the frontend passed to `convertFileSrc` and how the URI parser normalized
/// it):
///
/// - `C:/Users/...`       — Windows drive-absolute (no leading slash).
/// - `/C:/Users/...`      — drive-absolute with one extra leading slash.
/// - `//C:/Users/...`     — drive-absolute with two extra leading slashes.
/// - `//server/share/...` — UNC.
/// - `/home/...`          — Unix-absolute.
/// - `home/...`           — relative (degenerate; returned as-is).
///
/// The returned path uses forward slashes only, which `std::fs::read` accepts
/// on every supported platform.
fn normalize_decoded_path(decoded: &str) -> String {
    let leading_slash_count = decoded.bytes().take_while(|&b| b == b'/').count();
    let trimmed = &decoded[leading_slash_count..];

    // Windows drive-absolute: an ASCII letter followed by ':' and (normally) '/'.
    // Strip any extra leading slashes so the result is "C:/...".
    if trimmed.len() >= 3
        && trimmed.as_bytes()[0].is_ascii_alphabetic()
        && trimmed.as_bytes()[1] == b':'
        && (trimmed.len() == 2 || trimmed.as_bytes()[2] == b'/')
    {
        return trimmed.to_string();
    }

    // UNC path: preserve exactly two leading slashes.
    if leading_slash_count >= 2 {
        return format!("//{}", trimmed);
    }

    // Unix-absolute path: preserve exactly one leading slash.
    if leading_slash_count == 1 {
        return format!("/{}", trimmed);
    }

    // Relative path or unrecognized form: surface to `std::fs::read` which will
    // produce a clear error against the process's current working directory.
    decoded.to_string()
}

#[cfg(test)]
mod tests {
    use super::normalize_decoded_path;

    #[test]
    fn drive_path_without_leading_slash_is_preserved() {
        assert_eq!(
            normalize_decoded_path("C:/Users/paw/file.png"),
            "C:/Users/paw/file.png"
        );
    }

    #[test]
    fn drive_path_with_one_leading_slash_has_it_stripped() {
        // Frontend passes "C:/..."; convertFileSrc may produce a URI whose
        // decoded form has an extra leading slash.
        assert_eq!(
            normalize_decoded_path("/C:/Users/paw/file.png"),
            "C:/Users/paw/file.png"
        );
    }

    #[test]
    fn drive_path_with_two_leading_slashes_has_them_stripped() {
        assert_eq!(
            normalize_decoded_path("//C:/Users/paw/file.png"),
            "C:/Users/paw/file.png"
        );
    }

    #[test]
    fn drive_path_with_backslash_is_not_recognized_as_drive() {
        // After percent-decoding we should only see forward slashes, but if a
        // raw backslash somehow survives it must not be treated as a drive.
        let result = normalize_decoded_path("C:\\Users");
        assert_eq!(result, "C:\\Users");
    }

    #[test]
    fn different_drive_letter_works() {
        assert_eq!(
            normalize_decoded_path("G:/MyFolder/Another.md"),
            "G:/MyFolder/Another.md"
        );
    }

    #[test]
    fn unc_path_with_two_leading_slashes_is_preserved() {
        assert_eq!(
            normalize_decoded_path("//server/share/file.png"),
            "//server/share/file.png"
        );
    }

    #[test]
    fn unc_path_with_extra_leading_slashes_collapses_to_two() {
        assert_eq!(
            normalize_decoded_path("///server/share/file.png"),
            "//server/share/file.png"
        );
    }

    #[test]
    fn unix_absolute_path_is_preserved() {
        assert_eq!(
            normalize_decoded_path("/home/devel/file.png"),
            "/home/devel/file.png"
        );
    }

    #[test]
    fn two_leading_slashes_treated_as_unc_even_if_unix_like() {
        // `//home/...` is ambiguous; treating it as UNC (host="home") is
        // consistent with Windows convention and the frontend's normalization.
        assert_eq!(
            normalize_decoded_path("//home/devel/file.png"),
            "//home/devel/file.png"
        );
    }

    #[test]
    fn relative_path_returned_as_is() {
        assert_eq!(normalize_decoded_path("just-a-name.png"), "just-a-name.png");
    }

    #[test]
    fn empty_string_returned_as_is() {
        assert_eq!(normalize_decoded_path(""), "");
    }
}
