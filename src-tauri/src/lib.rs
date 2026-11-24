mod commands;
mod error;
mod protocol;
mod state;

use std::env;
use tauri::Manager;

use commands::file::{
    canonicalize_paths, create_file, delete_file, get_file_info, get_file_mtime, is_file_writable,
    list_files, opened_urls, read_file, read_file_as_base64, write_file, write_file_binary,
};
use commands::print::{create_pdf, macos_major_version, print_webview};
use commands::svg::rasterize_svg;
use commands::window::{
    flush_window_state, force_close_window, save_window_state, save_window_state_debounced,
};
use state::{MissingFiles, OpenedUrls, WindowState};

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
/// Sandboxed / package-managed installs (Flatpak, Snap, Windows Store)
/// own the update lifecycle themselves (`flatpak update`, `snap refresh`,
/// Microsoft Store). Running the in-app updater there would either fail
/// (read-only filesystem) or conflict with the system updater, so we
/// disable it.
fn updater_enabled() -> bool {
    if std::path::Path::new("/.flatpak-info").exists() {
        return false;
    }
    if env::var_os("SNAP").is_some() {
        return false;
    }
    // MSIX-packaged apps always run from
    // `C:\Program Files\WindowsApps\<PackageFamilyName>_…\`.
    #[cfg(target_os = "windows")]
    if std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_owned()))
        .is_some_and(|path| path.contains("\\WindowsApps\\"))
    {
        return false;
    }
    true
}

#[tauri::command]
fn is_updater_enabled() -> bool {
    updater_enabled()
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

/// Partition raw command-line arguments into existing files (canonicalized,
/// deduped, order preserved) and unresolvable names (original spelling,
/// deduped). Deduping here guarantees a file given twice — or once via
/// different spellings of the same path — is only ever opened once.
///
/// `dunce::canonicalize` (not `fs::canonicalize`) so paths never carry the
/// Windows `\\?\` verbatim prefix — it would leak into resolved relative
/// links and is rejected by OS-shell APIs (`openPath` / `ShellExecute`).
fn resolve_cli_files(args: impl Iterator<Item = String>) -> (Vec<String>, Vec<String>) {
    let mut opened: Vec<String> = Vec::new();
    let mut missing: Vec<String> = Vec::new();
    for arg in args {
        match dunce::canonicalize(&arg) {
            Ok(p) => {
                let p = p.to_string_lossy().into_owned();
                if !opened.contains(&p) {
                    opened.push(p);
                }
            }
            Err(_) => {
                if !missing.contains(&arg) {
                    missing.push(arg);
                }
            }
        }
    }
    (opened, missing)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    configure_platform();
    let (cli_file, cli_missing) = resolve_cli_files(env::args().skip(1));

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
        .manage(MissingFiles(std::sync::Mutex::new(cli_missing)))
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
            canonicalize_paths,
            save_window_state,
            force_close_window,
            create_pdf,
            print_webview,
            macos_major_version,
            rasterize_svg,
            is_updater_enabled
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

    // Single match on the by-value RunEvent: with separate `if let`s the Opened
    // arm partially moves `_event` (it owns `urls: Vec<Url>`) and the later Exit
    // check fails with E0382. That arm is cfg'd out on Linux/Windows, so the bug
    // only surfaces when compiling for macOS/iOS/Android — keep both checks in
    // one match so every target shares the dispatch.
    app.run(|_app, _event| match _event {
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        tauri::RunEvent::Opened { urls } => {
            use tauri::Emitter;
            // Canonicalized so a file already open under a different spelling
            // is recognized and not opened a second time.
            let paths: Vec<String> = canonicalize_paths(urls.iter().map(url_to_path).collect());
            _app.state::<OpenedUrls>()
                .0
                .lock()
                .unwrap_or_else(|p| p.into_inner())
                .extend(paths.clone());
            let _ = _app.emit("open-file", paths);
        }
        tauri::RunEvent::Exit => {
            // Settle any debounced window-state write on the way out; the
            // trailing timer would otherwise lose the final geometry.
            flush_window_state(_app);
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn resolve_cli_files_partitions_and_dedupes() {
        let dir = tempdir().unwrap();
        let a = dir.path().join("a.md");
        let b = dir.path().join("b.md");
        std::fs::write(&a, "a").unwrap();
        std::fs::write(&b, "b").unwrap();
        let canonical_a = dunce::canonicalize(&a)
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let canonical_b = dunce::canonicalize(&b)
            .unwrap()
            .to_string_lossy()
            .into_owned();

        let (opened, missing) = resolve_cli_files(
            vec![
                a.to_string_lossy().into_owned(),
                b.to_string_lossy().into_owned(),
                // The same file again, spelled differently.
                dir.path()
                    .join(".")
                    .join("a.md")
                    .to_string_lossy()
                    .into_owned(),
                "/nonexistent/nope.md".to_string(),
                // The same missing name again.
                "/nonexistent/nope.md".to_string(),
            ]
            .into_iter(),
        );

        assert_eq!(opened, vec![canonical_a, canonical_b]);
        assert_eq!(missing, vec!["/nonexistent/nope.md".to_string()]);
    }

    #[test]
    fn resolve_cli_files_keeps_original_spelling_and_order() {
        let dir = tempdir().unwrap();
        let b = dir.path().join("b.md");
        std::fs::write(&b, "b").unwrap();

        let (opened, missing) = resolve_cli_files(
            vec![
                "relative-nope.md".to_string(),
                b.to_string_lossy().into_owned(),
            ]
            .into_iter(),
        );

        assert_eq!(
            opened,
            vec![dunce::canonicalize(&b)
                .unwrap()
                .to_string_lossy()
                .into_owned()]
        );
        assert_eq!(missing, vec!["relative-nope.md".to_string()]);
    }

    #[test]
    fn resolve_cli_files_handles_empty_input() {
        let (opened, missing) = resolve_cli_files(std::iter::empty());
        assert!(opened.is_empty());
        assert!(missing.is_empty());
    }
}
