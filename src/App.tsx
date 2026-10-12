import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import MarkdownIt from "markdown-it";
import hljs from "highlight.js";
import "highlight.js/styles/github.css";
import { render as renderPlantUml } from "@plantuml/core/plantuml.js";
import "./styles.css";

interface MdFile {
  name: string;
  path: string;
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

  const contentRef = useRef<HTMLElement>(null);

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
      </aside>
      <main className="content">
        <article
          ref={contentRef}
          className="markdown-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {!html && !error && (
          <p className="placeholder">从左侧选择一个 Markdown 文件</p>
        )}
      </main>
    </div>
  );
}
