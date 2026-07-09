import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "@/lib/db";
import {
  ensureCategory, listCategories, renameCategory, deleteCategory,
  createLibraryItem, listLibraryItems, getLibraryItem, updateLibraryItem, deleteLibraryItem,
  captureFileToLibrary,
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

  it("deleteLibraryItem cascades its flashcard_reviews rows", () => {
    const bio = ensureCategory(db, "Biology");
    const item = createLibraryItem(db, { title: "Deck", kind: "result", content_md: "{}", categoryId: bio.id, method: "flashcards" });
    db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back) VALUES (?,?,?)").run(item.id, "Q", "A");
    deleteLibraryItem(db, item.id);
    const remaining = db.prepare("SELECT COUNT(*) AS n FROM flashcard_reviews WHERE library_item_id = ?").get(item.id) as { n: number };
    expect(remaining.n).toBe(0);
  });

  it("renameCategory works", () => {
    const c = ensureCategory(db, "Bio");
    renameCategory(db, c.id, "Biology 2");
    expect(listCategories(db).find(x => x.id === c.id)!.name).toBe("Biology 2");
  });

  it("search treats LIKE wildcards literally", () => {
    const bio = ensureCategory(db, "Biology");
    createLibraryItem(db, { title: "Stats", kind: "file", content_md: "scored 50% on the quiz", categoryId: bio.id });
    createLibraryItem(db, { title: "Other", kind: "file", content_md: "scored 505 points", categoryId: bio.id });
    createLibraryItem(db, { title: "Files", kind: "file", content_md: "see file_name conventions", categoryId: bio.id });
    createLibraryItem(db, { title: "Decoy", kind: "file", content_md: "see fileXname conventions", categoryId: bio.id });
    expect(listLibraryItems(db, { search: "50%" }).map(i => i.title)).toEqual(["Stats"]);
    expect(listLibraryItems(db, { search: "file_name" }).map(i => i.title)).toEqual(["Files"]);
  });

  it("captureFileToLibrary creates category from workflow name and snapshots the file", () => {
    const item = captureFileToLibrary(db, "My Session", "notes.md", "# Notes\nbody", "/uploads/1/notes.md");
    const full = getLibraryItem(db, item.id)!;
    expect(full.kind).toBe("file");
    expect(full.title).toBe("notes.md");
    expect(full.content_md).toContain("body");
    expect(full.source_path).toBe("/uploads/1/notes.md");
    const cat = listCategories(db).find(c => c.id === full.category_id)!;
    expect(cat.name).toBe("My Session");
  });

  it("captureFileToLibrary falls back to Uncategorized when workflow name is undefined", () => {
    const item = captureFileToLibrary(db, undefined, "orphan.md", "text", "/uploads/9/orphan.md");
    const cat = listCategories(db).find(c => c.id === item.category_id)!;
    expect(cat.name).toBe("Uncategorized");
  });

  it("listLibraryItems reports due flashcard count per item", () => {
    const cat = ensureCategory(db, "Bio");
    const item = createLibraryItem(db, { title: "Cells", kind: "result", content_md: "{}", categoryId: cat.id, method: "flashcards" });
    db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, next_review_at) VALUES (?,?,?,?)").run(item.id, "f1", "b1", null);
    db.prepare("INSERT INTO flashcard_reviews (library_item_id, front, back, next_review_at) VALUES (?,?,?,?)").run(item.id, "f2", "b2", "2999-01-01 00:00:00");
    const meta = listLibraryItems(db, {}).find(i => i.id === item.id)!;
    expect(meta.due_count).toBe(1);
  });
});
