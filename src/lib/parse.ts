export interface Card { front: string; back: string; }
export interface MindNode { label: string; children?: MindNode[]; }
export interface MindMap { root: string; children: MindNode[]; }

/** Extract and parse the LAST ```json fenced block in markdown. Null if absent/malformed. */
export function parseJsonBlock<T>(md: string): T | null {
  const matches = [...md.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length === 0) return null;
  try { return JSON.parse(matches[matches.length - 1][1]) as T; } catch { return null; }
}

export function parseCards(md: string): Card[] | null {
  const obj = parseJsonBlock<{ cards?: unknown }>(md);
  if (!obj || !Array.isArray(obj.cards)) return null;
  const ok = obj.cards.every(c => c && typeof (c as Card).front === "string" && typeof (c as Card).back === "string");
  return ok ? (obj.cards as Card[]) : null;
}

function validNode(n: unknown): boolean {
  if (!n || typeof (n as MindNode).label !== "string") return false;
  const ch = (n as MindNode).children;
  return ch === undefined || (Array.isArray(ch) && ch.every(validNode));
}
export function parseMindmap(md: string): MindMap | null {
  const obj = parseJsonBlock<MindMap>(md);
  if (!obj || typeof obj.root !== "string" || !Array.isArray(obj.children) || !obj.children.every(validNode)) return null;
  return obj;
}

export interface QuizResult { id: number; correct: boolean; }
export function parseQuizResults(md: string): QuizResult[] | null {
  const obj = parseJsonBlock<{ results?: unknown }>(md);
  if (!obj || !Array.isArray(obj.results)) return null;
  const ok = obj.results.every(r => r && typeof (r as QuizResult).id === "number" && typeof (r as QuizResult).correct === "boolean");
  return ok ? (obj.results as QuizResult[]) : null;
}
