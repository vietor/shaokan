import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import { render as renderPlantUml } from "@plantuml/core/plantuml.js";
import "./App.css";

interface MdFile {
  name: string;
  path: string;
}

interface OutlineItem {
  level: number;
  text: string;
}

// ====== 创建 markdown-it 实例 + PlantUML 插件 ======
function createMd(): MarkdownIt {
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

  // PlantUML 插件
  const defaultFence = md.renderer.rules.fence!;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const info = token.info.trim().toLowerCase();

    if (info !== "plantuml") {
      return defaultFence(tokens, idx, options, env, self);
    }

    const id = `plantuml-${Math.random().toString(36).slice(2, 10)}`;
    const escaped = escapeHtml(token.content);
    return `<div class="plantuml-container" id="${id}" data-plantuml-source="${escaped}"></div>`;
  };

  return md;
}

const md = createMd();

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
  const [query, setQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatch, setCurrentMatch] = useState(-1);

  const contentRef = useRef<HTMLElement>(null);
  const marksRef = useRef<HTMLElement[]>([]);

  // 初始化：获取 home 目录
  useEffect(() => {
    invoke<string>("get_home_dir")
      .then((home) => {
        setHomeDir(home);
        setCurrentPath(home);
      })
      .catch((e) => setError(String(e)));
  }, []);

  // 加载目录中的 .md 文件
  const loadDir = useCallback(async (dir: string) => {
    setCurrentPath(dir);
    setError(null);
    try {
      const list = await invoke<MdFile[]>("list_md_files", { dir });
      setFiles(list);
    } catch (e) {
      setFiles([]);
      setError(String(e));
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
    try {
      const content = await invoke<string>("read_md_file", { path: file.path });
      setHtml(md.render(content));
      setActivePath(file.path);
      setError(null);
    } catch (e) {
      setError(String(e));
      setHtml("");
    }
  }, []);

  // Markdown 渲染完成后，处理 PlantUML 占位符
  useEffect(() => {
    if (!contentRef.current) return;
    const blocks = contentRef.current.querySelectorAll<HTMLElement>(".plantuml-container");
    blocks.forEach(async (block) => {
      const source = block.dataset.plantumlSource
        ? unescapeHtml(block.dataset.plantumlSource)
        : "";
      if (!source.trim()) return;

      try {
        await renderPlantUml(source.split("\n"), block.id);
      } catch (e) {
        block.innerHTML = `<div class="plantuml-error">PlantUML 渲染失败: ${e}</div>`;
      }
    });
  }, [html]);

  // 渲染完成后提取标题生成大纲
  useEffect(() => {
    const headings = contentRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6");
    setOutline(
      headings
        ? Array.from(headings).map((h) => ({
            level: Number(h.tagName[1]),
            text: h.textContent || "",
          }))
        : []
    );
  }, [html]);

  // 点击大纲项滚动到对应标题
  const scrollToHeading = (index: number) => {
    const headings = contentRef.current?.querySelectorAll("h1, h2, h3, h4, h5, h6");
    headings?.[index]?.scrollIntoView({ block: "start" });
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
        if (!node.data || node.parentElement?.closest("svg")) continue;
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

  return (
    <div id="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="path-label" title={currentPath}>
            {currentPath || "~/"}
          </div>
          <button id="go-home" onClick={goHome} title="回到 Home">
            🏠
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
            {error && <li className="empty">加载失败: {error}</li>}
            {!error && files.length === 0 && (
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
            {outline.map((h, i) => (
              <li
                key={i}
                style={{ paddingLeft: 14 + (h.level - 1) * 12 }}
                title={h.text}
                onClick={() => scrollToHeading(i)}
              >
                {h.text}
              </li>
            ))}
          </ul>
        )}
      </aside>
      <main className="main-pane">
        <div className="toolbar">
          <input
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
        </div>
        <div className="content">
          <article
            ref={contentRef}
            className="markdown-body"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          {!html && !error && (
            <p className="placeholder">从左侧选择一个 Markdown 文件</p>
          )}
        </div>
      </main>
    </div>
  );
}
