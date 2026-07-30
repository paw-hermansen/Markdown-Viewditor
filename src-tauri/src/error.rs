use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    #[allow(dead_code)]
    NotFound(String),
    #[error("File is read-only: {0}")]
    ReadOnly(String),
    #[error("File already exists: {0}")]
    AlreadyExists(String),
    #[error("Encoding error: {0}")]
    Encoding(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::ser::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_error_displays_message() {
        let err = AppError::Io(std::io::Error::new(std::io::ErrorKind::NotFound, "file not found"));
        assert_eq!(err.to_string(), "IO error: file not found");
    }

    #[test]
    fn not_found_error_displays_path() {
        let err = AppError::NotFound("/tmp/missing.txt".to_string());
        assert_eq!(err.to_string(), "Not found: /tmp/missing.txt");
    }

    #[test]
    fn io_error_serializes_to_string() {
        let err = AppError::Io(std::io::Error::other("boom"));
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"IO error: boom\"");
    }

    #[test]
    fn not_found_error_serializes_to_string() {
        let err = AppError::NotFound("/missing".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"Not found: /missing\"");
    }

    #[test]
    fn io_error_from_std_io_error() {
        let io_err = std::io::Error::new(std::io::ErrorKind::PermissionDenied, "denied");
        let app_err: AppError = io_err.into();
        assert!(app_err.to_string().contains("denied"));
    }

    #[test]
    fn readonly_error_displays_path() {
        let err = AppError::ReadOnly("/tmp/ro.md".to_string());
        assert_eq!(err.to_string(), "File is read-only: /tmp/ro.md");
    }

    #[test]
    fn already_exists_error_displays_path() {
        let err = AppError::AlreadyExists("/tmp/exists.md".to_string());
        assert_eq!(err.to_string(), "File already exists: /tmp/exists.md");
    }

    #[test]
    fn encoding_error_displays_message() {
        let err = AppError::Encoding("invalid UTF-8".to_string());
        assert_eq!(err.to_string(), "Encoding error: invalid UTF-8");
    }

    #[test]
    fn readonly_error_serializes_to_string() {
        let err = AppError::ReadOnly("/ro".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"File is read-only: /ro\"");
    }

    #[test]
    fn already_exists_error_serializes_to_string() {
        let err = AppError::AlreadyExists("/e".to_string());
        let json = serde_json::to_string(&err).unwrap();
        assert_eq!(json, "\"File already exists: /e\"");
    }
}
