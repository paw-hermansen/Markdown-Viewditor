declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  const taskLists: MarkdownIt.PluginSimple;
  export default taskLists;
}

declare module "markdown-it-footnote" {
  import type MarkdownIt from "markdown-it";
  const footnote: MarkdownIt.PluginSimple;
  export default footnote;
}

declare module "markdown-it-mark" {
  import type MarkdownIt from "markdown-it";
  const mark: MarkdownIt.PluginSimple;
  export default mark;
}

declare module "*?raw" {
  const content: string;
  export default content;
}
