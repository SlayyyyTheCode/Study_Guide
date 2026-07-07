import { describe, it, expect, vi } from "vitest";
import path from "path";

vi.mock("pdf-parse", () => ({ default: vi.fn(async () => ({ text: "PDF TEXT", numpages: 3 })) }));
vi.mock("mammoth", () => ({ extractRawText: vi.fn(async () => ({ value: "DOCX TEXT" })) }));

import { extractFile, isImage } from "@/lib/extract";
const fx = (f: string) => path.join(__dirname, "fixtures", f);

describe("extract", () => {
  it("reads txt", async () => {
    const r = await extractFile(fx("sample.txt"));
    expect(r.kind).toBe("text");
    expect(r.text).toContain("powerhouse");
  });
  it("reads md", async () => {
    const r = await extractFile(fx("sample.md"));
    expect(r.text).toContain("Osmosis");
  });
  it("routes pdf to pdf-parse", async () => {
    const r = await extractFile(fx("notes.pdf"));
    expect(r.text).toBe("PDF TEXT");
    expect(r.pages).toBe(3);
  });
  it("routes docx to mammoth", async () => {
    const r = await extractFile(fx("notes.docx"));
    expect(r.text).toBe("DOCX TEXT");
  });
  it("flags images", async () => {
    const r = await extractFile("photo.PNG");
    expect(r.kind).toBe("image");
    expect(isImage("a.jpg")).toBe(true);
  });
  it("marks empty pdf text as needs_vision", async () => {
    const pdfParse = (await import("pdf-parse")).default as unknown as ReturnType<typeof vi.fn>;
    pdfParse.mockResolvedValueOnce({ text: "   ", numpages: 2 });
    const r = await extractFile(fx("notes.pdf"));
    expect(r.kind).toBe("needs_vision");
  });
  it("rejects unknown extensions", async () => {
    await expect(extractFile("x.xyz")).rejects.toThrow(/unsupported/i);
  });
});
