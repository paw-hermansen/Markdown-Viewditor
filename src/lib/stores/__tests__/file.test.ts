import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("$lib/stores/settings.svelte", () => ({
  settingsState: {
    recentFiles: [],
    lastOpenedFile: null,
  },
  updateRecentFiles: vi.fn(),
  updateLastOpenedFile: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  fileState,
  openFile,
  saveFile,
  saveFileAs,
  readFile,
  closeFile,
  clearError,
  getFileName,
  getRecentFiles,
} from "../file.svelte";

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);
const mockSave = vi.mocked(save);

describe("file store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileState.currentFile = null;
    fileState.recentFiles = [];
    fileState.isLoading = false;
    fileState.error = null;
  });

  describe("getFileName", () => {
    it("should extract filename from unix path", () => {
      expect(getFileName("/home/user/docs/file.md")).toBe("file.md");
    });

    it("should extract filename from path with backslashes", () => {
      expect(getFileName("C:/Users/docs/file.md")).toBe("file.md");
    });

    it("should return the path if no separator found", () => {
      expect(getFileName("file.md")).toBe("file.md");
    });
  });

  describe("getRecentFiles", () => {
    it("should return a copy of recent files", () => {
      fileState.recentFiles = ["/a.md", "/b.md"];
      const result = getRecentFiles();
      expect(result).toEqual(["/a.md", "/b.md"]);
      expect(result).not.toBe(fileState.recentFiles);
    });

    it("should return empty array when no recent files", () => {
      expect(getRecentFiles()).toEqual([]);
    });
  });

  describe("clearError", () => {
    it("should clear the error state", () => {
      fileState.error = "some error";
      clearError();
      expect(fileState.error).toBeNull();
    });
  });

  describe("closeFile", () => {
    it("should reset currentFile and error", () => {
      fileState.currentFile = "/some/file.md";
      fileState.error = "some error";
      closeFile();
      expect(fileState.currentFile).toBeNull();
      expect(fileState.error).toBeNull();
    });
  });

  describe("openFile", () => {
    it("should return null when dialog is cancelled", async () => {
      mockOpen.mockResolvedValue(null);
      const result = await openFile();
      expect(result).toBeNull();
      expect(fileState.isLoading).toBe(false);
    });

    it("should read file content when path is selected", async () => {
      mockOpen.mockResolvedValue("/test/file.md");
      mockInvoke.mockResolvedValue("# Hello");
      const result = await openFile();
      expect(result).toBe("# Hello");
      expect(mockInvoke).toHaveBeenCalledWith("read_file", {
        path: "/test/file.md",
      });
      expect(fileState.currentFile).toBe("/test/file.md");
    });

    it("should set error on failure", async () => {
      mockOpen.mockResolvedValue("/test/file.md");
      mockInvoke.mockRejectedValue(new Error("read failed"));
      const result = await openFile();
      expect(result).toBeNull();
      expect(fileState.error).toBe("read failed");
    });

    it("should set loading state during operation", async () => {
      mockOpen.mockResolvedValue("/test/file.md");
      let resolveInvoke: (value: string) => void;
      mockInvoke.mockReturnValue(
        new Promise<string>((resolve) => {
          resolveInvoke = resolve;
        }),
      );

      const promise = openFile();

      await vi.waitFor(() => {
        expect(fileState.isLoading).toBe(true);
      });

      resolveInvoke!("content");
      await promise;
      expect(fileState.isLoading).toBe(false);
    });
  });

  describe("saveFile", () => {
    it("should save file and return true on success", async () => {
      mockInvoke.mockResolvedValue(undefined);
      const result = await saveFile("/test/file.md", "# Content");
      expect(result).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        path: "/test/file.md",
        content: "# Content",
      });
      expect(fileState.currentFile).toBe("/test/file.md");
    });

    it("should return false and set error on failure", async () => {
      mockInvoke.mockRejectedValue(new Error("write failed"));
      const result = await saveFile("/test/file.md", "# Content");
      expect(result).toBe(false);
      expect(fileState.error).toBe("write failed");
    });
  });

  describe("saveFileAs", () => {
    it("should return null when dialog is cancelled", async () => {
      mockSave.mockResolvedValue(null);
      const result = await saveFileAs("# Content");
      expect(result).toBeNull();
    });

    it("should save to selected path and return it", async () => {
      mockSave.mockResolvedValue("/new/file.md");
      mockInvoke.mockResolvedValue(undefined);
      const result = await saveFileAs("# Content");
      expect(result).toBe("/new/file.md");
      expect(mockInvoke).toHaveBeenCalledWith("write_file", {
        path: "/new/file.md",
        content: "# Content",
      });
      expect(fileState.currentFile).toBe("/new/file.md");
    });

    it("should set error on failure", async () => {
      mockSave.mockResolvedValue("/new/file.md");
      mockInvoke.mockRejectedValue(new Error("save failed"));
      const result = await saveFileAs("# Content");
      expect(result).toBeNull();
      expect(fileState.error).toBe("save failed");
    });
  });

  describe("readFile", () => {
    it("should read file content", async () => {
      mockInvoke.mockResolvedValue("# Hello");
      const result = await readFile("/test/file.md");
      expect(result).toBe("# Hello");
      expect(fileState.currentFile).toBe("/test/file.md");
    });

    it("should return null and set error on failure", async () => {
      mockInvoke.mockRejectedValue(new Error("not found"));
      const result = await readFile("/test/file.md");
      expect(result).toBeNull();
      expect(fileState.error).toBe("not found");
    });
  });
});
