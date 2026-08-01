use crate::error::AppError;

#[cfg(target_os = "macos")]
mod platform {
    use std::sync::mpsc;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2_foundation::NSData;
    use objc2_web_kit::WKWebView;
    use tauri::Manager;

    use crate::error::AppError;

    /// Generate PDF bytes from the current state of the main webview.
    ///
    /// `WKWebView.createPDFWithConfiguration:completionHandler:` captures the
    /// live composited layer tree (what is actually rendered on screen), not a
    /// separate print layout pass. This is fundamentally different from
    /// `printOperationWithPrintInfo:` which produces blank pages with
    /// dynamically-injected DOM content.
    pub fn generate_pdf_bytes(app: &tauri::AppHandle) -> Result<Vec<u8>, AppError> {
        let webview_window = app
            .get_webview_window("main")
            .ok_or_else(|| AppError::NotFound("main window".into()))?;

        let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();

        webview_window
            .with_webview(move |wv| {
                unsafe {
                    let wk: &WKWebView = &*wv.inner().cast();

                    let block = RcBlock::new(move |data: *mut NSData, _err: *mut objc2_foundation::NSError| {
                        if data.is_null() {
                            let _ = tx.send(Err("createPDF returned nil data".to_string()));
                            return;
                        }
                        let retained: Retained<NSData> = Retained::retain(data).unwrap();
                        let bytes = retained.to_vec();
                        let _ = tx.send(Ok(bytes));
                    });

                    wk.createPDFWithConfiguration_completionHandler(None, &block);
                }
            })
            .map_err(|e| AppError::Encoding(e.to_string()))?;

        rx.recv()
            .map_err(|_| AppError::Encoding("createPDF completion handler never fired".into()))?
            .map_err(|e| AppError::Encoding(e))
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn print_pdf(app: tauri::AppHandle) -> Result<(), AppError> {
    let bytes = platform::generate_pdf_bytes(&app)?;

    let temp_dir = std::env::temp_dir();
    let temp_path = temp_dir.join("markdown-viewditor-print.pdf");
    std::fs::write(&temp_path, &bytes).map_err(AppError::Io)?;

    std::process::Command::new("open")
        .arg("-p")
        .arg(&temp_path)
        .spawn()
        .map_err(|e| AppError::Encoding(format!("failed to open print dialog: {e}")))?;

    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn print_pdf(_app: tauri::AppHandle) -> Result<(), AppError> {
    Err(AppError::Encoding(
        "print_pdf is only supported on macOS".into(),
    ))
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn create_pdf(app: tauri::AppHandle, save_path: String) -> Result<(), AppError> {
    let bytes = platform::generate_pdf_bytes(&app)?;
    std::fs::write(&save_path, &bytes).map_err(AppError::Io)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn create_pdf(_app: tauri::AppHandle, _save_path: String) -> Result<(), AppError> {
    Err(AppError::Encoding(
        "create_pdf is only supported on macOS".into(),
    ))
}