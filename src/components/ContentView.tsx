import type { MouseEvent, RefObject } from "react";
import { t } from "../i18n";

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
          <span>{t("loadFailed", { error })}</span>
          <button onClick={onDismissError} title={t("close")} aria-label={t("close")}>
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
          {loadingDoc ? t("loading") : t("pickFile")}
          {!loadingDoc && (
            <span className="hint">{t("hint")}</span>
          )}
        </p>
      )}
    </div>
  );
}
