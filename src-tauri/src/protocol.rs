use tauri::http::Response;

pub fn localimg_protocol_handler(
    _ctx: tauri::UriSchemeContext<'_, tauri::Wry>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let raw = request.uri().path().to_string();
    std::thread::spawn(move || {
        let path = normalize_localimg_path(&raw);
        match std::fs::read(&path) {
            Ok(bytes) => {
                let mime = mime_guess::from_path(&path)
                    .first_or_octet_stream()
                    .to_string();
                responder.respond(
                    Response::builder()
                        .status(200)
                        .header("Content-Type", mime)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(bytes)
                        .unwrap(),
                );
            }
            Err(e) => {
                responder.respond(
                    Response::builder()
                        .status(404)
                        .body(e.to_string().into_bytes())
                        .unwrap(),
                );
            }
        }
    });
}

fn normalize_localimg_path(raw_uri_path: &str) -> String {
    let stripped = raw_uri_path.strip_prefix('/').unwrap_or(raw_uri_path);
    let decoded = percent_encoding::percent_decode_str(stripped)
        .decode_utf8_lossy()
        .to_string();
    normalize_decoded_path(&decoded)
}

fn normalize_decoded_path(decoded: &str) -> String {
    let leading_slash_count = decoded.bytes().take_while(|&b| b == b'/').count();
    let trimmed = &decoded[leading_slash_count..];

    if trimmed.len() >= 3
        && trimmed.as_bytes()[0].is_ascii_alphabetic()
        && trimmed.as_bytes()[1] == b':'
        && (trimmed.len() == 2 || trimmed.as_bytes()[2] == b'/')
    {
        return trimmed.to_string();
    }

    if leading_slash_count >= 2 {
        return format!("//{}", trimmed);
    }

    if leading_slash_count == 1 {
        return format!("/{}", trimmed);
    }

    decoded.to_string()
}

#[cfg(test)]
mod tests {
    use super::{normalize_decoded_path, normalize_localimg_path};

    #[test]
    fn drive_path_without_leading_slash_is_preserved() {
        assert_eq!(
            normalize_decoded_path("C:/Users/paw/file.png"),
            "C:/Users/paw/file.png"
        );
    }

    #[test]
    fn drive_path_with_one_leading_slash_has_it_stripped() {
        assert_eq!(
            normalize_decoded_path("/C:/Users/paw/file.png"),
            "C:/Users/paw/file.png"
        );
    }

    #[test]
    fn drive_path_with_two_leading_slashes_has_them_stripped() {
        assert_eq!(
            normalize_decoded_path("//C:/Users/paw/file.png"),
            "C:/Users/paw/file.png"
        );
    }

    #[test]
    fn drive_path_with_backslash_is_not_recognized_as_drive() {
        let result = normalize_decoded_path("C:\\Users");
        assert_eq!(result, "C:\\Users");
    }

    #[test]
    fn different_drive_letter_works() {
        assert_eq!(
            normalize_decoded_path("G:/MyFolder/Another.md"),
            "G:/MyFolder/Another.md"
        );
    }

    #[test]
    fn unc_path_with_two_leading_slashes_is_preserved() {
        assert_eq!(
            normalize_decoded_path("//server/share/file.png"),
            "//server/share/file.png"
        );
    }

    #[test]
    fn unc_path_with_extra_leading_slashes_collapses_to_two() {
        assert_eq!(
            normalize_decoded_path("///server/share/file.png"),
            "//server/share/file.png"
        );
    }

    #[test]
    fn unix_absolute_path_is_preserved() {
        assert_eq!(
            normalize_decoded_path("/home/devel/file.png"),
            "/home/devel/file.png"
        );
    }

    #[test]
    fn two_leading_slashes_treated_as_unc_even_if_unix_like() {
        assert_eq!(
            normalize_decoded_path("//home/devel/file.png"),
            "//home/devel/file.png"
        );
    }

    #[test]
    fn relative_path_returned_as_is() {
        assert_eq!(normalize_decoded_path("just-a-name.png"), "just-a-name.png");
    }

    #[test]
    fn empty_string_returned_as_is() {
        assert_eq!(normalize_decoded_path(""), "");
    }

    #[test]
    fn normalize_localimg_path_decodes_percent_encoded_spaces() {
        let result = normalize_localimg_path("/home/user/my%20file.png");
        assert_eq!(result, "home/user/my file.png");
    }

    #[test]
    fn normalize_localimg_path_decodes_percent_encoded_unicode() {
        let result = normalize_localimg_path("/home/user/%C3%A9l%C3%A8ve.png");
        assert_eq!(result, "home/user/élève.png");
    }

    #[test]
    fn normalize_localimg_path_handles_empty_path_after_scheme() {
        let result = normalize_localimg_path("/");
        assert_eq!(result, "");
    }
}
