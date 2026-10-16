import { invoke, isTauri, convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { open } from "@tauri-apps/plugin-dialog";
import { watch } from "@tauri-apps/plugin-fs";
import type { MdFile } from "./types";

export const isNative = isTauri();

const DEV_DIR = "/dev-docs";

const devDocs = import.meta.glob<string>("/dev-docs/*.{md,markdown}", {
  query: "?raw",
  import: "default",
});

const webDropped = new Map<string, File>();

const byName = (a: MdFile, b: MdFile) => {
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

export async function getHomeDir(): Promise<string> {
  return isNative ? invoke<string>("get_home_dir") : DEV_DIR;
}

export async function pickDirectory(): Promise<string | null> {
  if (!isNative) return null;
  return open({ directory: true });
}

export async function listMdFiles(dir: string): Promise<MdFile[]> {
  if (isNative) return invoke<MdFile[]>("list_md_files", { dir });
  const prefix = `${dir}/`;
  return Object.keys(devDocs)
    .filter((p) => p.startsWith(prefix))
    .map((p) => ({ name: p.slice(prefix.length), path: p }))
    .sort(byName);
}

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join("/")}`;
}

export async function readMdFile(path: string): Promise<string> {
  if (isNative) return invoke<string>("read_md_file", { path });
  const dropped = webDropped.get(path);
  if (dropped) return dropped.text();
  const load = devDocs[normalizePath(path)];
  if (!load) throw `file_not_found:${path}`;
  return load();
}

export function setWindowTitle(title: string) {
  if (isNative) {
    getCurrentWindow().setTitle(title).catch(() => {});
  } else {
    document.title = title;
  }
}

export function openExternal(url: string) {
  if (isNative) {
    openUrl(url).catch((err) => console.error(err));
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export function onDirChange(dir: string, handler: (paths: string[]) => void): () => void {
  if (!isNative) return () => {};
  let unwatch: (() => void) | undefined;
  let stopped = false;
  watch(dir, (event) => handler(event.paths), { delayMs: 300, recursive: false })
    .then((un) => {
      if (stopped) un();
      else unwatch = un;
    })
    .catch(() => {});
  return () => {
    stopped = true;
    unwatch?.();
  };
}

export function localImageUrl(dir: string, src: string): string {
  if (!isNative) return src;
  let name: string;
  try {
    name = decodeURIComponent(src);
  } catch {
    name = src;
  }
  return convertFileSrc(`${dir}/${name.replace(/\\/g, "/")}`);
}

export function onNativeFileDrop(handler: (path: string) => void): () => void {
  const unlisten = getCurrentWindow().onDragDropEvent((event) => {
    if (event.payload.type !== "drop") return;
    const path = event.payload.paths.find((p) => /\.(md|markdown)$/i.test(p));
    if (path) handler(path);
  });
  return () => {
    unlisten.then((f) => f());
  };
}

export function onWebFileDrop(handler: (file: File) => void): () => void {
  const onDragOver = (e: DragEvent) => e.preventDefault();
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = Array.from(e.dataTransfer?.files ?? []).find((f) =>
      /\.(md|markdown)$/i.test(f.name)
    );
    if (!file) return;
    webDropped.set(file.name, file);
    handler(file);
  };
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("drop", onDrop);
  return () => {
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("drop", onDrop);
  };
}
