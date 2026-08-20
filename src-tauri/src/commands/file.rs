use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use tauri::State;

use crate::error::AppError;
use crate::state::{FileInfo, FileInfoMeta, OpenedUrls};

#[tauri::command]
pub fn opened_urls(state: State<OpenedUrls>) -> Vec<String> {
    state.0.lock().unwrap().drain(..).collect()
}

/// Decode raw bytes to a String, handling a UTF-8 BOM and falling back to a
/// lossless Latin-1 (ISO-8859-1) decode when the file is not valid UTF-8 so
/// content is never silently corrupted.
fn decode_bytes(bytes: Vec<u8>) -> Result<String, AppError> {
    let bytes = match bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        Some(rest) => rest,
        None => &bytes,
    };
    match std::str::from_utf8(bytes) {
        // Normalize Windows-style line endings so the editor, store, and
        // saved-content baseline all agree. CodeMirror already uses \n
        // internally; doing it here avoids redundant full-document replacements
        // and state drift when opening CRLF files.
        Ok(s) => Ok(s.to_string().replace("\r\n", "\n")),
        Err(utf8_err) => {
            let _ = utf8_err;
            Ok(bytes.iter().map(|b| *b as char).collect())
        }
    }
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, AppError> {
    let bytes = fs::read(&path)?;
    decode_bytes(bytes).map_err(|e| AppError::Encoding(e.to_string()))
}

/// Read raw file bytes and return them as a base64-encoded string. Unlike
/// `read_file`, this preserves binary data exactly — used by the HTML export
/// pipeline to inline `localimg://` image srcs as `data:` URIs.
#[tauri::command]
pub async fn read_file_as_base64(path: String) -> Result<String, AppError> {
    use base64::Engine;
    let bytes = fs::read(&path)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

/// Returns `true` if the file at `path` is writable by the current process.
/// On Unix this also probes by opening with write intent, catching ACL/owner
/// restrictions that `readonly()` misses.
#[tauri::command]
pub async fn is_file_writable(path: String) -> Result<bool, AppError> {
    let p = Path::new(&path);
    let metadata = match fs::metadata(p) {
        Ok(m) => m,
        Err(e) if e.kind() == ErrorKind::NotFound => return Ok(false),
        Err(e) => return Err(AppError::Io(e)),
    };
    if metadata.permissions().readonly() {
        return Ok(false);
    }
    #[cfg(unix)]
    {
        use std::fs::OpenOptions;
        if OpenOptions::new().write(true).open(p).is_err() {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Atomically write `content` to `path`, leaving a `<path>.bak` backup of the
/// previous version when it existed. A pre-write read-only check emits a typed
/// `AppError::ReadOnly` so the frontend can route to Save As.
#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), AppError> {
    let p = Path::new(&path);

    if let Ok(metadata) = fs::metadata(p) {
        if metadata.permissions().readonly() {
            return Err(AppError::ReadOnly(path));
        }
        #[cfg(unix)]
        {
            use std::fs::OpenOptions;
            if OpenOptions::new().write(true).open(p).is_err() {
                return Err(AppError::ReadOnly(path));
            }
        }

        // Best-effort backup next to the target.
        let bak = format!("{}.bak", path);
        let _ = fs::copy(p, &bak);
    }

    let tmp = format!("{}.tmp.{}", path, std::process::id());
    fs::write(&tmp, &content)?;

    match fs::rename(&tmp, p) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            match e.raw_os_error() {
                // EXDEV (cross-device): fall back to copy+delete (non-atomic)
                // so the write still succeeds on unusual mount layouts.
                Some(18) => {
                    fs::write(p, &content)?;
                    Ok(())
                }
                _ => Err(AppError::Io(e)),
            }
        }
    }
}

/// Atomically write binary `content` to `path`, leaving a `<path>.bak`
/// backup of the previous version when it existed. Same logic as `write_file`
/// but for opaque binary data (ODT, EPUB, etc.).
#[tauri::command]
pub async fn write_file_binary(path: String, content: Vec<u8>) -> Result<(), AppError> {
    let p = Path::new(&path);

    if let Ok(metadata) = fs::metadata(p) {
        if metadata.permissions().readonly() {
            return Err(AppError::ReadOnly(path));
        }
        #[cfg(unix)]
        {
            use std::fs::OpenOptions;
            if OpenOptions::new().write(true).open(p).is_err() {
                return Err(AppError::ReadOnly(path));
            }
        }

        let bak = format!("{}.bak", path);
        let _ = fs::copy(p, &bak);
    }

    let tmp = format!("{}.tmp.{}", path, std::process::id());
    fs::write(&tmp, &content)?;

    match fs::rename(&tmp, p) {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = fs::remove_file(&tmp);
            match e.raw_os_error() {
                Some(18) => {
                    fs::write(p, &content)?;
                    Ok(())
                }
                _ => Err(AppError::Io(e)),
            }
        }
    }
}

#[tauri::command]
pub async fn list_files(dir: String) -> Result<Vec<FileInfo>, AppError> {
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
pub async fn create_file(path: String) -> Result<(), AppError> {
    use std::fs::OpenOptions;
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|e| {
            if e.kind() == ErrorKind::AlreadyExists {
                AppError::AlreadyExists(path)
            } else {
                AppError::Io(e)
            }
        })?;
    drop(file);
    Ok(())
}

#[tauri::command]
pub async fn get_file_mtime(path: String) -> Result<u64, AppError> {
    let metadata = fs::metadata(&path)?;
    Ok(metadata
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64)
}

/// Fetch existence, mtime (ms), size and read-only flag in one call, used by
/// the frontend to detect external modification and to drive the read-only
/// indicator without extra round-trips.
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfoMeta, AppError> {
    match fs::metadata(&path) {
        Ok(metadata) => {
            let mtime_ms = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            let readonly = metadata.permissions().readonly();
            Ok(FileInfoMeta {
                exists: true,
                mtime_ms,
                size: metadata.len(),
                readonly,
            })
        }
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(FileInfoMeta {
            exists: false,
            mtime_ms: 0,
            size: 0,
            readonly: true,
        }),
        Err(e) => Err(AppError::Io(e)),
    }
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), AppError> {
    let metadata = std::fs::metadata(&path)?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(&path)?;
    } else {
        std::fs::remove_file(&path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    // --- read_file ---

    #[tokio::test]
    async fn read_file_reads_existing_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.md");
        std::fs::write(&file_path, "# Hello").unwrap();

        let result = read_file(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert_eq!(result, "# Hello");
    }

    #[tokio::test]
    async fn read_file_returns_error_for_missing_file() {
        let result = read_file("/nonexistent/path/file.md".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn read_file_strips_utf8_bom() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("bom.md");
        std::fs::write(&file_path, [0xEF, 0xBB, 0xBF])
            .unwrap();
        std::fs::write(&file_path, b"\xEF\xBB\xBF# No BOM").unwrap();

        let result = read_file(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert_eq!(result, "# No BOM");
    }

    #[tokio::test]
    async fn read_file_normalizes_crlf_to_lf() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("crlf.md");
        std::fs::write(&file_path, b"line1\r\nline2\r\n").unwrap();

        let result = read_file(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert_eq!(result, "line1\nline2\n");
    }

    #[tokio::test]
    async fn read_file_falls_back_to_latin1_for_non_utf8() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("latin1.md");
        // 0xE9 is 'é' in Latin-1, invalid as a UTF-8 continuation here.
        std::fs::write(&file_path, [b'h', b'i', 0xE9]).unwrap();

        let result = read_file(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert_eq!(result, "hi\u{00E9}");
    }

    // --- write_file ---

    #[tokio::test]
    async fn write_file_creates_file_with_content() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("output.md");

        write_file(
            file_path.to_string_lossy().to_string(),
            "Hello World".to_string(),
        )
        .await
        .unwrap();

        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "Hello World");
    }

    #[tokio::test]
    async fn write_file_overwrites_existing_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("overwrite.md");
        std::fs::write(&file_path, "old content").unwrap();

        write_file(
            file_path.to_string_lossy().to_string(),
            "new content".to_string(),
        )
        .await
        .unwrap();

        let content = std::fs::read_to_string(&file_path).unwrap();
        assert_eq!(content, "new content");
    }

    #[tokio::test]
    async fn write_file_creates_bak_when_overwriting() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("bak.md");
        std::fs::write(&file_path, "old content").unwrap();

        write_file(
            file_path.to_string_lossy().to_string(),
            "new content".to_string(),
        )
        .await
        .unwrap();

        let bak_path = dir.path().join("bak.md.bak");
        assert!(bak_path.exists());
        assert_eq!(std::fs::read_to_string(&bak_path).unwrap(), "old content");
    }

    #[tokio::test]
    async fn write_file_no_bak_for_new_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("fresh.md");

        write_file(
            file_path.to_string_lossy().to_string(),
            "content".to_string(),
        )
        .await
        .unwrap();

        assert!(!dir.path().join("fresh.md.bak").exists());
    }

    #[tokio::test]
    async fn write_file_leaves_no_temp_file_on_success() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("temp_check.md");

        write_file(
            file_path.to_string_lossy().to_string(),
            "content".to_string(),
        )
        .await
        .unwrap();

        let leftover: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .contains(&format!(".tmp.{}", std::process::id()))
            })
            .collect();
        assert!(leftover.is_empty());
    }

    #[tokio::test]
    async fn write_file_returns_error_for_invalid_path() {
        let result = write_file(
            "/nonexistent/dir/file.md".to_string(),
            "content".to_string(),
        )
        .await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn write_file_returns_readonly_error_for_ro_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("ro.md");
        std::fs::write(&file_path, "original").unwrap();
        let mut perms = std::fs::metadata(&file_path).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&file_path, perms).unwrap();

        let result = write_file(
            file_path.to_string_lossy().to_string(),
            "new".to_string(),
        )
        .await;
        assert!(matches!(result, Err(AppError::ReadOnly(_))));
        assert_eq!(std::fs::read_to_string(&file_path).unwrap(), "original");
    }

    // --- list_files ---

    #[tokio::test]
    async fn list_files_lists_directory_contents() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("a.md"), "a").unwrap();
        std::fs::write(dir.path().join("b.md"), "b").unwrap();

        let files = list_files(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        assert_eq!(files.len(), 2);
        let names: Vec<&str> = files.iter().map(|f| f.name.as_str()).collect();
        assert!(names.contains(&"a.md"));
        assert!(names.contains(&"b.md"));
    }

    #[tokio::test]
    async fn list_files_returns_empty_vec_for_empty_dir() {
        let dir = tempdir().unwrap();
        let files = list_files(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        assert_eq!(files.len(), 0);
    }

    #[tokio::test]
    async fn list_files_returns_error_for_missing_dir() {
        let result = list_files("/nonexistent/dir".to_string()).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn list_files_marks_directories_correctly() {
        let dir = tempdir().unwrap();
        std::fs::write(dir.path().join("file.txt"), "content").unwrap();
        std::fs::create_dir(dir.path().join("subdir")).unwrap();

        let files = list_files(dir.path().to_string_lossy().to_string())
            .await
            .unwrap();
        let file_entry = files.iter().find(|f| f.name == "file.txt").unwrap();
        let dir_entry = files.iter().find(|f| f.name == "subdir").unwrap();
        assert!(!file_entry.is_dir);
        assert!(dir_entry.is_dir);
    }

    // --- create_file ---

    #[tokio::test]
    async fn create_file_creates_empty_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("new_file.md");

        create_file(file_path.to_string_lossy().to_string())
            .await
            .unwrap();

        assert!(file_path.exists());
        assert_eq!(std::fs::metadata(&file_path).unwrap().len(), 0);
    }

    #[tokio::test]
    async fn create_file_fails_when_file_already_exists() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("exists.md");
        std::fs::write(&file_path, "data").unwrap();

        let result = create_file(file_path.to_string_lossy().to_string()).await;
        assert!(matches!(result, Err(AppError::AlreadyExists(_))));
        assert_eq!(std::fs::read_to_string(&file_path).unwrap(), "data");
    }

    // --- is_file_writable ---

    #[tokio::test]
    async fn is_file_writable_true_for_normal_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("w.md");
        std::fs::write(&file_path, "x").unwrap();

        let writable = is_file_writable(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(writable);
    }

    #[tokio::test]
    async fn is_file_writable_false_for_readonly_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("ro.md");
        std::fs::write(&file_path, "x").unwrap();
        let mut perms = std::fs::metadata(&file_path).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&file_path, perms).unwrap();

        let writable = is_file_writable(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(!writable);
    }

    #[tokio::test]
    async fn is_file_writable_false_for_missing_file() {
        let writable = is_file_writable("/nonexistent/file.md".to_string())
            .await
            .unwrap();
        assert!(!writable);
    }

    // --- get_file_info ---

    #[tokio::test]
    async fn get_file_info_returns_existing_file_meta() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("info.md");
        std::fs::write(&file_path, "hello world").unwrap();

        let info = get_file_info(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(info.exists);
        assert!(!info.readonly);
        assert_eq!(info.size, "hello world".len() as u64);
        assert!(info.mtime_ms > 0);
    }

    #[tokio::test]
    async fn get_file_info_reports_missing_as_not_exists() {
        let info = get_file_info("/nonexistent/file.md".to_string())
            .await
            .unwrap();
        assert!(!info.exists);
    }

    #[tokio::test]
    async fn get_file_info_reports_readonly_flag() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("roinfo.md");
        std::fs::write(&file_path, "x").unwrap();
        let mut perms = std::fs::metadata(&file_path).unwrap().permissions();
        perms.set_readonly(true);
        std::fs::set_permissions(&file_path, perms).unwrap();

        let info = get_file_info(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(info.exists);
        assert!(info.readonly);
    }

    #[tokio::test]
    async fn get_file_info_detects_size_change() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("size.md");
        std::fs::write(&file_path, "small").unwrap();
        let info1 = get_file_info(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        std::fs::write(&file_path, "much larger content").unwrap();
        let info2 = get_file_info(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(info2.size > info1.size);
    }

    // --- get_file_mtime ---

    #[tokio::test]
    async fn get_file_mtime_returns_valid_timestamp() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("mtime_test.md");
        std::fs::write(&file_path, "content").unwrap();

        let mtime = get_file_mtime(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(mtime > 0);
    }

    #[tokio::test]
    async fn get_file_mtime_changes_after_write() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("mtime_change.md");
        std::fs::write(&file_path, "first").unwrap();

        let mtime1 = get_file_mtime(file_path.to_string_lossy().to_string())
            .await
            .unwrap();

        std::thread::sleep(std::time::Duration::from_millis(50));
        std::fs::write(&file_path, "second").unwrap();

        let mtime2 = get_file_mtime(file_path.to_string_lossy().to_string())
            .await
            .unwrap();
        assert!(mtime2 >= mtime1);
    }

    #[tokio::test]
    async fn get_file_mtime_returns_error_for_missing_file() {
        let result = get_file_mtime("/nonexistent/path/file.md".to_string()).await;
        assert!(result.is_err());
    }

    // --- delete_file ---

    #[tokio::test]
    async fn delete_file_removes_file() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("to_delete.md");
        std::fs::write(&file_path, "delete me").unwrap();

        delete_file(file_path.to_string_lossy().to_string())
            .await
            .unwrap();

        assert!(!file_path.exists());
    }

    #[tokio::test]
    async fn delete_file_removes_directory_recursively() {
        let dir = tempdir().unwrap();
        let subdir = dir.path().join("to_delete_dir");
        std::fs::create_dir(&subdir).unwrap();
        std::fs::write(subdir.join("file.txt"), "content").unwrap();

        delete_file(subdir.to_string_lossy().to_string())
            .await
            .unwrap();

        assert!(!subdir.exists());
    }

    #[tokio::test]
    async fn delete_file_returns_error_for_missing_file() {
        let result = delete_file("/nonexistent/file.md".to_string()).await;
        assert!(result.is_err());
    }
}
