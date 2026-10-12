import type { RefObject } from "react";
import type { ThemeMode } from "../types";
import { t } from "../i18n";

interface ToolbarProps {
  loadingDoc: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  query: string;
  matchCount: number;
  currentMatch: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  canDecreaseFont: boolean;
  canIncreaseFont: boolean;
  theme: ThemeMode;
  resolvedTheme: "light" | "dark";
  onCycleTheme: () => void;
  onToggleSidebar: () => void;
}

export default function Toolbar({
  loadingDoc,
  searchRef,
  query,
  matchCount,
  currentMatch,
  onQueryChange,
  onNext,
  onPrev,
  onDecreaseFont,
  onIncreaseFont,
  canDecreaseFont,
  canIncreaseFont,
  theme,
  resolvedTheme,
  onCycleTheme,
  onToggleSidebar,
}: ToolbarProps) {
  const themeLabel = theme === "light" ? t("themeLight") : theme === "dark" ? t("themeDark") : t("themeSystem");

  return (
    <div className="toolbar">
      <button className="icon-btn" onClick={onToggleSidebar} title={t("toggleSidebar")}>
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
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
        </svg>
      </button>
      {loadingDoc && <span className="loading-tag">{t("loading")}</span>}
      <input
        ref={searchRef}
        className="search-input"
        type="search"
        placeholder={t("searchPlaceholder")}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            onQueryChange("");
          }
        }}
      />
      <span className="match-count">
        {matchCount > 0 ? `${currentMatch + 1}/${matchCount}` : query ? "0/0" : ""}
      </span>
      <button onClick={onPrev} disabled={matchCount === 0} title={t("prev")}>
        ‹
      </button>
      <button onClick={onNext} disabled={matchCount === 0} title={t("next")}>
        ›
      </button>
      <span className="toolbar-divider" />
      <button
        onClick={onDecreaseFont}
        disabled={!canDecreaseFont}
        title={t("decreaseFont")}
      >
        A−
      </button>
      <button
        onClick={onIncreaseFont}
        disabled={!canIncreaseFont}
        title={t("increaseFont")}
      >
        A+
      </button>
      <button className="icon-btn" onClick={onCycleTheme} title={t("themeTitle", { theme: themeLabel })}>
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
  );
}
