use serde::{Deserialize, Serialize};
use std::env;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use thiserror::Error;

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
    format!("Hello, {}!", name)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_file = env::args().nth(1);

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            if let Some(file_path) = args.get(1) {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("open-file", file_path);
                    let _ = window.set_focus();
                }
            }
        }))
        .manage(InitialFile(Mutex::new(initial_file)))
        .invoke_handler(tauri::generate_handler![
            greet,
            read_file,
            write_file,
            list_files,
            create_file,
            delete_file,
            get_initial_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
