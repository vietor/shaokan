import type { MouseEvent, RefObject } from "react";

interface ContentViewProps {
  html: string;
  error: string | null;
  loadingDoc: boolean;
  contentRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onContentClick: (e: MouseEvent) => void;
  onDismissError: () => void;
}

export default function ContentView({
  html,
  error,
  loadingDoc,
  contentRef,
  scrollRef,
  onContentClick,
  onDismissError,
}: ContentViewProps) {
  return (
    <div className="content" ref={scrollRef}>
      {error && (
        <div className="error-banner" role="alert">
          <span>加载失败：{error}</span>
          <button onClick={onDismissError} title="关闭" aria-label="关闭">
            ×
          </button>
        </div>
      )}
      <article
        ref={contentRef}
        className="markdown-body"
        onClick={onContentClick}
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
  );
}
