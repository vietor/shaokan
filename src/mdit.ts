import MarkdownIt from "markdown-it";
import hljs from "highlight.js/lib/common";
import footnote from "markdown-it-footnote";
import taskLists from "markdown-it-task-lists";
import texmath from "markdown-it-texmath";
import katex from "katex";
import { t } from "./i18n";

function createMd() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: false,
    highlight: (str: string, lang: string): string => {
      if (lang && lang.toLowerCase() === "plantuml") return "";
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(str, { language: lang }).value;
      }
      return "";
    },
  });

  md.use(taskLists);
  md.use(footnote);
  md.use(texmath, {
    engine: katex,
    delimiters: "dollars",
    katexOptions: { throwOnError: false },
  });

  const defaultFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info.trim().toLowerCase();

    if (info === "plantuml") {
      const id = `plantuml-${Math.random().toString(36).slice(2, 10)}`;
      const encoded = encodeURIComponent(token.content);
      const loading = token.content.trim() ? `<div class="plantuml-loading">${t("rendering")}</div>` : "";
      return `<div class="plantuml-container" id="${id}" data-plantuml-source="${encoded}">${loading}</div>`;
    }

    if (info === "mermaid") {
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
      const encoded = encodeURIComponent(token.content);
      const loading = token.content.trim() ? `<div class="mermaid-loading">${t("rendering")}</div>` : "";
      return `<div class="mermaid-container" id="${id}" data-mermaid-source="${encoded}">${loading}</div>`;
    }

    return defaultFence(tokens, idx, options, env, self);
  };

  return md;
}

export const md = createMd();
