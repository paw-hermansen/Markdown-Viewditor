export const APP_TITLE = "Markdown Viewditor";

export const MSG = {
  newUnsaved: "You have unsaved changes. Create a new file?",
  openUnsaved: "You have unsaved changes. Open a different file?",
  reloadUnsaved:
    "You have unsaved changes. Reload from disk and discard your changes?",
  exitUnsaved:
    "You have unsaved changes. Close the application and discard your changes?",
  reloadUpToDate: "The file is already up to date.",
  externalOverwrite:
    "This file has been modified by another application since it was last saved. Overwrite the external changes?",
  externalDeleted:
    "This file no longer exists on disk (it may have been deleted or moved). Use Save As to save your work to a new location.",
  externalModifiedClean:
    "This file has been modified by another application. Do you want to reload it?",
  externalModifiedDirty:
    "This file has been modified by another application. You also have unsaved changes. Reload and discard your changes?",
  saveAsOverwrite:
    "This file has been modified by another application since it was last saved. Overwrite the external changes?",
  readOnlySaveFailed:
    "This file is read-only. Use Save As to save your work to a different location.",
  saveFailed: "Failed to save the file.",
  openFailed: "Failed to open the file.",
  readFailed: "Failed to read the file.",
} as const;

export type ConfirmResult<T extends string = string> = T;
