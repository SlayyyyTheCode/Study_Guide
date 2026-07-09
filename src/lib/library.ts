import type { DB } from "./db";

export interface CategoryRow { id: number; name: string; icon: string; created_at: string; }
export interface LibraryItemRow {
  id: number; category_id: number; title: string; kind: "file" | "result";
  content_md: string; source_path: string | null; method: string | null; created_at: string;
}
export type LibraryItemMeta = Omit<LibraryItemRow, "content_md"> & { category_name: string; due_count: number };

export function ensureCategory(db: DB, name: string, icon = "📁"): CategoryRow {
  db.prepare("INSERT OR IGNORE INTO categories (name, icon) VALUES (?, ?)").run(name, icon);
  return db.prepare("SELECT * FROM categories WHERE name = ?").get(name) as CategoryRow;
}
export function listCategories(db: DB): CategoryRow[] {
  return db.prepare("SELECT * FROM categories ORDER BY name").all() as CategoryRow[];
}
export function renameCategory(db: DB, id: number, name: string): void {
  db.prepare("UPDATE categories SET name = ? WHERE id = ?").run(name, id);
}
export function deleteCategory(db: DB, id: number): void {
  const uncat = ensureCategory(db, "Uncategorized", "🗂️");
  if (uncat.id === id) return; // never delete the fallback bucket
  db.transaction(() => {
    db.prepare("UPDATE library_items SET category_id = ? WHERE category_id = ?").run(uncat.id, id);
    db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  })();
}

export function createLibraryItem(db: DB, item: {
  title: string; kind: "file" | "result"; content_md: string;
  categoryId: number; method?: string; source_path?: string;
}): LibraryItemRow {
  const info = db.prepare(
    "INSERT INTO library_items (category_id, title, kind, content_md, source_path, method) VALUES (?,?,?,?,?,?)"
  ).run(item.categoryId, item.title, item.kind, item.content_md, item.source_path ?? null, item.method ?? null);
  return getLibraryItem(db, Number(info.lastInsertRowid))!;
}
export function getLibraryItem(db: DB, id: number): LibraryItemRow | undefined {
  return db.prepare("SELECT * FROM library_items WHERE id = ?").get(id) as LibraryItemRow | undefined;
}
export function listLibraryItems(db: DB, f: { search?: string; categoryId?: number }): LibraryItemMeta[] {
  const where: string[] = []; const args: unknown[] = [];
  if (f.search) {
    const esc = f.search.replace(/[\\%_]/g, m => "\\" + m); // literal search: escape LIKE wildcards
    where.push("(li.title LIKE ? ESCAPE '\\' OR li.content_md LIKE ? ESCAPE '\\')");
    args.push(`%${esc}%`, `%${esc}%`);
  }
  if (f.categoryId) { where.push("li.category_id = ?"); args.push(f.categoryId); }
  const sql = `SELECT li.id, li.category_id, li.title, li.kind, li.source_path, li.method, li.created_at,
                      c.name AS category_name, COALESCE(due.cnt, 0) AS due_count
               FROM library_items li
               JOIN categories c ON c.id = li.category_id
               LEFT JOIN (
                 SELECT library_item_id, COUNT(*) AS cnt FROM flashcard_reviews
                 WHERE library_item_id IS NOT NULL AND (next_review_at IS NULL OR next_review_at <= datetime('now'))
                 GROUP BY library_item_id
               ) due ON due.library_item_id = li.id
               ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY li.created_at DESC`;
  return db.prepare(sql).all(...args) as LibraryItemMeta[];
}
export function updateLibraryItem(db: DB, id: number, patch: { title?: string; categoryId?: number }): void {
  if (patch.title !== undefined) db.prepare("UPDATE library_items SET title = ? WHERE id = ?").run(patch.title, id);
  if (patch.categoryId !== undefined) db.prepare("UPDATE library_items SET category_id = ? WHERE id = ?").run(patch.categoryId, id);
}
export function deleteLibraryItem(db: DB, id: number): void {
  db.transaction(() => {
    db.prepare("DELETE FROM flashcard_reviews WHERE library_item_id = ?").run(id);
    db.prepare("DELETE FROM library_items WHERE id = ?").run(id);
  })();
}
/** Snapshot an uploaded text file into the library under a category named after its workflow. */
export function captureFileToLibrary(
  db: DB, workflowName: string | undefined, filename: string, contentMd: string, sourcePath: string,
): LibraryItemRow {
  const cat = ensureCategory(db, workflowName ?? "Uncategorized");
  return createLibraryItem(db, {
    title: filename, kind: "file", content_md: contentMd,
    categoryId: cat.id, source_path: sourcePath,
  });
}
/** Concatenate all items in a category as one material bundle (same format as multi-file gathering). */
export function gatherCategoryContent(db: DB, categoryId: number): string {
  const rows = db.prepare("SELECT title, content_md FROM library_items WHERE category_id = ? ORDER BY created_at").all(categoryId) as { title: string; content_md: string }[];
  return rows.map(r => `--- ${r.title} ---\n${r.content_md}`).join("\n\n");
}
