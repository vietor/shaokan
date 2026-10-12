import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
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

  const defaultFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info.trim().toLowerCase();

    if (info === "plantuml") {
      const id = `plantuml-${Math.random().toString(36).slice(2, 10)}`;
      const escaped = escapeHtml(token.content);
      const loading = token.content.trim() ? `<div class="plantuml-loading">${t("rendering")}</div>` : "";
      return `<div class="plantuml-container" id="${id}" data-plantuml-source="${escaped}">${loading}</div>`;
    }

    if (info === "mermaid") {
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
      const escaped = escapeHtml(token.content);
      const loading = token.content.trim() ? `<div class="mermaid-loading">${t("rendering")}</div>` : "";
      return `<div class="mermaid-container" id="${id}" data-mermaid-source="${escaped}">${loading}</div>`;
    }

    return defaultFence(tokens, idx, options, env, self);
  };

  return md;
}

export const md = createMd();

let vizReady: Promise<void> | null = null;
function loadViz(): Promise<void> {
  return (async () => {
    const { default: source } = await import("@plantuml/core/viz-global.js?raw");
    await new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const s = document.createElement("script");
      s.onload = () => {
        URL.revokeObjectURL(url);
        s.remove();
        resolve();
      };
      s.onerror = () => {
        URL.revokeObjectURL(url);
        s.remove();
        reject(new Error(t("vizLoadFailed")));
      };
      s.src = url;
      document.head.appendChild(s);
    });
  })();
}
function ensureViz(): Promise<void> {
  if (!vizReady) {
    vizReady = loadViz().catch((e) => {
      vizReady = null;
      throw e;
    });
  }
  return vizReady;
}

let plantUmlReady: Promise<typeof import("@plantuml/core/plantuml.js")> | null = null;
function ensurePlantUml(): Promise<typeof import("@plantuml/core/plantuml.js")> {
  if (!plantUmlReady) {
    plantUmlReady = import("@plantuml/core/plantuml.js").catch((e) => {
      plantUmlReady = null;
      throw e;
    });
  }
  return plantUmlReady;
}

let renderEpoch = 0;
const pendingFinish = new Set<() => void>();

function cancelPendingRenders(): number {
  renderEpoch++;
  pendingFinish.forEach((f) => f());
  pendingFinish.clear();
  return renderEpoch;
}

let renderChain: Promise<void> = Promise.resolve();

function renderPlantUmlBlock(block: HTMLElement, source: string, dark: boolean, epoch: number): Promise<void> {
  const task = renderChain.then(
    () =>
      new Promise<void>((resolve) => {
        if (epoch !== renderEpoch) {
          resolve();
          return;
        }
        const finish = () => {
          pendingFinish.delete(finish);
          observer.disconnect();
          clearTimeout(timer);
          resolve();
        };
        const observer = new MutationObserver(() => {
          if (block.querySelector("svg") || (block.textContent || "").trim()) finish();
        });
        const timer = setTimeout(() => {
          finish();
          if (block.isConnected) {
            block.innerHTML = `<div class="plantuml-error">${t("plantumlTimeout")}</div>`;
          }
        }, 20000);
        pendingFinish.add(finish);
        observer.observe(block, { childList: true, subtree: true });
        Promise.all([ensureViz(), ensurePlantUml()])
          .then(([, { render }]) => {
            if (epoch !== renderEpoch || !block.isConnected) {
              finish();
              return;
            }
            render(source.split("\n"), block.id, { dark });
          })
          .catch((e) => {
            finish();
            if (block.isConnected) {
              block.innerHTML = `<div class="plantuml-error">${t("plantumlFailed", { error: escapeHtml(String(e)) })}</div>`;
            }
          });
      })
  );
  renderChain = task.catch(() => {});
  return task;
}

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
function ensureMermaid(): Promise<typeof import("mermaid").default> {
  if (!mermaidReady) {
    mermaidReady = import("mermaid")
      .then((m) => m.default)
      .catch((e) => {
        mermaidReady = null;
        throw e;
      });
  }
  return mermaidReady;
}

let mermaidTheme: string | null = null;

function renderMermaidBlock(block: HTMLElement, source: string, dark: boolean, epoch: number): Promise<void> {
  const task = renderChain.then(async () => {
    if (epoch !== renderEpoch) return;
    try {
      const mermaid = await ensureMermaid();
      if (epoch !== renderEpoch || !block.isConnected) return;
      const theme = dark ? "dark" : "default";
      if (mermaidTheme !== theme) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme,
          fontFamily: "inherit",
        });
        mermaidTheme = theme;
      }
      const { svg } = await mermaid.render(`${block.id}-svg`, source);
      if (epoch !== renderEpoch || !block.isConnected) return;
      block.innerHTML = svg;

      const svgEl = block.querySelector<SVGSVGElement>("svg");
      const vb = svgEl?.viewBox.baseVal;
      if (svgEl && vb && vb.width > 0) {
        svgEl.setAttribute("width", String(vb.width));
        svgEl.setAttribute("height", String(vb.height));
      }
    } catch (e) {
      if (epoch === renderEpoch && block.isConnected) {
        block.innerHTML = `<div class="mermaid-error">${t("mermaidFailed", { error: escapeHtml(String(e)) })}</div>`;
      }
    }
  });
  renderChain = task.catch(() => {});
  return task;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeHtml(str: string): string {
  const txt = document.createElement("textarea");
  txt.innerHTML = str;
  return txt.value;
}

export function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w一-龥\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function renderDiagrams(root: HTMLElement, dark: boolean): () => void {
  const epoch = cancelPendingRenders();
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>(".plantuml-container, .mermaid-container")
  );
  if (blocks.length === 0) return () => {};
  let cancelled = false;

  (async () => {
    for (const block of blocks) {
      if (cancelled || epoch !== renderEpoch) return;
      if (block.classList.contains("plantuml-container")) {
        const source = block.dataset.plantumlSource
          ? unescapeHtml(block.dataset.plantumlSource)
          : "";
        if (!source.trim()) continue;
        await renderPlantUmlBlock(block, source, dark, epoch);
      } else {
        const source = block.dataset.mermaidSource
          ? unescapeHtml(block.dataset.mermaidSource)
          : "";
        if (!source.trim()) continue;
        await renderMermaidBlock(block, source, dark, epoch);
      }
    }
  })();

  return () => {
    cancelled = true;
  };
}
