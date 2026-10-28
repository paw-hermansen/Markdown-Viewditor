use crate::error::AppError;

#[cfg(target_os = "macos")]
mod platform {
    use std::ffi::c_void;
    use std::sync::mpsc;

    use block2::RcBlock;
    use objc2::rc::Retained;
    use objc2::runtime::{AnyObject, NSObject};
    use objc2::{define_class, AnyThread, DefinedClass, MainThreadMarker};
    use objc2_foundation::{NSData, NSObjectProtocol};
    use objc2_web_kit::{WKPDFConfiguration, WKWebView};
    use tauri::Manager;

    use crate::error::AppError;

    /// Completion delegate for the print operation. AppKit sends
    /// `printOperationDidRun:success:contextInfo:` exactly once when the
    /// operation finishes (printed, saved as PDF, or cancelled); the result
    /// travels to `print_main_webview` through the delegate's channel.
    pub struct PrintRunDelegateIvars {
        sender: mpsc::Sender<Result<(), String>>,
    }

    define_class!(
        // SAFETY: NSObject imposes no subclassing requirements, and the type
        // implements no Drop.
        #[unsafe(super(NSObject))]
        #[ivars = PrintRunDelegateIvars]
        struct PrintRunDelegate;

        unsafe impl NSObjectProtocol for PrintRunDelegate {}

        impl PrintRunDelegate {
            #[unsafe(method(printOperationDidRun:success:contextInfo:))]
            fn print_operation_did_run(
                &self,
                _operation: *mut AnyObject,
                success: bool,
                _context_info: *mut c_void,
            ) {
                let _ = self.ivars().sender.send(if success {
                    Ok(())
                } else {
                    Err("the print operation failed".to_string())
                });
            }
        }
    );

    impl PrintRunDelegate {
        fn new(sender: mpsc::Sender<Result<(), String>>) -> Retained<Self> {
            let delegate = Self::alloc().set_ivars(PrintRunDelegateIvars { sender });
            let delegate: Retained<Self> = unsafe { objc2::msg_send![super(delegate), init] };
            // AppKit stores the delegate unretained and the completion
            // selector runs on this object, so it must outlive the operation.
            // Leak ours (one small NSObject per user-initiated print) rather
            // than free it from inside its own callback — a use-after-free in
            // the making.
            let _ = Retained::into_raw(delegate.clone());
            delegate
        }
    }

    /// The macOS major version the app is running on (e.g. 15 for Sequoia).
    ///
    /// The frontend cannot read this: WKWebView's user agent is frozen at
    /// "Mac OS X 10_15_7" on every macOS release, so the print/PDF mode gate
    /// (system print dialog from macOS 15, `create_pdf` capture below) needs
    /// a Rust-side probe.
    pub fn macos_major_version() -> u32 {
        use objc2_foundation::NSProcessInfo;
        NSProcessInfo::processInfo()
            .operatingSystemVersion()
            .majorVersion as u32
    }

    /// Open the system print dialog (NSPrintPanel, with its PDF ▾ menu) for
    /// the main webview and resolve once the print operation has finished —
    /// printed, saved as PDF, or cancelled. The frontend keeps its print
    /// clone alive until this returns, so the panel always captures the
    /// export layout and never the restored app UI.
    ///
    /// WKWebView has no JS `window.print()` (it is a silent no-op on macOS),
    /// so the dialog is driven from here through
    /// `-[WKWebView printOperationWithPrintInfo:]` (macOS 11+) run with
    /// `runOperationModalForWindow:delegate:didRunSelector:contextInfo:`.
    /// Two rules keep it working — both learned the hard way (see the
    /// spike notes in .agents/guides/export-print.md):
    ///
    /// - The operation must run through the *asynchronous*
    ///   `runOperationModalForWindow…`. The synchronous `runOperation` never
    ///   completes: WebKit's printing view wants a running run loop to build
    ///   its page preview, and the call deadlocks instead (blank pages or a
    ///   hung app, which is why the macOS path historically gave up on the
    ///   print dialog entirely).
    /// - The print view's frame must be initialized before `knowsPageRange:`
    ///   runs, or AppKit logs "The NSPrintOperation view's frame was not
    ///   initialized properly" and may trap in future releases.
    ///
    /// The completion delegate is kept alive for the process on purpose
    /// (see `PrintRunDelegate::new`).
    pub fn print_main_webview(app: &tauri::AppHandle) -> Result<(), AppError> {
        use objc2::sel;
        use objc2_app_kit::NSPrintInfo;

        let webview_window = app
            .get_webview_window("main")
            .ok_or_else(|| AppError::NotFound("main window".into()))?;

        let (tx, rx) = mpsc::channel::<Result<(), String>>();

        webview_window
            .with_webview(move |wv| {
                unsafe {
                    let wk: &WKWebView = &*wv.inner().cast();

                    let print_info = NSPrintInfo::init(NSPrintInfo::alloc());
                    // A4 sheet with 10mm margins — the same geometry as the
                    // `@page` rule in app.css and the print clone's scaling
                    // (see PrintLayout in the frontend's pdf exporter). The
                    // panel still lets the user pick other paper/margins.
                    // (NSSize comes from objc2-core-foundation, which is not a
                    // direct dependency, so the value is derived from the
                    // print info's own — same trick as the WKPDFConfiguration
                    // rect below.)
                    let mut paper = print_info.paperSize();
                    paper.width = 210.0 / 25.4 * 72.0;
                    paper.height = 297.0 / 25.4 * 72.0;
                    print_info.setPaperSize(paper);
                    print_info.setTopMargin(10.0 / 25.4 * 72.0);
                    print_info.setBottomMargin(10.0 / 25.4 * 72.0);
                    print_info.setLeftMargin(10.0 / 25.4 * 72.0);
                    print_info.setRightMargin(10.0 / 25.4 * 72.0);

                    let operation = wk.printOperationWithPrintInfo(&print_info);
                    operation.setShowsPrintPanel(true);
                    operation.setShowsProgressPanel(true);
                    // Keep the app responsive while the panel is up (the same
                    // configuration wry's WebView::print() uses; verified to
                    // print the dynamically-built export clone correctly).
                    operation.setCanSpawnSeparateThread(true);
                    // Initialize the print view's frame (see the fn docs).
                    if let Some(view) = operation.view() {
                        view.setFrame(wk.bounds());
                    }

                    let window = match wk.window() {
                        Some(window) => window,
                        None => {
                            let _ = tx.send(Err("main webview has no window".to_string()));
                            return;
                        }
                    };
                    let delegate = PrintRunDelegate::new(tx);
                    operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                        &window,
                        Some(&*delegate),
                        Some(sel!(printOperationDidRun:success:contextInfo:)),
                        std::ptr::null_mut(),
                    );
                }
            })
            .map_err(|e| AppError::Encoding(e.to_string()))?;

        rx.recv()
            .map_err(|_| AppError::Encoding("print operation never completed".into()))?
            .map_err(AppError::Encoding)
    }

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

/// Open the system print dialog for the main webview and resolve when the
/// print operation finishes. macOS only — Linux/Windows call `window.print()`
/// from the frontend instead, where the web engine opens the dialog itself.
#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn print_webview(app: tauri::AppHandle) -> Result<(), AppError> {
    platform::print_main_webview(&app)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn print_webview(_app: tauri::AppHandle) -> Result<(), AppError> {
    Err(AppError::Encoding(
        "print_webview is only supported on macOS".into(),
    ))
}

/// The macOS major version (e.g. 15 for Sequoia), or 0 on other platforms.
/// The frontend gates the print/PDF mode on this (the WKWebView user agent
/// is frozen and cannot tell one macOS release from the next).
#[tauri::command]
pub fn macos_major_version() -> u32 {
    #[cfg(target_os = "macos")]
    {
        platform::macos_major_version()
    }
    #[cfg(not(target_os = "macos"))]
    {
        0
    }
}
