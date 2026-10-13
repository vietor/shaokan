export type Locale = "zh-Hans" | "zh-Hant" | "en";

const en = {
  appTitle: "Shaokan",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Copy failed",
  loading: "Loading…",
  searchPlaceholder: "Search text…",
  toggleSidebar: "Toggle sidebar",
  prev: "Previous",
  next: "Next",
  decreaseFont: "Decrease font size",
  increaseFont: "Increase font size",
  resetFont: "Reset font size",
  themeLight: "Light",
  themeDark: "Dark",
  themeSystem: "System",
  themeTitle: "Theme: {theme} (click to switch)",
  refreshDir: "Refresh directory",
  backHome: "Go to Home",
  filesTab: "Files",
  outlineTab: "Outline",
  outlineFilterPlaceholder: "Filter headings…",
  emptyDir: "(No .md files in this directory)",
  emptyOutlineDoc: "(No headings in this document)",
  emptyOutlineNone: "(No document open)",
  dragHistory: "Dropped files",
  clearDragHistory: "Clear list",
  emptyDragHistory: "(No dropped files yet)",
  loadFailed: "Failed to load: {error}",
  close: "Close",
  pickFile: "Select a Markdown file from the left",
  hintSearch: "to search",
  hintDiagrams: "PlantUML diagrams supported",
  dirNotFound: "Directory not found: {path}",
  notADir: "Not a directory: {path}",
  rendering: "Rendering…",
  vizLoadFailed: "Failed to load viz-global.js",
  plantumlTimeout: "PlantUML rendering timed out",
  plantumlFailed: "PlantUML rendering failed: {error}",
  mermaidFailed: "Mermaid rendering failed: {error}",
};

type Messages = typeof en;
export type MessageKey = keyof Messages;

const messages: Record<Locale, Messages> = {
  en,
  "zh-Hans": {
    appTitle: "少看",
    copy: "复制",
    copied: "已复制",
    copyFailed: "复制失败",
    loading: "加载中…",
    searchPlaceholder: "输入字符串定位…",
    toggleSidebar: "显示/隐藏侧栏",
    prev: "上一个",
    next: "下一个",
    decreaseFont: "减小字号",
    increaseFont: "增大字号",
    resetFont: "恢复默认字号",
    themeLight: "亮色",
    themeDark: "暗色",
    themeSystem: "跟随系统",
    themeTitle: "主题：{theme}（点击切换）",
    refreshDir: "刷新目录",
    backHome: "回到 Home",
    filesTab: "目录",
    outlineTab: "大纲",
    outlineFilterPlaceholder: "筛选标题…",
    emptyDir: "（此目录下没有 .md 文件）",
    emptyOutlineDoc: "（此文档没有标题）",
    emptyOutlineNone: "（未打开文档）",
    dragHistory: "拖入历史",
    clearDragHistory: "清空列表",
    emptyDragHistory: "（没有拖入记录）",
    loadFailed: "加载失败：{error}",
    close: "关闭",
    pickFile: "从左侧选择一个 Markdown 文件",
    hintSearch: "快速搜索",
    hintDiagrams: "支持 PlantUML 图表",
    dirNotFound: "目录不存在：{path}",
    notADir: "不是目录：{path}",
    rendering: "渲染中…",
    vizLoadFailed: "viz-global.js 加载失败",
    plantumlTimeout: "PlantUML 渲染超时",
    plantumlFailed: "PlantUML 渲染失败：{error}",
    mermaidFailed: "Mermaid 渲染失败：{error}",
  },
  "zh-Hant": {
    appTitle: "少看",
    copy: "複製",
    copied: "已複製",
    copyFailed: "複製失敗",
    loading: "載入中…",
    searchPlaceholder: "輸入字串定位…",
    toggleSidebar: "顯示/隱藏側欄",
    prev: "上一個",
    next: "下一個",
    decreaseFont: "縮小字型大小",
    increaseFont: "放大字型大小",
    resetFont: "恢復預設字型大小",
    themeLight: "亮色",
    themeDark: "暗色",
    themeSystem: "跟隨系統",
    themeTitle: "主題：{theme}（點擊切換）",
    refreshDir: "重新整理目錄",
    backHome: "回到 Home",
    filesTab: "目錄",
    outlineTab: "大綱",
    outlineFilterPlaceholder: "篩選標題…",
    emptyDir: "（此目錄下沒有 .md 檔案）",
    emptyOutlineDoc: "（此文件沒有標題）",
    emptyOutlineNone: "（未開啟文件）",
    dragHistory: "拖入歷史",
    clearDragHistory: "清空列表",
    emptyDragHistory: "（沒有拖入記錄）",
    loadFailed: "載入失敗：{error}",
    close: "關閉",
    pickFile: "從左側選擇一個 Markdown 檔案",
    hintSearch: "快速搜尋",
    hintDiagrams: "支援 PlantUML 圖表",
    dirNotFound: "目錄不存在：{path}",
    notADir: "不是目錄：{path}",
    rendering: "渲染中…",
    vizLoadFailed: "viz-global.js 載入失敗",
    plantumlTimeout: "PlantUML 渲染逾時",
    plantumlFailed: "PlantUML 渲染失敗：{error}",
    mermaidFailed: "Mermaid 渲染失敗：{error}",
  },
};

function detectLocale(): Locale {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    const lang = tag.toLowerCase();
    if (lang.startsWith("zh")) {
      return /hant|tw|hk|mo/.test(lang) ? "zh-Hant" : "zh-Hans";
    }
    if (lang.startsWith("en")) {
      return "en";
    }
  }
  return "en";
}

const locale: Locale = detectLocale();

document.documentElement.lang = locale;

export function t(key: MessageKey, params?: Record<string, string>): string {
  const message = messages[locale][key];
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}
