use crate::error::AppError;

#[cfg(target_os = "macos")]
mod platform {
    use std::sync::mpsc;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::MainThreadMarker;
    use objc2_foundation::NSData;
    use objc2_web_kit::{WKPDFConfiguration, WKWebView};
    use tauri::Manager;

    use crate::error::AppError;

    /// Generate PDF bytes from the current state of the main webview.
    ///
    /// `WKWebView.createPDFWithConfiguration:completionHandler:` captures the
    /// live composited layer tree (what is actually rendered on screen), not a
    /// separate print layout pass. The API has no paper size and no
    /// pagination: the captured region *is* the page. With a `nil`
    /// configuration that region is the bounds of the displayed web page —
    /// the web view's width, so the page came out window-wide (several times
    /// the A4 width). An explicit `WKPDFConfiguration.rect` ("the rect to
    /// capture in web page coordinates") is captured as a single page of
    /// exactly that size, so the frontend passes the A4 sheet width in PDF
    /// points (1 CSS px = 1 pt in the capture) plus the full document height
    /// and gets one A4-wide page with the content column centered at 10mm
    /// margins — the same physical scale as the Linux/Windows A4 output.
    /// The completion handler makes the call asynchronous, so it never blocks
    /// the main run loop. The frontend lays out the print container (scaled
    /// to the A4 printable width) before invoking, so wrapping matches the
    /// Viewer.
    pub fn generate_pdf_bytes(
        app: &tauri::AppHandle,
        page_width_pt: f64,
        page_height_pt: f64,
    ) -> Result<Vec<u8>, AppError> {
        let webview_window = app
            .get_webview_window("main")
            .ok_or_else(|| AppError::NotFound("main window".into()))?;

        let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();

        webview_window
            .with_webview(move |wv| {
                unsafe {
                    let wk: &WKWebView = &*wv.inner().cast();

                    // Capture exactly one page of the given size. The rect is
                    // built from the configuration's own (null) rect so the
                    // CGRect type stays inferred — objc2-web-kit's CGRect
                    // comes from objc2-core-foundation, which we don't depend
                    // on directly. WKPDFConfiguration is main-thread-only;
                    // with_webview runs this closure on the main thread.
                    let mtm = MainThreadMarker::new()
                        .expect("create_pdf must run on the main thread");
                    let config = WKPDFConfiguration::new(mtm);
                    let mut rect = config.rect();
                    rect.origin.x = 0.0;
                    rect.origin.y = 0.0;
                    rect.size.width = page_width_pt;
                    rect.size.height = page_height_pt;
                    config.setRect(rect);

                    // The capture completes asynchronously and WebKit does
                    // not retain the configuration for us; keep a reference
                    // alive in the handler (which WebKit retains) until it
                    // runs.
                    let config_keepalive = config.clone();
                    let block = RcBlock::new(move |data: *mut NSData, _err: *mut objc2_foundation::NSError| {
                        // Referenced, not moved, so the closure stays `Fn`:
                        // the capture lives as long as the block and releases
                        // the configuration after the capture completes.
                        let _ = &config_keepalive;
                        if data.is_null() {
                            let _ = tx.send(Err("createPDF returned nil data".to_string()));
                            return;
                        }
                        let retained: Retained<NSData> = Retained::retain(data).unwrap();
                        let bytes = retained.to_vec();
                        let _ = tx.send(Ok(bytes));
                    });

                    wk.createPDFWithConfiguration_completionHandler(Some(&*config), &block);
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
    width: f64,
    height: f64,
) -> Result<(), AppError> {
    let bytes = platform::generate_pdf_bytes(&app, width, height)?;
    std::fs::write(&save_path, &bytes).map_err(AppError::Io)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn create_pdf(
    _app: tauri::AppHandle,
    _save_path: String,
    _width: f64,
    _height: f64,
) -> Result<(), AppError> {
    Err(AppError::Encoding(
        "create_pdf is only supported on macOS".into(),
    ))
}
