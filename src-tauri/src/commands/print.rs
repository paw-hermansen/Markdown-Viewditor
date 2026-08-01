use tauri::Manager;

use crate::error::AppError;

#[tauri::command]
pub fn print_window(app: tauri::AppHandle) -> Result<(), AppError> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::NotFound("main window".into()))?;
    window.print().map_err(|e| AppError::Encoding(e.to_string()))
}
