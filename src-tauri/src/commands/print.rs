use crate::error::AppError;

#[cfg(target_os = "macos")]
mod platform {
    use std::sync::mpsc;

    use objc2::runtime::AnyObject;
    use objc2_app_kit::{NSPrintInfo, NSPrintJobSavingURL, NSPrintSaveJob};
    use objc2_foundation::{NSString, NSSize, NSURL};
    use objc2_web_kit::WKWebView;
    use tauri::Manager;

    use crate::error::AppError;

    // A4 with 10mm margins — mirrors the @page rule in app.css and the
    // PRINT_CONTENT_WIDTH_PX geometry in src/lib/export/exporters/pdf.ts, so
    // the macOS PDF path paginates identically to window.print() on the other
    // platforms.
    const A4_WIDTH_PT: f64 = 595.28;
    const A4_HEIGHT_PT: f64 = 841.89;
    const PAGE_MARGIN_PT: f64 = 28.3465; // 10mm

    /// Print the main webview's current content directly to a PDF file.
    ///
    /// Uses `NSPrintOperation` — WebKit's real paged print layout with
    /// `@media print` rules — configured via `NSPrintInfo` to save to a file
    /// without showing any panels. This is the same rendering path as
    /// `window.print()` on Linux/Windows, so pagination, backgrounds, and
    /// line wrapping match the other platforms exactly.
    ///
    /// The frontend must have the export container laid out and painted
    /// before invoking this (it awaits fonts plus two animation frames): the
    /// print operation renders what is on screen, and calling it before the
    /// injected DOM has settled yields blank pages.
    pub fn print_to_pdf(
        app: &tauri::AppHandle,
        save_path: &str,
        job_title: &str,
    ) -> Result<(), AppError> {
        let webview_window = app
            .get_webview_window("main")
            .ok_or_else(|| AppError::NotFound("main window".into()))?;

        let (tx, rx) = mpsc::channel::<Result<(), String>>();
        let path = save_path.to_owned();
        let title = job_title.to_owned();

        webview_window
            .with_webview(move |wv| {
                let result = unsafe {
                    let wk: &WKWebView = &*wv.inner().cast();

                    let info = NSPrintInfo::new();
                    info.setPaperSize(NSSize {
                        width: A4_WIDTH_PT,
                        height: A4_HEIGHT_PT,
                    });
                    info.setLeftMargin(PAGE_MARGIN_PT);
                    info.setRightMargin(PAGE_MARGIN_PT);
                    info.setTopMargin(PAGE_MARGIN_PT);
                    info.setBottomMargin(PAGE_MARGIN_PT);
                    // Save to PDF without any dialog.
                    info.setJobDisposition(NSPrintSaveJob);
                    let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
                    let url_obj: &AnyObject = url.as_ref();
                    info.dictionary().insert(NSPrintJobSavingURL, url_obj);

                    let op = wk.printOperationWithPrintInfo(&info);
                    op.setShowsPrintPanel(false);
                    op.setShowsProgressPanel(false);
                    op.setJobTitle(Some(&NSString::from_str(&title)));

                    if op.runOperation() {
                        Ok(())
                    } else {
                        Err("print operation failed".to_string())
                    }
                };
                let _ = tx.send(result);
            })
            .map_err(|e| AppError::Encoding(e.to_string()))?;

        rx.recv()
            .map_err(|_| AppError::Encoding("print operation never completed".into()))?
            .map_err(AppError::Encoding)
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn create_pdf(
    app: tauri::AppHandle,
    save_path: String,
    job_title: Option<String>,
) -> Result<(), AppError> {
    platform::print_to_pdf(&app, &save_path, job_title.as_deref().unwrap_or(""))
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn create_pdf(
    _app: tauri::AppHandle,
    _save_path: String,
    _job_title: Option<String>,
) -> Result<(), AppError> {
    Err(AppError::Encoding(
        "create_pdf is only supported on macOS".into(),
    ))
}
