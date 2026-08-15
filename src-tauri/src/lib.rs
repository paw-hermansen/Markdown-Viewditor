mod commands;
mod error;
mod protocol;
mod state;

use std::env;
use tauri::Manager;

use commands::file::{create_file, delete_file, get_file_info, get_file_mtime, opened_urls, is_file_writable, list_files, read_file, read_file_as_base64, write_file, write_file_binary};
use commands::print::create_pdf;
use commands::svg::rasterize_svg;
use commands::window::{force_close_window, save_window_state, save_window_state_debounced};
use state::{OpenedUrls, WindowState};

#[cfg(target_os = "linux")]
fn configure_platform() {
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
}

#[cfg(target_os = "windows")]
fn configure_platform() {
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-features=msWebOOUI",
    );
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn configure_platform() {}

/// Whether the built-in Tauri updater should be active.
///
/// Sandboxed / package-managed installs (Flatpak, Snap) own the update
/// lifecycle themselves (`flatpak update`, `snap refresh`). Running the
/// in-app updater there would either fail (read-only filesystem) or
/// conflict with the system updater, so we disable it.
fn updater_enabled() -> bool {
    if std::path::Path::new("/.flatpak-info").exists() {
        return false;
    }
    if env::var_os("SNAP").is_some() {
        return false;
    }
    true
}

/// Extract a filesystem path from a `file:///` URL.
/// For `file:///path/to/file.md` returns `/path/to/file.md`.
#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn url_to_path(url: &tauri::Url) -> String {
    if url.scheme() == "file" {
        url.path().to_string()
    } else {
        url.to_string()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_platform();
    let cli_file: Vec<String> = env::args().nth(1).into_iter().collect();

    let mut builder = tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol(
            "localimg",
            protocol::localimg_protocol_handler,
        )
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init());

    if updater_enabled() {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }
    builder = builder.plugin(tauri_plugin_process::init());

    let app = builder
        .manage(OpenedUrls(std::sync::Mutex::new(cli_file)))
        .invoke_handler(tauri::generate_handler![
            read_file,
            read_file_as_base64,
            write_file,
            write_file_binary,
            list_files,
            create_file,
            delete_file,
            get_file_mtime,
            get_file_info,
            is_file_writable,
            opened_urls,
            save_window_state,
            force_close_window,
            create_pdf,
            rasterize_svg
        ])
        .setup(|app| {
            // Restore window state before frontend loads
            if let Ok(store) =
                tauri_plugin_store::StoreBuilder::new(app.handle(), "window-state.json").build()
            {
                if let Some(value) = store.get("windowState") {
                    if let Ok(state) = serde_json::from_value::<WindowState>(value.clone()) {
                        if let Some(window) = app.get_webview_window("main") {
                            if state.maximized {
                                let _ = window.maximize();
                            } else {
                                let _ = window.set_size(tauri::Size::Physical(
                                    tauri::PhysicalSize {
                                        width: state.width as u32,
                                        height: state.height as u32,
                                    },
                                ));
                                let win = window.clone();
                                std::thread::spawn(move || {
                                    std::thread::sleep(std::time::Duration::from_millis(100));
                                    let _ = win.set_position(tauri::Position::Physical(
                                        tauri::PhysicalPosition {
                                            x: state.x as i32,
                                            y: state.y as i32,
                                        },
                                    ));
                                });
                            }
                        }
                    }
                }
            }

            let app_handle = app.handle().clone();
            if let Some(window) = app.get_webview_window("main") {
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => {
                        save_window_state_debounced(&app_handle);
                    }
                    _ => {}
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app, _event| {
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        if let tauri::RunEvent::Opened { urls } = _event {
            use tauri::Emitter;
            let paths: Vec<String> = urls.iter().map(url_to_path).collect();
            _app.state::<OpenedUrls>().0.lock().unwrap().extend(paths.clone());
            let _ = _app.emit("open-file", paths);
        }
    });
}
