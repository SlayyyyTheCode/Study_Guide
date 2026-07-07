"use client";
import { useEffect, useState, useCallback } from "react";
import { useApp } from "@/store";

interface Cat { id: number; name: string; icon: string; }
interface Item { id: number; category_id: number; title: string; kind: string; method: string | null; created_at: string; category_name: string; }

export default function LibraryDrawer() {
  const { drawerOpen, setDrawerOpen, setLibraryPreviewId } = useApp();
  const [cats, setCats] = useState<Cat[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});

  const refresh = useCallback(async () => {
    try {
      const [c, i] = await Promise.all([
        fetch("/api/categories").then(r => r.json()),
        fetch(`/api/library${search ? `?search=${encodeURIComponent(search)}` : ""}`).then(r => r.json()),
      ]);
      setCats(c); setItems(i);
    } catch { /* drawer shows what it has */ }
  }, [search]);
  useEffect(() => { if (drawerOpen) refresh(); }, [drawerOpen, refresh]);

  if (!drawerOpen) return null;

  async function rename(item: Item) {
    const title = window.prompt("New title:", item.title);
    if (!title?.trim()) return;
    await fetch(`/api/library/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() }) });
    refresh();
  }
  async function move(item: Item) {
    const name = window.prompt(`Move to category (existing or new):\n${cats.map(c => c.name).join(", ")}`, item.category_name);
    if (!name?.trim()) return;
    const cat = cats.find(c => c.name === name.trim()) ?? await fetch("/api/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim() }) }).then(r => r.json());
    await fetch(`/api/library/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ categoryId: cat.id }) });
    refresh();
  }
  async function remove(item: Item) {
    if (!window.confirm(`Delete "${item.title}" from library?`)) return;
    await fetch(`/api/library/${item.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <aside className="lib-drawer" role="dialog" aria-label="Library">
      <div className="lib-head">
        <strong>📚 Library</strong>
        <input aria-label="Search library" placeholder="Search…" value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && refresh()} />
        <button type="button" className="node-btn" aria-label="Close library" onClick={() => setDrawerOpen(false)}>✕</button>
      </div>
      <div className="lib-body">
        {cats.map(cat => {
          const catItems = items.filter(i => i.category_id === cat.id);
          if (search && catItems.length === 0) return null;
          return (
            <div key={cat.id}>
              <button type="button" className="lib-cat" onClick={() => setCollapsed(c => ({ ...c, [cat.id]: !c[cat.id] }))}>
                {collapsed[cat.id] ? "▶" : "▼"} {cat.icon} {cat.name} ({catItems.length})
              </button>
              {!collapsed[cat.id] && catItems.map(item => (
                <div key={item.id} className="lib-item" draggable
                  onDragStart={e => e.dataTransfer.setData("application/sg-library",
                    JSON.stringify({ itemId: item.id, title: item.title, categoryName: item.category_name }))}>
                  <span className="lib-item-title" onClick={() => setLibraryPreviewId(item.id)}
                    title="Preview">{item.kind === "file" ? "📄" : "📋"} {item.title}</span>
                  <span className="lib-item-date">{item.created_at.slice(0, 10)}</span>
                  <span className="lib-actions">
                    <button type="button" className="node-btn" aria-label={`Rename ${item.title}`} onClick={() => rename(item)}>✎</button>
                    <button type="button" className="node-btn" aria-label={`Move ${item.title}`} onClick={() => move(item)}>📂</button>
                    <button type="button" className="node-btn" aria-label={`Delete ${item.title}`} onClick={() => remove(item)}>🗑</button>
                  </span>
                </div>
              ))}
              {!collapsed[cat.id] && !search && (
                <div className="lib-item lib-item-cat" draggable
                  onDragStart={e => e.dataTransfer.setData("application/sg-library",
                    JSON.stringify({ categoryId: cat.id, title: `All of ${cat.name}`, categoryName: cat.name }))}>
                  ⤵ drag whole category
                </div>
              )}
            </div>
          );
        })}
        {cats.length === 0 && <p className="lib-empty">Nothing saved yet. Upload files or 💾 save results — they land here.</p>}
      </div>
    </aside>
  );
}
