//! SVG → PNG rasterization on the Rust side.
//!
//! `rasterize_svg` is the fallback path for Linux Tauri builds: WebKitGTK
//! refuses to decode SVG data URIs through the image element, so the
//! frontend's `Image.src = data:image/svg+xml,…` path fails. We bypass
//! the WebView entirely with `resvg`.
//!
//! On Windows/macOS the command exists but returns
//! `AppError::Svg("SVG rasterization unavailable on this platform")`. The
//! frontend never calls it there — it uses the working `Image` fallback
//! — but the stub keeps the IPC contract uniform across platforms.
//!
//! Default `resvg` features are enabled (text, filter, pattern, image)
//! so the rasterized output matches the browser's fidelity on every SVG
//! construct, including `<text>` and `<filter>`.

use resvg::tiny_skia;
use usvg::{Options, Tree};

use crate::error::AppError;

/// Render `svg` into a PNG whose pixel dimensions are exactly
/// `width*scale` × `height*scale`. `width`/`height` are the SVG's intrinsic
/// CSS-pixel dimensions (matches its `width=` / `height=` attributes); the
/// `scale` multiplier acts as a DPI multiplier so the PNG is sharper than
/// a single 96-DPI raster. The viewBox is mapped to the full pixmap so
/// the rendered content fills every pixel of the output.
///
/// The SVG must declare its namespace (`xmlns="http://www.w3.org/2000/svg"`
/// on the root `<svg>`) so usvg's parser can disambiguate SVG elements
/// from XML defaults. The frontend guarantees this before invoking.
#[tauri::command]
pub fn rasterize_svg(
    svg: String,
    width: u32,
    height: u32,
    scale: u32,
) -> Result<Vec<u8>, AppError> {
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (svg, width, height, scale);
        return Err(AppError::Svg(
            "SVG rasterization unavailable on this platform".to_string(),
        ));
    }

    #[cfg(target_os = "linux")]
    {
        if width == 0 || height == 0 {
            return Err(AppError::Svg(format!(
                "invalid dimensions: {width}x{height}"
            )));
        }
        if scale == 0 {
            return Err(AppError::Svg(format!("invalid scale: {scale}")));
        }

        let tree = Tree::from_str(&svg, &Options::default())
            .map_err(|e| AppError::Svg(format!("usvg parse failed: {e}")))?;

        // The output PNG is width*scale × height*scale pixels; the SVG's
        // intrinsic CSS size is still width × height for ODT layout
        // purposes. The transform below makes the SVG's viewBox fill the
        // entire pixmap at the higher pixel density.
        let target_w = width.saturating_mul(scale);
        let target_h = height.saturating_mul(scale);
        let mut pixmap = tiny_skia::Pixmap::new(target_w, target_h).ok_or_else(|| {
            AppError::Svg(format!(
                "cannot allocate {target_w}x{target_h} bitmap"
            ))
        })?;

        // usvg sizes the tree in "user units" (= viewBox dimensions when
        // present). We map those to the full pixmap so every output pixel
        // is meaningful — naively dividing by `width` would only paint the
        // top-left `1/scale`² of the bitmap.
        let src_size = tree.size();
        if src_size.width() <= 0.0 || src_size.height() <= 0.0 {
            return Err(AppError::Svg("SVG has zero intrinsic size".to_string()));
        }
        let target_w_f = width.saturating_mul(scale) as f32;
        let target_h_f = height.saturating_mul(scale) as f32;
        let sx = target_w_f / src_size.width();
        let sy = target_h_f / src_size.height();
        let transform = tiny_skia::Transform::from_scale(sx, sy);

        resvg::render(
            &tree,
            transform,
            &mut pixmap.as_mut(),
        );

        pixmap
            .encode_png()
            .map_err(|e| AppError::Svg(format!("PNG encode failed: {e}")))
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    fn decode_png_size(bytes: &[u8]) -> (u32, u32) {
        assert_eq!(&bytes[..8], &[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        // IHDR width is 4 bytes BE at offset 16, height at offset 20.
        let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
        let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
        (w, h)
    }

    /// Render the SVG and decode the PNG so we can inspect actual pixel
    /// content (file size alone is misleading — uniform-color PNGs can
    /// compress to a few hundred bytes).
    fn rasterize_to_pixels(
        svg: &str,
        width: u32,
        height: u32,
        scale: u32,
    ) -> tiny_skia::Pixmap {
        let png = rasterize_svg(svg.to_string(), width, height, scale).expect("rasterize");
        let (w, h) = decode_png_size(&png);
        let pixmap =
            tiny_skia::Pixmap::decode_png(&png).expect("decode PNG that resvg just produced");
        assert_eq!((pixmap.width(), pixmap.height()), (w, h));
        pixmap
    }

    #[test]
    fn rasterizes_basic_svg() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>"#;
        let png = rasterize_svg(svg.to_string(), 32, 32, 1).expect("rasterize");
        let (w, h) = decode_png_size(&png);
        assert_eq!((w, h), (32, 32));
    }

    #[test]
    fn output_dimensions_equal_intrinsic_times_scale() {
        // The animated SVG from the example: viewBox 100×40, intrinsic 150×60,
        // rasterized at scale 2 must produce a 300×120 PNG.
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="150" height="60" viewBox="0 30 100 40">
            <ellipse id="outer" cx="50" cy="50" rx="35" ry="20" fill="#4fd1ff"/>
        </svg>"##;
        let png = rasterize_svg(svg.to_string(), 150, 60, 2).expect("rasterize");
        let (w, h) = decode_png_size(&png);
        assert_eq!((w, h), (300, 120));
    }

    #[test]
    fn fills_entire_pixmap_at_scale_2() {
        // The old bug: scale by `width` instead of `width*scale` left the
        // viewBox content occupying only the upper-left quarter of the
        // pixmap. A 32×32 SVG → 64×64 PNG with a solid rect must fill
        // every pixel, not just the top-left 32×32.
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
            <rect width="32" height="32" fill="#ff0000"/>
        </svg>"##;
        let pixmap = rasterize_to_pixels(svg, 32, 32, 2);
        assert_eq!((pixmap.width(), pixmap.height()), (64, 64));
        // Sample four corners + center; every one must be opaque red.
        for (x, y) in [(0, 0), (63, 0), (0, 63), (63, 63), (32, 32)] {
            let p = pixmap.pixel(x, y).unwrap();
            assert!(
                p.red() > 200 && p.alpha() > 200,
                "pixel at ({x},{y}) is not opaque red — got rgba({},{},{},{})",
                p.red(),
                p.green(),
                p.blue(),
                p.alpha(),
            );
        }
    }

    #[test]
    fn accepts_svg_without_xmlns_browsers_are_strict_only_for_namespace_prefixes() {
        // usvg's parser is lenient about the root SVG namespace — it
        // defaults to the SVG namespace if missing. The frontend
        // nevertheless injects xmlns for consistency with browsers.
        let svg = r##"<svg width="32" height="32"><rect width="32" height="32"/></svg>"##;
        let png = rasterize_svg(svg.to_string(), 32, 32, 1).expect("parse without xmlns");
        let (w, h) = decode_png_size(&png);
        assert_eq!((w, h), (32, 32));
    }

    #[test]
    fn rejects_svg_with_undeclared_xlink_prefix() {
        // u<nses xmlns:xlink — `xlink:href` is a common-attribute-prefixed
        // reference (e.g. `<animate xlink:href="#id">`). Without the
        // xlink namespace declaration the strict XML parser rejects it.
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
            <animate xlink:href="#x" attributeName="rx" values="0;1;0" dur="2s"/>
        </svg>"##;
        let err = rasterize_svg(svg.to_string(), 32, 32, 1).unwrap_err();
        assert!(
            err.to_string().contains("usvg parse failed"),
            "expected usvg parse failure, got: {err}"
        );
    }

    #[test]
    fn accepts_svg_with_xlink_namespace() {
        // Add the xlink namespace and the same SVG parses fine.
        let svg = r##"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="32" height="32">
            <animate xlink:href="#x" attributeName="rx" values="0;1;0" dur="2s"/>
        </svg>"##;
        let png = rasterize_svg(svg.to_string(), 32, 32, 1).expect("parse with xlink");
        let (w, h) = decode_png_size(&png);
        assert_eq!((w, h), (32, 32));
    }

    #[test]
    fn rejects_zero_dimensions() {
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"/>";
        let err = rasterize_svg(svg.to_string(), 0, 10, 1).unwrap_err();
        assert!(err.to_string().contains("invalid dimensions"));
    }

    #[test]
    fn rejects_zero_scale() {
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"10\" height=\"10\"/>";
        let err = rasterize_svg(svg.to_string(), 10, 10, 0).unwrap_err();
        assert!(err.to_string().contains("invalid scale"));
    }
}