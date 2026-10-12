import { useState, useEffect, useCallback, useRef, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import { render as renderPlantUml } from "@plantuml/core/plantuml.js";
import "./App.css";

interface MdFile {
  name: string;
  path: string;
}

interface OutlineItem {
  level: number;
  text: string;
  id: string;
}

type ThemeMode = "light" | "dark" | "system";

const THEME_KEY = "md-browser-theme";
const FONT_KEY = "md-browser-font";
const MIN_FONT = 12;
const MAX_FONT = 22;

function loadTheme(): ThemeMode {
  const v = localStorage.getItem(THEME_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function loadFontSize(): number {
  const v = parseInt(localStorage.getItem(FONT_KEY) || "", 10);
  return v >= MIN_FONT && v <= MAX_FONT ? v : 15;
}

// ====== 创建 markdown-it 实例 + PlantUML 插件 ======
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

  // 图表插件（PlantUML / Mermaid）
  const defaultFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info.trim().toLowerCase();

    if (info === "plantuml") {
      const id = `plantuml-${Math.random().toString(36).slice(2, 10)}`;
      const escaped = escapeHtml(token.content);
      const loading = token.content.trim() ? '<div class="plantuml-loading">渲染中…</div>' : "";
      return `<div class="plantuml-container" id="${id}" data-plantuml-source="${escaped}">${loading}</div>`;
    }

    if (info === "mermaid") {
      const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
      const escaped = escapeHtml(token.content);
      const loading = token.content.trim() ? '<div class="mermaid-loading">渲染中…</div>' : "";
      return `<div class="mermaid-container" id="${id}" data-mermaid-source="${escaped}">${loading}</div>`;
    }

    return defaultFence(tokens, idx, options, env, self);
  };

  return md;
}

const md = createMd();

// ====== 图表渲染调度（PlantUML / Mermaid）======
// viz-global.js（Graphviz 布局引擎）必须以普通 <script> 注入，引擎经全局 Viz 使用；
// 用 ?raw 取回源码、以 Blob URL 作为 classic script 加载，dev 与打包构建行为一致
let vizReady: Promise<void> | null = null;
function ensureViz(): Promise<void> {
  if (!vizReady) {
    vizReady = (async () => {
      const { default: source } = await import("@plantuml/core/viz-global.js?raw");
      await new Promise<void>((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        const s = document.createElement("script");
        s.onload = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        s.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("viz-global.js 加载失败"));
        };
        s.src = url;
        document.head.appendChild(s);
      });
    })();
  }
  return vizReady;
}

// 引擎内部状态共享，多图必须串行渲染：等上一张写入结果后再渲染下一张
let renderChain: Promise<void> = Promise.resolve();

function renderPlantUmlBlock(block: HTMLElement, source: string, dark: boolean): Promise<void> {
  const task = renderChain.then(
    () =>
      new Promise<void>((resolve) => {
        const finish = () => {
          observer.disconnect();
          clearTimeout(timer);
          resolve();
        };
        const observer = new MutationObserver(() => {
          if (block.querySelector("svg") || (block.textContent || "").trim()) finish();
        });
        const timer = setTimeout(() => {
          finish();
          block.innerHTML = '<div class="plantuml-error">PlantUML 渲染超时</div>';
        }, 20000);
        observer.observe(block, { childList: true, subtree: true });
        try {
          renderPlantUml(source.split("\n"), block.id, { dark });
        } catch (e) {
          finish();
          block.innerHTML = `<div class="plantuml-error">PlantUML 渲染失败: ${escapeHtml(String(e))}</div>`;
        }
      })
  );
  renderChain = task.catch(() => {});
  return task;
}

let mermaidReady: Promise<typeof import("mermaid").default> | null = null;
function ensureMermaid(): Promise<typeof import("mermaid").default> {
  if (!mermaidReady) {
    mermaidReady = import("mermaid").then((m) => m.default);
  }
  return mermaidReady;
}

function renderMermaidBlock(block: HTMLElement, source: string, dark: boolean): Promise<void> {
  const task = renderChain.then(async () => {
    try {
      const mermaid = await ensureMermaid();
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        suppressErrorRendering: true,
        theme: dark ? "dark" : "default",
        fontFamily: "inherit",
      });
      const { svg } = await mermaid.render(`${block.id}-svg`, source);
      block.innerHTML = svg;
    } catch (e) {
      block.innerHTML = `<div class="mermaid-error">Mermaid 渲染失败: ${escapeHtml(String(e))}</div>`;
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

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w一-龥\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ====== App 组件 ======
export default function App() {
  const [homeDir, setHomeDir] = useState("");
  const [currentPath, setCurrentPath] = useState("");
  const [files, setFiles] = useState<MdFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [html, setHtml] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"files" | "outline">("files");
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(-1);
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const [fontSize, setFontSize] = useState<number>(loadFontSize);
  const [loadingDir, setLoadingDir] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const contentRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const marksRef = useRef<HTMLElement[]>([]);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  // 跟随系统主题
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // 应用并持久化主题
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, resolvedTheme]);

  // 应用并持久化正文字号
  useEffect(() => {
    document.documentElement.style.setProperty("--content-font-size", `${fontSize}px`);
    localStorage.setItem(FONT_KEY, String(fontSize));
  }, [fontSize]);

  // 初始化：获取 home 目录
  useEffect(() => {
    invoke<string>("get_home_dir")
      .then((home) => {
        setHomeDir(home);
        setCurrentPath(home);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // Ctrl/Cmd+F 聚焦搜索框
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // 加载目录中的 .md 文件
  const loadDir = useCallback(async (dir: string) => {
    setCurrentPath(dir);
    setError(null);
    setLoadingDir(true);
    try {
      const list = await invoke<MdFile[]>("list_md_files", { dir });
      setFiles(list);
    } catch (e) {
      setFiles([]);
      setError(String(e));
    } finally {
      setLoadingDir(false);
    }
  }, []);

  // currentPath 变化时加载
  useEffect(() => {
    if (currentPath) loadDir(currentPath);
  }, [currentPath, loadDir]);

  // 打开文件
  const openFile = useCallback(async (file: MdFile) => {
    setQuery("");
    setMatchCount(0);
    setCurrentMatch(-1);
    marksRef.current = [];
    setLoadingDoc(true);
    try {
      const content = await invoke<string>("read_md_file", { path: file.path });
      setHtml(md.render(content));
      setActivePath(file.path);
      setError(null);
    } catch (e) {
      setError(String(e));
      setHtml("");
    } finally {
      setLoadingDoc(false);
    }
  }, []);

  // Markdown 渲染完成后：重置滚动、生成标题锚点、表格包裹、代码块增强、大纲与滚动高亮
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setActiveId(null);

    const headings = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));

    // 生成 slug 锚点（去重）
    const used = new Map<string, number>();
    for (const h of headings) {
      const base = slugify(h.textContent || "") || "section";
      const n = used.get(base) || 0;
      used.set(base, n + 1);
      h.id = n === 0 ? base : `${base}-${n + 1}`;
    }

    // 宽表格横向滚动包裹
    root.querySelectorAll("table").forEach((table) => {
      if (table.parentElement?.classList.contains("table-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

    // 代码块：语言标签 + 复制按钮
    root.querySelectorAll<HTMLElement>("pre > code").forEach((code) => {
      const pre = code.parentElement as HTMLElement;
      if (pre.parentElement?.classList.contains("code-block")) return;
      const block = document.createElement("div");
      block.className = "code-block";
      pre.replaceWith(block);
      block.appendChild(pre);

      const lang = code.className.match(/language-([\w+#-]+)/)?.[1];
      if (lang) {
        const tag = document.createElement("span");
        tag.className = "code-lang";
        tag.textContent = lang;
        block.appendChild(tag);
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "复制";
      btn.onclick = () => {
        navigator.clipboard.writeText(code.textContent || "").then(
          () => {
            btn.textContent = "已复制";
            btn.classList.add("copied");
          },
          () => {
            btn.textContent = "复制失败";
          }
        ).finally(() => {
          setTimeout(() => {
            btn.textContent = "复制";
            btn.classList.remove("copied");
          }, 1500);
        });
      };
      block.appendChild(btn);
    });

    setOutline(
      headings.map((h) => ({
        level: Number(h.tagName[1]),
        text: h.textContent || "",
        id: h.id,
      }))
    );

    // 滚动高亮当前标题
    const visible = new Map<Element, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const en of entries) visible.set(en.target, en.isIntersecting);
        const current = headings.find((h) => visible.get(h));
        if (current) setActiveId(current.id);
      },
      { root: scrollRef.current, rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));

    return () => observer.disconnect();
  }, [html]);

  // Markdown 渲染完成后，渲染 PlantUML / Mermaid 图表（先确保布局引擎就绪，且全局串行）
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const blocks = Array.from(
      root.querySelectorAll<HTMLElement>(".plantuml-container, .mermaid-container")
    );
    if (blocks.length === 0) return;
    let cancelled = false;
    const dark = resolvedTheme === "dark";

    (async () => {
      for (const block of blocks) {
        if (cancelled) return;
        if (block.classList.contains("plantuml-container")) {
          const source = block.dataset.plantumlSource
            ? unescapeHtml(block.dataset.plantumlSource)
            : "";
          if (!source.trim()) continue;
          try {
            await ensureViz();
          } catch (e) {
            block.innerHTML = `<div class="plantuml-error">PlantUML 渲染失败: ${escapeHtml(String(e))}</div>`;
            continue;
          }
          await renderPlantUmlBlock(block, source, dark);
        } else {
          const source = block.dataset.mermaidSource
            ? unescapeHtml(block.dataset.mermaidSource)
            : "";
          if (!source.trim()) continue;
          await renderMermaidBlock(block, source, dark);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [html, resolvedTheme]);

  // 点击大纲项滚动到对应标题
  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el && contentRef.current?.contains(el)) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };

  // 正文链接：内部锚点平滑滚动，外部链接用系统浏览器打开
  const handleContentClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#")) {
      scrollToHeading(decodeURIComponent(href.slice(1)));
    } else if (/^(?:https?|mailto|tel):/i.test(href)) {
      openUrl(href).catch((err) => console.error(err));
    }
  };

  // ====== 搜索定位 ======
  const clearMarks = useCallback(() => {
    contentRef.current?.querySelectorAll("mark.search-hit").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
      parent.normalize();
    });
    marksRef.current = [];
  }, []);

  const setCurrentMark = useCallback((index: number) => {
    marksRef.current.forEach((mark, i) => {
      mark.classList.toggle("current", i === index);
    });
    setCurrentMatch(index);
    marksRef.current[index]?.scrollIntoView({ block: "center" });
  }, []);

  const runSearch = useCallback(
    (q: string) => {
      clearMarks();
      const root = contentRef.current;
      if (!root || !q) {
        setMatchCount(0);
        setCurrentMark(-1);
        return;
      }

      const textNodes: Text[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode as Text;
        if (!node.data || node.parentElement?.closest("svg, .copy-btn, .code-lang, .plantuml-loading, .mermaid-loading")) continue;
        textNodes.push(node);
      }

      const marks: HTMLElement[] = [];
      const lowerQ = q.toLowerCase();
      for (const node of textNodes) {
        const text = node.data;
        const lowerText = text.toLowerCase();
        let from = 0;
        let idx = lowerText.indexOf(lowerQ);
        if (idx === -1) continue;
        const frag = document.createDocumentFragment();
        do {
          if (idx > from) frag.appendChild(document.createTextNode(text.slice(from, idx)));
          const mark = document.createElement("mark");
          mark.className = "search-hit";
          mark.textContent = text.slice(idx, idx + q.length);
          frag.appendChild(mark);
          marks.push(mark);
          from = idx + q.length;
          idx = lowerText.indexOf(lowerQ, from);
        } while (idx !== -1);
        if (from < text.length) frag.appendChild(document.createTextNode(text.slice(from)));
        node.parentNode?.replaceChild(frag, node);
      }

      marksRef.current = marks;
      setMatchCount(marks.length);
      setCurrentMark(marks.length ? 0 : -1);
    },
    [clearMarks, setCurrentMark]
  );

  const goNext = () => {
    const total = marksRef.current.length;
    if (total) setCurrentMark((currentMatch + 1) % total);
  };

  const goPrev = () => {
    const total = marksRef.current.length;
    if (total) setCurrentMark((currentMatch - 1 + total) % total);
  };

  // 回到 home
  const goHome = useCallback(() => {
    if (homeDir) setCurrentPath(homeDir);
  }, [homeDir]);

  // 刷新当前目录
  const refreshDir = () => {
    if (currentPath) loadDir(currentPath);
  };

  // 循环切换主题：亮色 → 暗色 → 跟随系统
  const cycleTheme = () => {
    setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light"));
  };

  const themeLabel = theme === "light" ? "亮色" : theme === "dark" ? "暗色" : "跟随系统";
  const activeName = activePath ? activePath.split(/[\\/]/).pop() : "";

  return (
    <div id="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="path-label" title={currentPath}>
            {currentPath || "~/"}
          </div>
          <button
            className="icon-btn"
            onClick={refreshDir}
            title="刷新目录"
            aria-label="刷新目录"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
          </button>
          <button
            className="icon-btn"
            onClick={goHome}
            title="回到 Home"
            aria-label="回到 Home"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 10.5 12 3l9 7.5" />
              <path d="M5 9.5V21h14V9.5" />
            </svg>
          </button>
        </div>
        <div className="sidebar-tabs">
          <button
            className={tab === "files" ? "active" : ""}
            onClick={() => setTab("files")}
          >
            目录
          </button>
          <button
            className={tab === "outline" ? "active" : ""}
            onClick={() => setTab("outline")}
          >
            大纲
          </button>
        </div>
        {tab === "files" ? (
          <ul className="file-list">
            {loadingDir && <li className="empty">加载中…</li>}
            {!loadingDir && files.length === 0 && (
              <li className="empty">（此目录下没有 .md 文件）</li>
            )}
            {files.map((f) => (
              <li
                key={f.path}
                className={f.path === activePath ? "active" : ""}
                title={f.path}
                onClick={() => openFile(f)}
              >
                {f.name}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="file-list">
            {outline.length === 0 && (
              <li className="empty">
                {html ? "（此文档没有标题）" : "（未打开文档）"}
              </li>
            )}
            {outline.map((h) => (
              <li
                key={h.id}
                className={h.id === activeId ? "active" : ""}
                style={{ paddingLeft: 14 + (h.level - 1) * 12 }}
                title={h.text}
                onClick={() => scrollToHeading(h.id)}
              >
                {h.text}
              </li>
            ))}
          </ul>
        )}
      </aside>
      <main className="main-pane">
        <div className="toolbar">
          <span className="file-name" title={activePath || undefined}>
            {activeName}
          </span>
          {loadingDoc && <span className="loading-tag">加载中…</span>}
          <input
            ref={searchRef}
            className="search-input"
            type="search"
            placeholder="输入字符串定位…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              runSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (e.shiftKey) goPrev();
                else goNext();
              } else if (e.key === "Escape") {
                setQuery("");
                runSearch("");
              }
            }}
          />
          <span className="match-count">
            {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : query ? "0/0" : ""}
          </span>
          <button onClick={goPrev} disabled={matchCount === 0} title="上一个">
            ‹
          </button>
          <button onClick={goNext} disabled={matchCount === 0} title="下一个">
            ›
          </button>
          <span className="toolbar-divider" />
          <button
            onClick={() => setFontSize((v) => Math.max(MIN_FONT, v - 1))}
            disabled={fontSize <= MIN_FONT}
            title="减小字号"
          >
            A−
          </button>
          <button
            onClick={() => setFontSize((v) => Math.min(MAX_FONT, v + 1))}
            disabled={fontSize >= MAX_FONT}
            title="增大字号"
          >
            A+
          </button>
          <button className="icon-btn" onClick={cycleTheme} title={`主题：${themeLabel}（点击切换）`}>
            {resolvedTheme === "dark" ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            )}
          </button>
        </div>
        <div className="content" ref={scrollRef}>
          {error && (
            <div className="error-banner" role="alert">
              <span>加载失败：{error}</span>
              <button onClick={() => setError(null)} title="关闭" aria-label="关闭">
                ×
              </button>
            </div>
          )}
          <article
            ref={contentRef}
            className="markdown-body"
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {!html && !error && (
            <p className="placeholder">
              {loadingDoc ? "加载中…" : "从左侧选择一个 Markdown 文件"}
              {!loadingDoc && (
                <span className="hint">Ctrl+F 快速搜索 · 支持 PlantUML 图表</span>
              )}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
