import DOMPurify from "dompurify";
import "katex/dist/katex.min.css";
import { t } from "./i18n";

function stripFrontmatter(source: string): string {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
  return match ? source.slice(match[0].length) : source;
}

let renderSeq = 0;
const renderJobs = new Map<
  number,
  { resolve: (html: string) => void; reject: (reason: unknown) => void }
>();
let renderWorker: Worker | undefined;

function getWorker(): Worker {
  if (!renderWorker) {
    renderWorker = new Worker(new URL("./render-worker.ts", import.meta.url), {
      type: "module",
    });
    renderWorker.onmessage = (e: MessageEvent<{ id: number; html?: string; error?: string }>) => {
      const job = renderJobs.get(e.data.id);
      if (!job) return;
      renderJobs.delete(e.data.id);
      if (e.data.error !== undefined) job.reject(e.data.error);
      else job.resolve(e.data.html ?? "");
    };
    renderWorker.onerror = (e) => {
      renderWorker = undefined;
      renderJobs.forEach((job) => job.reject(e.message || "render worker failed"));
      renderJobs.clear();
    };
  }
  return renderWorker;
}

export function renderMarkdown(source: string): Promise<string> {
  const worker = getWorker();
  const id = ++renderSeq;
  return new Promise((resolve, reject) => {
    renderJobs.set(id, {
      resolve: (html) => resolve(DOMPurify.sanitize(html)),
      reject,
    });
    worker.postMessage({ id, source: stripFrontmatter(source) });
  });
}

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

let plantUmlChain: Promise<void> = Promise.resolve();
let mermaidChain: Promise<void> = Promise.resolve();

const diagramCache = new WeakMap<HTMLElement, { light?: string; dark?: string }>();

function cacheDiagram(block: HTMLElement, theme: "light" | "dark", html: string) {
  const entry = diagramCache.get(block) ?? {};
  entry[theme] = html;
  diagramCache.set(block, entry);
}

function renderPlantUmlBlock(block: HTMLElement, source: string, dark: boolean, epoch: number): Promise<void> {
  const theme = dark ? "dark" : "light";
  const task = plantUmlChain.then(
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
          if (block.querySelector("svg")) {
            cacheDiagram(block, theme, block.innerHTML);
            finish();
          }
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
            block.innerHTML = "";
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
  plantUmlChain = task.catch(() => {});
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
  const theme = dark ? "dark" : "light";
  const task = mermaidChain.then(async () => {
    if (epoch !== renderEpoch) return;
    try {
      const mermaid = await ensureMermaid();
      if (epoch !== renderEpoch || !block.isConnected) return;
      const mermaidThemeName = dark ? "dark" : "default";
      if (mermaidTheme !== mermaidThemeName) {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          theme: mermaidThemeName,
          fontFamily: "inherit",
        });
        mermaidTheme = mermaidThemeName;
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
      cacheDiagram(block, theme, block.innerHTML);
    } catch (e) {
      if (epoch === renderEpoch && block.isConnected) {
        block.innerHTML = `<div class="mermaid-error">${t("mermaidFailed", { error: escapeHtml(String(e)) })}</div>`;
      }
    }
  });
  mermaidChain = task.catch(() => {});
  return task;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
  const theme = dark ? "dark" : "light";
  const blocks = Array.from(
    root.querySelectorAll<HTMLElement>(".plantuml-container, .mermaid-container")
  );
  if (blocks.length === 0) return () => {};

  for (const block of blocks) {
    const cached = diagramCache.get(block)?.[theme];
    if (cached !== undefined) {
      block.innerHTML = cached;
      continue;
    }
    if (block.classList.contains("plantuml-container")) {
      const source = block.dataset.plantumlSource
        ? decodeURIComponent(block.dataset.plantumlSource)
        : "";
      if (!source.trim()) continue;
      renderPlantUmlBlock(block, source, dark, epoch);
    } else {
      const source = block.dataset.mermaidSource
        ? decodeURIComponent(block.dataset.mermaidSource)
        : "";
      if (!source.trim()) continue;
      renderMermaidBlock(block, source, dark, epoch);
    }
  }

  return () => {};
}
