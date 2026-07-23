use std::sync::Mutex as StdMutex;
use std::time::Instant;

use tauri::Manager;

use crate::error::AppError;
use crate::state::WindowState;

static LAST_SAVE: StdMutex<Option<Instant>> = StdMutex::new(None);

fn persist_window_state(app: &tauri::AppHandle) {
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
            if let Ok(store) =
                tauri_plugin_store::StoreBuilder::new(app, "window-state.json").build()
            {
                store.set("windowState", serde_json::to_value(&state).unwrap());
                let _ = store.save();
            }
        }
    }
}

#[tauri::command]
pub async fn save_window_state(app: tauri::AppHandle) -> Result<(), AppError> {
    persist_window_state(&app);
    Ok(())
}

#[tauri::command]
pub fn force_close_window(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.destroy();
    }
}

pub fn save_window_state_debounced(app: &tauri::AppHandle) {
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
        persist_window_state(app);
    }
}
