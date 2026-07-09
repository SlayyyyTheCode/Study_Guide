import type { Card } from "./parse";

/**
 * Literal tabs would be read as an extra field separator by Anki's TSV
 * importer, so they're replaced with spaces. Literal newlines break the
 * one-line-per-card format, so they become <br> — Anki fields support HTML.
 */
function escapeField(s: string): string {
  return s.replace(/\t/g, " ").replace(/\r?\n/g, "<br>");
}

export function cardsToTsv(cards: Card[]): string {
  return cards.map(c => `${escapeField(c.front)}\t${escapeField(c.back)}`).join("\n");
}

export function sanitizeFilename(s: string): string {
  const cleaned = s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "flashcards";
}
