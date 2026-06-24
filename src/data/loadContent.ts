import { readFileSync } from "node:fs";
import path from "node:path";

import type { ContentBundle } from "../core/types.js";

export function defaultContentBundlePath(): string {
  return path.resolve(process.cwd(), "data", "content_bundle.json");
}

export function loadContentBundle(filePath = defaultContentBundlePath()): ContentBundle {
  const rawContent = readFileSync(filePath, "utf8");
  return JSON.parse(rawContent) as ContentBundle;
}
