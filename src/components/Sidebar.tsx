import { useState, type ReactNode } from "react";
import type { MdFile, OutlineItem } from "../types";
import { t } from "../i18n";

interface SidebarProps {
  currentPath: string;
  loadingDir: boolean;
  files: MdFile[];
  activePath: string | null;
  tab: "files" | "outline";
  outline: OutlineItem[];
  activeId: string | null;
  hasDoc: boolean;
  onRefresh: () => void;
  onHome: () => void;
  onTabChange: (tab: "files" | "outline") => void;
  onOpenFile: (file: MdFile) => void;
  onOutlineClick: (id: string) => void;
  onResize: (width: number) => void;
}

function highlightText(text: string, query: string) {
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let idx = lower.indexOf(query);
  while (idx !== -1) {
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(
      <mark key={idx} className="search-hit">
        {text.slice(idx, idx + query.length)}
      </mark>
    );
    from = idx + query.length;
    idx = lower.indexOf(query, from);
  }
  if (from === 0) return text;
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}

export default function Sidebar({
  currentPath,
  loadingDir,
  files,
  activePath,
  tab,
  outline,
  activeId,
  hasDoc,
  onRefresh,
  onHome,
  onTabChange,
  onOpenFile,
  onOutlineClick,
  onResize,
}: SidebarProps) {
  const [outlineFilter, setOutlineFilter] = useState("");

  const q = outlineFilter.trim().toLowerCase();
  let shown = outline;
  if (q) {
    const parents = outline.map(() => -1);
    const stack: number[] = [];
    outline.forEach((h, i) => {
      while (stack.length && outline[stack[stack.length - 1]].level >= h.level) stack.pop();
      if (stack.length) parents[i] = stack[stack.length - 1];
      stack.push(i);
    });
    const keep = new Set<number>();
    outline.forEach((h, i) => {
      if (h.text.toLowerCase().includes(q)) {
        for (let j = i; j !== -1; j = parents[j]) keep.add(j);
      }
    });
    shown = outline.filter((_, i) => keep.has(i));
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="path-label" title={currentPath}>
          {currentPath || "~/"}
        </div>
        <button
          className="icon-btn"
          onClick={onRefresh}
          title={t("refreshDir")}
          aria-label={t("refreshDir")}
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
          onClick={onHome}
          title={t("backHome")}
          aria-label={t("backHome")}
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
          onClick={() => onTabChange("files")}
        >
          {t("filesTab")}
        </button>
        <button
          className={tab === "outline" ? "active" : ""}
          onClick={() => onTabChange("outline")}
        >
          {t("outlineTab")}
        </button>
      </div>
      {tab === "files" ? (
        <ul className="file-list">
          {loadingDir && <li className="empty">{t("loading")}</li>}
          {!loadingDir && files.length === 0 && (
            <li className="empty">{t("emptyDir")}</li>
          )}
          {files.map((f) => (
            <li
              key={f.path}
              className={f.path === activePath ? "active" : ""}
              title={f.path}
              onClick={() => onOpenFile(f)}
            >
              {f.name}
            </li>
          ))}
        </ul>
      ) : (
        <>
          <input
            className="outline-filter"
            type="search"
            placeholder={t("outlineFilterPlaceholder")}
            value={outlineFilter}
            onChange={(e) => setOutlineFilter(e.target.value)}
          />
          <ul className="file-list">
            {outline.length === 0 && (
              <li className="empty">
                {hasDoc ? t("emptyOutlineDoc") : t("emptyOutlineNone")}
              </li>
            )}
            {shown.map((h) => (
              <li
                key={h.id}
                className={h.id === activeId ? "active" : ""}
                style={{ paddingLeft: 14 + (h.level - 1) * 12 }}
                title={h.text}
                onClick={() => onOutlineClick(h.id)}
              >
                {q ? highlightText(h.text, q) : h.text}
              </li>
            ))}
          </ul>
        </>
      )}
      <div
        className="sidebar-resizer"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          document.body.classList.add("resizing");
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) onResize(e.clientX);
        }}
        onLostPointerCapture={() => document.body.classList.remove("resizing")}
      />
    </aside>
  );
}
