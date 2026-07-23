use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Not found: {0}")]
    #[allow(dead_code)]
    NotFound(String),
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
}
