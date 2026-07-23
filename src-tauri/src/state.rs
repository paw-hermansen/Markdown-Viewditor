use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WindowState {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

#[derive(Serialize, Deserialize)]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

pub struct InitialFile(pub Mutex<Option<String>>);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_state_serializes_to_json() {
        let state = WindowState {
            x: 100.0,
            y: 200.0,
            width: 1200.0,
            height: 800.0,
            maximized: false,
        };
        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("\"x\":100.0"));
        assert!(json.contains("\"y\":200.0"));
        assert!(json.contains("\"width\":1200.0"));
        assert!(json.contains("\"height\":800.0"));
        assert!(json.contains("\"maximized\":false"));
    }

    #[test]
    fn window_state_deserializes_from_json() {
        let json = r#"{"x":50.0,"y":75.0,"width":1024.0,"height":768.0,"maximized":true}"#;
        let state: WindowState = serde_json::from_str(json).unwrap();
        assert_eq!(state.x, 50.0);
        assert_eq!(state.y, 75.0);
        assert_eq!(state.width, 1024.0);
        assert_eq!(state.height, 768.0);
        assert!(state.maximized);
    }

    #[test]
    fn window_state_round_trip() {
        let original = WindowState {
            x: -10.5,
            y: 30.25,
            width: 800.0,
            height: 600.0,
            maximized: true,
        };
        let json = serde_json::to_string(&original).unwrap();
        let restored: WindowState = serde_json::from_str(&json).unwrap();
        assert_eq!(original.x, restored.x);
        assert_eq!(original.y, restored.y);
        assert_eq!(original.width, restored.width);
        assert_eq!(original.height, restored.height);
        assert_eq!(original.maximized, restored.maximized);
    }

    #[test]
    fn file_info_serializes_to_json() {
        let info = FileInfo {
            path: "/home/user/test.md".to_string(),
            name: "test.md".to_string(),
            is_dir: false,
            size: 1024,
        };
        let json = serde_json::to_string(&info).unwrap();
        assert!(json.contains("\"path\":\"/home/user/test.md\""));
        assert!(json.contains("\"name\":\"test.md\""));
        assert!(json.contains("\"is_dir\":false"));
        assert!(json.contains("\"size\":1024"));
    }

    #[test]
    fn file_info_deserializes_from_json() {
        let json = r#"{"path":"/tmp","name":"tmp","is_dir":true,"size":0}"#;
        let info: FileInfo = serde_json::from_str(json).unwrap();
        assert_eq!(info.path, "/tmp");
        assert_eq!(info.name, "tmp");
        assert!(info.is_dir);
        assert_eq!(info.size, 0);
    }

    #[test]
    fn file_info_round_trip() {
        let original = FileInfo {
            path: "/home/user/doc.md".to_string(),
            name: "doc.md".to_string(),
            is_dir: false,
            size: 512,
        };
        let json = serde_json::to_string(&original).unwrap();
        let restored: FileInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(original.path, restored.path);
        assert_eq!(original.name, restored.name);
        assert_eq!(original.is_dir, restored.is_dir);
        assert_eq!(original.size, restored.size);
    }

    #[test]
    fn initial_file_returns_some_on_first_take() {
        let initial = InitialFile(Mutex::new(Some("/path/to/file.md".to_string())));
        let result = initial.0.lock().unwrap().take();
        assert_eq!(result, Some("/path/to/file.md".to_string()));
    }

    #[test]
    fn initial_file_returns_none_on_second_take() {
        let initial = InitialFile(Mutex::new(Some("/path/to/file.md".to_string())));
        let _ = initial.0.lock().unwrap().take();
        let result = initial.0.lock().unwrap().take();
        assert_eq!(result, None);
    }
}
