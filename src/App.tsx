import { useState, useEffect, useCallback, useRef, type MouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { md, renderDiagrams, slugify } from "./markdown";
import { t } from "./i18n";
import type { MdFile, OutlineItem, ThemeMode } from "./types";
import Sidebar from "./components/Sidebar";
import Toolbar from "./components/Toolbar";
import ContentView from "./components/ContentView";
import "./App.css";

const THEME_KEY = "shaokan-theme";
const FONT_KEY = "shaokan-font";
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

function formatError(e: unknown): string {
  const s = String(e);
  const i = s.indexOf(":");
  if (i > 0) {
    const code = s.slice(0, i);
    if (code === "dir_not_found") return t("dirNotFound", { path: s.slice(i + 1) });
    if (code === "not_a_dir") return t("notADir", { path: s.slice(i + 1) });
  }
  return s;
}

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
  const openSeqRef = useRef(0);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme, resolvedTheme]);

  useEffect(() => {
    document.documentElement.style.setProperty("--content-font-size", `${fontSize}px`);
    localStorage.setItem(FONT_KEY, String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    getCurrentWindow().setTitle(t("appTitle")).catch(() => {});
  }, []);

  useEffect(() => {
    invoke<string>("get_home_dir")
      .then((home) => {
        setHomeDir(home);
        setCurrentPath(home);
      })
      .catch((e) => setError(String(e)));
  }, []);

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

  const loadDir = useCallback(async (dir: string) => {
    setCurrentPath(dir);
    setError(null);
    setLoadingDir(true);
    try {
      const list = await invoke<MdFile[]>("list_md_files", { dir });
      setFiles(list);
    } catch (e) {
      setFiles([]);
      setError(formatError(e));
    } finally {
      setLoadingDir(false);
    }
  }, []);

  useEffect(() => {
    if (currentPath) loadDir(currentPath);
  }, [currentPath, loadDir]);

  const openFile = useCallback(async (file: MdFile) => {
    const seq = ++openSeqRef.current;
    setQuery("");
    setMatchCount(0);
    setCurrentMatch(-1);
    marksRef.current = [];
    setLoadingDoc(true);
    try {
      const content = await invoke<string>("read_md_file", { path: file.path });
      if (seq !== openSeqRef.current) return;
      setHtml(md.render(content));
      setActivePath(file.path);
      setError(null);
    } catch (e) {
      if (seq !== openSeqRef.current) return;
      setError(String(e));
      setHtml("");
    } finally {
      if (seq === openSeqRef.current) setLoadingDoc(false);
    }
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setActiveId(null);

    const headings = Array.from(root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6"));

    const used = new Map<string, number>();
    for (const h of headings) {
      const base = slugify(h.textContent || "") || "section";
      const n = used.get(base) || 0;
      used.set(base, n + 1);
      h.id = n === 0 ? base : `${base}-${n + 1}`;
    }

    root.querySelectorAll("table").forEach((table) => {
      if (table.parentElement?.classList.contains("table-wrap")) return;
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

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
      btn.textContent = t("copy");
      btn.onclick = () => {
        navigator.clipboard.writeText(code.textContent || "").then(
          () => {
            btn.textContent = t("copied");
            btn.classList.add("copied");
          },
          () => {
            btn.textContent = t("copyFailed");
          }
        ).finally(() => {
          setTimeout(() => {
            btn.textContent = t("copy");
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

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    return renderDiagrams(root, resolvedTheme === "dark");
  }, [html, resolvedTheme]);

  const scrollToHeading = (id: string) => {
    const el = document.getElementById(id);
    if (el && contentRef.current?.contains(el)) {
      el.scrollIntoView({ block: "start" });
    }
  };

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

  const handleQueryChange = (q: string) => {
    setQuery(q);
    runSearch(q);
  };

  const decreaseFont = () => setFontSize((v) => Math.max(MIN_FONT, v - 1));
  const increaseFont = () => setFontSize((v) => Math.min(MAX_FONT, v + 1));

  const goHome = useCallback(() => {
    if (homeDir) setCurrentPath(homeDir);
  }, [homeDir]);

  const refreshDir = () => {
    if (currentPath) loadDir(currentPath);
  };

  const cycleTheme = () => {
    setTheme((t) => (t === "light" ? "dark" : t === "dark" ? "system" : "light"));
  };

  return (
    <div id="app">
      <Sidebar
        currentPath={currentPath}
        loadingDir={loadingDir}
        files={files}
        activePath={activePath}
        tab={tab}
        outline={outline}
        activeId={activeId}
        hasDoc={!!html}
        onRefresh={refreshDir}
        onHome={goHome}
        onTabChange={setTab}
        onOpenFile={openFile}
        onOutlineClick={scrollToHeading}
      />
      <main className="main-pane">
        <Toolbar
          activePath={activePath}
          loadingDoc={loadingDoc}
          searchRef={searchRef}
          query={query}
          matchCount={matchCount}
          currentMatch={currentMatch}
          onQueryChange={handleQueryChange}
          onNext={goNext}
          onPrev={goPrev}
          onDecreaseFont={decreaseFont}
          onIncreaseFont={increaseFont}
          canDecreaseFont={fontSize > MIN_FONT}
          canIncreaseFont={fontSize < MAX_FONT}
          theme={theme}
          resolvedTheme={resolvedTheme}
          onCycleTheme={cycleTheme}
        />
        <ContentView
          html={html}
          error={error}
          loadingDoc={loadingDoc}
          contentRef={contentRef}
          scrollRef={scrollRef}
          onContentClick={handleContentClick}
          onDismissError={() => setError(null)}
        />
      </main>
    </div>
  );
}
