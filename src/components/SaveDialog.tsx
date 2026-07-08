"use client";
import { useEffect, useState } from "react";

interface CategoryRow { id: number; name: string; icon: string; }

interface Props {
  defaultTitle: string;
  contentMd: string;
  method: string | null;
  onClose: () => void;
  /** Called after a successful save (parent shows its own "Saved ✓" flash). */
  onSaved: () => void;
}

export default function SaveDialog({ defaultTitle, contentMd, method, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/categories").then(r => r.json()).then((cats: CategoryRow[]) => {
      if (!alive) return;
      setCategories(cats);
      // Fresh install: no categories yet — go straight to new-category input.
      if (cats.length === 0) setNewCategory("");
      else setCategoryId(String(cats[0].id));
    }).catch(() => { if (alive) setNewCategory(""); });
    return () => { alive = false; };
  }, []);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { title: title.trim(), kind: "result", content_md: contentMd, method };
      if (newCategory !== null && newCategory.trim()) body.newCategoryName = newCategory.trim();
      else body.categoryId = Number(categoryId);
      const res = await fetch("/api/library", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = `Save failed (${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* body not JSON */ }
        setError(msg);
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="save-dialog">
      <input aria-label="Save title" value={title} onChange={e => setTitle(e.target.value)} />
      {newCategory === null ? (
        <select aria-label="Category" value={categoryId} onChange={e => {
          if (e.target.value === "__new__") setNewCategory(""); else setCategoryId(e.target.value);
        }}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          <option value="__new__">+ New category…</option>
        </select>
      ) : (
        <input aria-label="New category name" placeholder="New category name" value={newCategory}
          onChange={e => setNewCategory(e.target.value)} />
      )}
      {error && <div className="save-error" role="alert">⛔ {error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="node-btn" disabled={saving || !title.trim()} onClick={save}>Save</button>
        <button type="button" className="node-btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
