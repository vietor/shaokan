import { md } from "./mdit";

const ctx = self as unknown as Worker;

ctx.onmessage = (e: MessageEvent<{ id: number; source: string }>) => {
  const { id, source } = e.data;
  try {
    ctx.postMessage({ id, html: md.render(source) });
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  }
};
