import type { MouseEvent, RefObject } from "react";
import { t } from "../i18n";

interface ContentViewProps {
  html: string;
  error: string | null;
  loadingDoc: boolean;
  activePath: string | null;
  contentRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  onContentClick: (e: MouseEvent) => void;
  onDismissError: () => void;
}

export default function ContentView({
  html,
  error,
  loadingDoc,
  activePath,
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
        key={activePath ?? ""}
        ref={contentRef}
        className="markdown-body"
        onClick={onContentClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {!html && !error &&
        (loadingDoc ? (
          <p className="placeholder">{t("loading")}</p>
        ) : (
          <div className="placeholder">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <p className="placeholder-title">{t("pickFile")}</p>
            <p className="hint">
              <kbd>Ctrl</kbd>+<kbd>F</kbd> {t("hintSearch")} · {t("hintDiagrams")}
            </p>
          </div>
        ))}
    </div>
  );
}
