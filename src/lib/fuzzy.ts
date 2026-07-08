/** Subsequence fuzzy match: all query chars appear in order. */
export function fuzzy(query: string, target: string): boolean {
  const q = query.toLowerCase(); const t = target.toLowerCase();
  let i = 0;
  for (const ch of t) if (ch === q[i]) i++;
  return i >= q.length;
}
