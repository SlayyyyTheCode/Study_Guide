import fs from "fs/promises";
import path from "path";

export interface ExtractResult {
  kind: "text" | "image" | "needs_vision";
  text: string;
  pages?: number;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
export function isImage(file: string): boolean {
  return IMAGE_EXT.has(path.extname(file).toLowerCase());
}

export async function extractFile(filePath: string): Promise<ExtractResult> {
  const ext = path.extname(filePath).toLowerCase();
  if (IMAGE_EXT.has(ext)) return { kind: "image", text: "" };
  if (ext === ".txt" || ext === ".md") {
    return { kind: "text", text: await fs.readFile(filePath, "utf8") };
  }
  if (ext === ".pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(await fs.readFile(filePath));
    const text = data.text?.trim() ?? "";
    if (!text) return { kind: "needs_vision", text: "", pages: data.numpages };
    return { kind: "text", text, pages: data.numpages };
  }
  if (ext === ".docx" || ext === ".doc") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ path: filePath });
    return { kind: "text", text: value };
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

/** Rough token estimate: ~4 chars per token. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
