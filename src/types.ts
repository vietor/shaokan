export interface MdFile {
  name: string;
  path: string;
}

export interface OutlineItem {
  level: number;
  text: string;
  id: string;
}

export type ThemeMode = "light" | "dark" | "system";
