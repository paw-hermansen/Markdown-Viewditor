use crate::error::AppError;

#[cfg(target_os = "macos")]
mod platform {
    use std::sync::mpsc;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::MainThreadMarker;
    use objc2_foundation::{NSData, NSPoint, NSRect, NSSize};
    use objc2_web_kit::{WKPDFConfiguration, WKWebView};
    use tauri::Manager;

    use crate::error::AppError;

    /// Generate PDF bytes from the current state of the main webview.
    ///
    /// `WKWebView.createPDFWithConfiguration:completionHandler:` captures the
    /// live composited layer tree (what is actually rendered on screen), not a
    /// separate print layout pass. This is fundamentally different from
    /// `printOperationWithPrintInfo:` which produces blank pages with
    /// dynamically-injected DOM content.
    ///
    /// When `page_size` is given (width, height in points), the capture uses a
    /// `WKPDFConfiguration` rect of that size — expressed in web page
    /// coordinates, i.e. CSS pixels from the document origin — so each PDF
    /// page has exactly that size and the content is paginated across pages.
    /// The frontend pairs this with a matching body width and CSS zoom so the
    /// pages come out as A4 with the viewer's layout scaled to fit. When
    /// `None`, the rect defaults to the bounds of the displayed page
    /// (previous behavior).
    pub fn generate_pdf_bytes(
        app: &tauri::AppHandle,
        page_size: Option<(f64, f64)>,
    ) -> Result<Vec<u8>, AppError> {
        let webview_window = app
            .get_webview_window("main")
            .ok_or_else(|| AppError::NotFound("main window".into()))?;

        let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();

        webview_window
            .with_webview(move |wv| {
                unsafe {
                    let wk: &WKWebView = &*wv.inner().cast();

                    let config = page_size.map(|(width, height)| {
                        // `with_webview` runs this closure on the main thread.
                        let mtm = MainThreadMarker::new_unchecked();
                        let config = WKPDFConfiguration::new(mtm);
                        config.setRect(NSRect {
                            origin: NSPoint { x: 0.0, y: 0.0 },
                            size: NSSize { width, height },
                        });
                        config
                    });

                    let block = RcBlock::new(move |data: *mut NSData, _err: *mut objc2_foundation::NSError| {
                        if data.is_null() {
                            let _ = tx.send(Err("createPDF returned nil data".to_string()));
                            return;
                        }
                        let retained: Retained<NSData> = Retained::retain(data).unwrap();
                        let bytes = retained.to_vec();
                        let _ = tx.send(Ok(bytes));
                    });

                    wk.createPDFWithConfiguration_completionHandler(
                        config.as_deref(),
                        &block,
                    );
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
pub async fn create_pdf(
    app: tauri::AppHandle,
    save_path: String,
    page_width: Option<f64>,
    page_height: Option<f64>,
) -> Result<(), AppError> {
    let page_size = match (page_width, page_height) {
        (Some(w), Some(h)) => Some((w, h)),
        _ => None,
    };
    let bytes = platform::generate_pdf_bytes(&app, page_size)?;
    std::fs::write(&save_path, &bytes).map_err(AppError::Io)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn create_pdf(
    _app: tauri::AppHandle,
    _save_path: String,
    _page_width: Option<f64>,
    _page_height: Option<f64>,
) -> Result<(), AppError> {
    Err(AppError::Encoding(
        "create_pdf is only supported on macOS".into(),
    ))
}
