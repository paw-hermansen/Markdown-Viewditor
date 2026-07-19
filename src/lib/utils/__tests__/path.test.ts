import { describe, it, expect } from "vitest";
import { resolveLink } from "../path";

describe("resolveLink", () => {
  describe("anchors", () => {
    it("classifies '#section' as an anchor", () => {
      const r = resolveLink("/a/b.md", "#section");
      expect(r).toEqual({ kind: "anchor", id: "section" });
    });

    it("classifies '#' (empty anchor) as an anchor", () => {
      const r = resolveLink("/a/b.md", "#");
      expect(r).toEqual({ kind: "anchor", id: "" });
    });
  });

  describe("URLs", () => {
    const urlCases = [
      "https://google.com",
      "http://example.com/path?q=1",
      "mailto:foo@bar.com",
      "file:///etc/hosts",
      "slack://team/channel",
      "vscode://file/x/y",
      "ftp://example.com/file",
    ];
    for (const href of urlCases) {
      it(`classifies '${href}' as a url`, () => {
        const r = resolveLink("/a/b.md", href);
        expect(r).toEqual({ kind: "url", href });
      });
    }

    it("classifies a single-letter scheme followed by // as a url (file://)", () => {
      // `file:` is a single-letter-prefix edge case; the // after : disambiguates.
      const r = resolveLink("/a/b.md", "file:///etc/hosts");
      expect(r.kind).toBe("url");
    });
  });

  describe("Windows drive-absolute hrefs", () => {
    it("classifies 'C:\\\\Users\\file.md' as a local-path with forward slashes", () => {
      const r = resolveLink("C:\\base\\current.md", "C:\\Users\\file.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "C:/Users/file.md",
      });
    });

    it("classifies 'C:/Users/file.md' as a local-path", () => {
      const r = resolveLink("C:\\base\\current.md", "C:/Users/file.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "C:/Users/file.md",
      });
    });

    it("classifies a different drive ('G:\\\\MyFolder\\\\Another.md') as local-path", () => {
      const r = resolveLink(
        "C:\\Users\\paw\\repos\\Markdown-Viewditor\\Example.md",
        "G:\\MyFolder\\Another.md",
      );
      expect(r).toEqual({
        kind: "local-path",
        path: "G:/MyFolder/Another.md",
      });
    });

    it("does NOT classify 'C:\\\\foo' as a url (regression: single-letter scheme)", () => {
      const r = resolveLink("/base.md", "C:\\foo");
      expect(r.kind).toBe("local-path");
    });
  });

  describe("UNC hrefs", () => {
    it("classifies '\\\\server\\share\\file.md' as a local-path", () => {
      const r = resolveLink("/base.md", "\\\\server\\share\\file.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "//server/share/file.md",
      });
    });

    it("classifies '//server/share/file.md' as a local-path", () => {
      const r = resolveLink("/base.md", "//server/share/file.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "//server/share/file.md",
      });
    });

    it("normalizes mixed slashes in UNC hrefs", () => {
      const r = resolveLink("/base.md", "\\\\server\\share/sub/file.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "//server/share/sub/file.md",
      });
    });
  });

  describe("Unix-absolute hrefs", () => {
    it("classifies '/etc/hosts' as a local-path", () => {
      const r = resolveLink("/a/b.md", "/etc/hosts");
      expect(r).toEqual({ kind: "local-path", path: "/etc/hosts" });
    });

    it("classifies '/Volumes/Data/file.md' (macOS mounted disk) as a local-path", () => {
      const r = resolveLink("/Users/jane/x.md", "/Volumes/Data/file.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "/Volumes/Data/file.md",
      });
    });
  });

  describe("relative hrefs against Windows base files", () => {
    it("resolves 'README.md' against a Windows base dir", () => {
      const r = resolveLink(
        "C:\\Users\\paw\\repos\\Markdown-Viewditor\\Example.md",
        "README.md",
      );
      expect(r).toEqual({
        kind: "local-path",
        path: "C:/Users/paw/repos/Markdown-Viewditor/README.md",
      });
    });

    it("resolves '..\\\\home.md' (parent dir, backslash form)", () => {
      const r = resolveLink(
        "C:\\Users\\paw\\repos\\Markdown-Viewditor\\Example.md",
        "..\\home.md",
      );
      expect(r).toEqual({
        kind: "local-path",
        path: "C:/Users/paw/repos/home.md",
      });
    });

    it("resolves '../home.md' (parent dir, forward-slash form)", () => {
      const r = resolveLink(
        "C:\\Users\\paw\\repos\\Markdown-Viewditor\\Example.md",
        "../home.md",
      );
      expect(r).toEqual({
        kind: "local-path",
        path: "C:/Users/paw/repos/home.md",
      });
    });

    it("resolves 'sub/file.md' (subdirectory)", () => {
      const r = resolveLink("C:\\Users\\paw\\r\\Example.md", "sub/file.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "C:/Users/paw/r/sub/file.md",
      });
    });

    it("does not prepend '/C:/' (the original Windows bug)", () => {
      const r = resolveLink(
        "C:\\Users\\paw\\repos\\Markdown-Viewditor\\Example.md",
        "README.md",
      );
      expect(r.kind).toBe("local-path");
      if (r.kind === "local-path") {
        expect(r.path).toBe("C:/Users/paw/repos/Markdown-Viewditor/README.md");
        expect(r.path).not.toMatch(/^\/C:/);
      }
    });
  });

  describe("relative hrefs against Unix base files", () => {
    it("resolves 'README.md' against a Linux base dir", () => {
      const r = resolveLink("/home/devel/r/Example.md", "README.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "/home/devel/r/README.md",
      });
    });

    it("resolves '../home.md' (parent dir)", () => {
      const r = resolveLink("/home/devel/r/Example.md", "../home.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "/home/devel/home.md",
      });
    });

    it("resolves '../../home.md' (two parents up)", () => {
      const r = resolveLink("/home/devel/r/Example.md", "../../home.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "/home/home.md",
      });
    });

    it("resolves a macOS base path", () => {
      const r = resolveLink("/Users/jane/r/Example.md", "README.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "/Users/jane/r/README.md",
      });
    });

    it("does not pop past the Unix root with excessive '..'", () => {
      const r = resolveLink("/a/b/c.md", "../../../../x.md");
      expect(r).toEqual({ kind: "local-path", path: "/x.md" });
    });
  });

  describe("relative hrefs against UNC base files", () => {
    it("resolves 'README.md' against a UNC base dir", () => {
      const r = resolveLink("\\\\nas\\share\\dir\\Example.md", "README.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "//nas/share/dir/README.md",
      });
    });

    it("resolves '../home.md' (parent dir within the share)", () => {
      const r = resolveLink("\\\\nas\\share\\dir\\Example.md", "../home.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "//nas/share/home.md",
      });
    });

    it("does not pop past the UNC share root with excessive '..'", () => {
      const r = resolveLink(
        "\\\\nas\\share\\dir\\sub\\Example.md",
        "../../../../../x.md",
      );
      expect(r).toEqual({
        kind: "local-path",
        path: "//nas/share/x.md",
      });
    });
  });

  describe("degenerate cases", () => {
    it("falls back to url when no base file is provided for a relative href", () => {
      const r = resolveLink(null, "README.md");
      expect(r).toEqual({ kind: "url", href: "README.md" });
    });

    it("returns url for an empty href", () => {
      const r = resolveLink("/a/b.md", "");
      expect(r).toEqual({ kind: "url", href: "" });
    });

    it("handles '.' (current dir) href", () => {
      const r = resolveLink("/a/b/c.md", ".");
      expect(r).toEqual({ kind: "local-path", path: "/a/b" });
    });
  });

  describe("percent-encoded hrefs (as produced by markdown-it)", () => {
    // markdown-it URL-encodes backslashes in link destinations, so a user
    // writing `C:\Users\file.md` arrives here as `C:%5CUsers%5Cfile.md`.
    // Classification must decode these before checking for a drive prefix,
    // otherwise `C:` is mistaken for a single-letter URL scheme.
    it("decodes %5C backslashes and classifies 'C:%5CUsers\\file.md' as a drive path", () => {
      const r = resolveLink(null, "C:%5CUsers%5Cfile.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "C:/Users/file.md",
      });
    });

    it("decodes %5C in UNC hrefs", () => {
      const r = resolveLink(null, "%5C%5Cserver%5Cshare%5Cfile.md");
      expect(r).toEqual({
        kind: "local-path",
        path: "//server/share/file.md",
      });
    });

    it("preserves the original (encoded) href for actual URLs", () => {
      // A URL with a percent-encoded space should keep its encoded form so the
      // browser/OS receives the properly percent-encoded URL.
      const r = resolveLink("/base.md", "https://example.com/foo%20bar");
      expect(r).toEqual({
        kind: "url",
        href: "https://example.com/foo%20bar",
      });
    });

    it("decodes percent-encoded characters in anchor ids", () => {
      const r = resolveLink("/base.md", "#foo%20bar");
      expect(r).toEqual({ kind: "anchor", id: "foo bar" });
    });

    it("leaves malformed percent-encoding intact (no throw)", () => {
      // %ZZ is not a valid percent-encoding; decodeURIComponent throws.
      const r = resolveLink("/base.md", "https://example.com/%ZZ");
      expect(r.kind).toBe("url");
      if (r.kind === "url") {
        expect(r.href).toBe("https://example.com/%ZZ");
      }
    });
  });
});
