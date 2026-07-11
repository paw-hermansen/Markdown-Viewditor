# Markdown Skill

> Markdown parsing, rendering, and editing for Tauri2 + Svelte applications.

## Recommended Stack

| Purpose                 | Library            | Why                              |
| ----------------------- | ------------------ | -------------------------------- |
| **Parsing**             | `markdown-it`      | Flexible, plugins, GFM support   |
| **Syntax Highlighting** | `highlight.js`     | Pure JS, no WASM, reliable, fast |
| **Editor**              | `@codemirror/view` | Best-in-class code editor        |
| **Frontmatter**         | `gray-matter`      | Standard YAML frontmatter        |
| **Svelte Integration**  | `mdsvex`           | Markdown in Svelte components    |

## markdown-it (Parsing)

```bash
npm install markdown-it @types/markdown-it
npm install markdown-it-task-lists markdown-it-anchor
```

```javascript
import MarkdownIt from "markdown-it";
import taskLists from "markdown-it-task-lists";
import anchor from "markdown-it-anchor";

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})
  .use(taskLists)
  .use(anchor);

const html = md.render("# Hello World\n\n- [x] Task 1\n- [ ] Task 2");
```

## highlight.js (Syntax Highlighting)

```bash
npm install highlight.js markdown-it-highlightjs
```

```javascript
import hljs from "highlight.js/lib/core";
import highlightjs from "markdown-it-highlightjs";

// Register only the languages you need
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);

// Integration with markdown-it
md.use(highlightjs, { hljs, auto: true, ignoreIllegals: true });
```

## CodeMirror 6 (Editor)

```bash
npm install @codemirror/view @codemirror/state @codemirror/lang-markdown
npm install @codemirror/language @codemirror/commands @codemirror/theme-one-dark
```

```javascript
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";

const state = EditorState.create({
  doc: "# Hello World",
  extensions: [
    basicSetup,
    markdown(),
    oneDark,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const content = update.state.doc.toString();
        // Handle content change
      }
    }),
  ],
});

const view = new EditorView({
  state,
  parent: document.getElementById("editor"),
});
```

## Frontmatter

```bash
npm install gray-matter
```

```javascript
import matter from "gray-matter";

const { data, content } = matter(`
---
title: My Post
tags: [markdown, editor]
date: 2024-01-01
---

# Content here
`);

console.log(data.title); // 'My Post'
console.log(content); // '# Content here'
```

## mdsvex (Svelte + Markdown)

```bash
npm install mdsvex
```

```javascript
// svelte.config.js
import { mdsvex } from "mdsvex";

export default {
  extensions: [".svelte", ".md"],
  preprocess: mdsvex({
    extensions: [".md"],
    highlight: {
      theme: "github-dark",
    },
  }),
};
```

```markdown
<!-- src/routes/blog/post.md -->

---

title: My Post
date: 2024-01-01
---

# {title}

<script>
  let count = $state(0);
</script>

<button onclick={() => count++}>
Clicked {count} times
</button>
```

## Editor Toolbar

```svelte
<script>
  import { EditorView } from '@codemirror/view';

  let { editorView } = $props();

  function insertMarkdown(syntax) {
    const { from, to } = editorView.state.selection.main;
    const selected = editorView.state.sliceDoc(from, to);

    const replacements = {
      bold: `**${selected || 'bold text'}**`,
      italic: `*${selected || 'italic text'}*`,
      heading: `## ${selected || 'Heading'}`,
      link: `[${selected || 'link text'}](url)`,
      code: selected.includes('\n')
        ? `\`\`\`\n${selected || 'code'}\n\`\`\``
        : `\`${selected || 'code'}\``,
      list: `- ${selected || 'list item'}`,
      task: `- [ ] ${selected || 'task'}`
    };

    editorView.dispatch({
      changes: { from, to, insert: replacements[syntax] }
    });
  }
</script>

<div class="toolbar">
  <button onclick={() => insertMarkdown('bold')} title="Bold (Ctrl+B)">B</button>
  <button onclick={() => insertMarkdown('italic')} title="Italic (Ctrl+I)">I</button>
  <button onclick={() => insertMarkdown('heading')} title="Heading">H</button>
  <button onclick={() => insertMarkdown('link')} title="Link">🔗</button>
  <button onclick={() => insertMarkdown('code')} title="Code">⟨⟩</button>
  <button onclick={() => insertMarkdown('list')} title="List">•</button>
  <button onclick={() => insertMarkdown('task')} title="Task">☐</button>
</div>
```

## Live Preview

```svelte
<script>
  import MarkdownIt from 'markdown-it';
  import hljs from 'highlight.js/lib/core';
  import highlightjs from 'markdown-it-highlightjs';

  let content = $state('# Hello World');
  let html = $derived(md.render(content));

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true
  }).use(highlightjs, { hljs, auto: true });
</script>

<div class="editor-container">
  <textarea bind:value={content}></textarea>
  <div class="preview">{@html html}</div>
</div>
```

## Math Support (KaTeX)

```bash
npm install katex markdown-it-katex
```

```javascript
import MarkdownIt from "markdown-it";
import katex from "markdown-it-katex";

const md = new MarkdownIt().use(katex);

// Renders: E = mc^2
const html = md.render("$$E = mc^2$$");
```

## Diagram Support (Mermaid)

```bash
npm install mermaid
```

```svelte
<script>
  import mermaid from 'mermaid';

  let { code } = $props();
  let svg = $state('');

  $effect(async () => {
    const { svg: rendered } = await mermaid.render('diagram', code);
    svg = rendered;
  });
</script>

<div>{@html svg}</div>
```

## Best Practices

### Performance

- Debounce preview updates (300ms)
- Use web workers for parsing large documents
- Cache rendered HTML
- Lazy load syntax highlighter

### UX

- Split editor/preview view
- Auto-save with localStorage
- Keyboard shortcuts for common operations
- Line numbers in editor
- Word count in status bar

### Security

- Sanitize HTML output (DOMPurify)
- Validate markdown input
- Handle malformed markdown gracefully

## Resources

- markdown-it: https://github.com/markdown-it/markdown-it
- highlight.js: https://highlightjs.org/
- CodeMirror 6: https://codemirror.net/6/
- mdsvex: https://mdsvex.pngwn.io/
- mermaid: https://mermaid.js.org/
