# TODO & Ideas

A mix of TODO items and ideas for future development.

## Naming

- [x] **New name**: "MarkdownViewditor" — Consider renaming the project

## Testing

- [x] **Add tests**: Consider if adding some kind of tests will improve the project

## Features

- [ ] **YAML frontmatter support**: Add yaml support for top-of-the-file header in "Claude Skill" files
- [x] **User-defined themes**: Add user-defined markdown themes
- [ ] **Export to PDF**: Save as pdf
- [ ] **No Minimum Width of Editor and Preview**: Allow the user to draw the splitter between the editor and the preview all the way to either side and back again. Has the same effect as clicking the Split/Edit/View buttons. The buttons should be re-ordered to fit the left/middle/right order of the splitter to View/Split/Edit.
- [x] **Start-up with Config from Latest Run**: When starting the app it opens in the same position and size as the latest run ended. Also the latest setting of View/Split/Edit is reused.
- [ ] **Ask before closing**: When closing the app and changes exists then the user should be asked if they want to save the file before leaving the app.
- [x] **Version**: Add a version number somewhere - could be with the name but could also be in the button info bar.
- [ ] **Linux auto-open on .md** The Markdown Viewditor does not show-up in the list of apps when selecting "Open With" on a `.md` file.

## Bug Fixes

- [x] **Toolbar tools**: Some of the toolbar tools do not work correct - check each tool

## Build

- [ ] **Build warning**: Look at build warning: "warning: variant `NotFound` is never constructed".
- [ ] **Build warning**: (!) Some chunks are larger than 500 kB after minification. Consider:
  - [ ] Using dynamic import() to code-split the application
  - [ ] Use build.rollupOptions.output.manualChunks to improve chunking: https://rollupjs.org/configuration-options/#output-manualchunks
  - [ ] djust chunk size limit for this warning via build.chunkSizeWarningLimit.
