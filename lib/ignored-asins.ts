import fs from "fs";
import path from "path";

const FILE_PATH = path.join(process.cwd(), "data", "ignored-asins.json");

export function getIgnoredAsins(): Set<string> {
  try {
    const contents = fs.readFileSync(FILE_PATH, "utf8");

    const asins = JSON.parse(contents);

    return new Set(asins.map((asin: string) => asin.trim().toUpperCase()));
  } catch {
    return new Set();
  }
}
