import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "@/lib/db";
import {
  ensureCategory, listCategories, renameCategory, deleteCategory,
  createLibraryItem, listLibraryItems, getLibraryItem, updateLibraryItem, deleteLibraryItem,
} from "@/lib/library";

let db: DB;
beforeEach(() => { db = openDb(":memory:"); });

describe("library", () => {
  it("ensureCategory creates once and is idempotent", () => {
    const a = ensureCategory(db, "Biology");
    const b = ensureCategory(db, "Biology");
    expect(a.id).toBe(b.id);
    expect(listCategories(db).map(c => c.name)).toContain("Biology");
  });

  it("creates and fetches items with content", () => {
    const cat = ensureCategory(db, "Biology");
    const item = createLibraryItem(db, {
      title: "Cell summary", kind: "result", content_md: "# Cells\nOsmosis...",
      categoryId: cat.id, method: "summary",
    });
    const full = getLibraryItem(db, item.id)!;
    expect(full.content_md).toContain("Osmosis");
    expect(full.category_id).toBe(cat.id);
  });

  it("lists with search over title and content, and by category", () => {
    const bio = ensureCategory(db, "Biology");
    const hist = ensureCategory(db, "History");
    createLibraryItem(db, { title: "Cells", kind: "file", content_md: "mitochondria text", categoryId: bio.id });
    createLibraryItem(db, { title: "WW2 notes", kind: "file", content_md: "treaty text", categoryId: hist.id });
    expect(listLibraryItems(db, { search: "mitochondria" }).map(i => i.title)).toEqual(["Cells"]);
    expect(listLibraryItems(db, { categoryId: hist.id }).map(i => i.title)).toEqual(["WW2 notes"]);
    expect(listLibraryItems(db, {}).length).toBe(2);
  });

  it("update renames and recategorizes", () => {
    const bio = ensureCategory(db, "Biology");
    const item = createLibraryItem(db, { title: "x", kind: "file", content_md: "c", categoryId: bio.id });
    const hist = ensureCategory(db, "History");
    updateLibraryItem(db, item.id, { title: "y", categoryId: hist.id });
    const full = getLibraryItem(db, item.id)!;
    expect(full.title).toBe("y");
    expect(full.category_id).toBe(hist.id);
  });

  it("deleteCategory moves items to Uncategorized, never deletes them", () => {
    const bio = ensureCategory(db, "Biology");
    const item = createLibraryItem(db, { title: "keep me", kind: "file", content_md: "c", categoryId: bio.id });
    deleteCategory(db, bio.id);
    const full = getLibraryItem(db, item.id)!;
    const uncat = listCategories(db).find(c => c.name === "Uncategorized")!;
    expect(full.category_id).toBe(uncat.id);
    expect(listCategories(db).find(c => c.name === "Biology")).toBeUndefined();
  });

  it("deleteLibraryItem removes the row", () => {
    const bio = ensureCategory(db, "Biology");
    const item = createLibraryItem(db, { title: "x", kind: "file", content_md: "c", categoryId: bio.id });
    deleteLibraryItem(db, item.id);
    expect(getLibraryItem(db, item.id)).toBeUndefined();
  });

  it("renameCategory works", () => {
    const c = ensureCategory(db, "Bio");
    renameCategory(db, c.id, "Biology 2");
    expect(listCategories(db).find(x => x.id === c.id)!.name).toBe("Biology 2");
  });
});
