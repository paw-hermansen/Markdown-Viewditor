use tauri::State;

use crate::error::AppError;
use crate::state::{FileInfo, InitialFile};

#[tauri::command]
pub fn get_initial_file(state: State<InitialFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[tauri::command]
pub async fn read_file(path: String) -> Result<String, AppError> {
    Ok(std::fs::read_to_string(&path)?)
}

#[tauri::command]
pub async fn write_file(path: String, content: String) -> Result<(), AppError> {
    std::fs::write(&path, &content)?;
    Ok(())
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
    std::fs::File::create(&path)?;
    Ok(())
}

#[tauri::command]
pub async fn get_file_mtime(path: String) -> Result<u64, AppError> {
    let metadata = std::fs::metadata(&path)?;
    Ok(metadata
        .modified()?
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64)
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
    async fn write_file_returns_error_for_invalid_path() {
        let result = write_file(
            "/nonexistent/dir/file.md".to_string(),
            "content".to_string(),
        )
        .await;
        assert!(result.is_err());
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
