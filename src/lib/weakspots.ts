import type { DB } from "./db";

export interface WeakCard {
  id: number; front: string; back: string; missed: number;
  next_review_at: string | null; library_item_id: number;
  source_title: string; category_name: string;
}
export interface QuizMiss {
  question: string; user_answer: string; feedback: string | null;
  created_at: string; workflow_name: string;
}
export interface WeakSpots { cards: WeakCard[]; quizMisses: QuizMiss[]; }

export function getWeakSpots(db: DB): WeakSpots {
  const cards = db.prepare(`
    SELECT fr.id, fr.front, fr.back, fr.missed, fr.next_review_at, fr.library_item_id,
           li.title AS source_title, c.name AS category_name
    FROM flashcard_reviews fr
    JOIN library_items li ON li.id = fr.library_item_id
    JOIN categories c ON c.id = li.category_id
    WHERE fr.library_item_id IS NOT NULL
      AND (fr.next_review_at IS NULL OR fr.next_review_at <= datetime('now') OR fr.missed >= 2)
    ORDER BY (fr.next_review_at IS NULL) DESC, fr.next_review_at ASC, fr.missed DESC
    LIMIT 20
  `).all() as WeakCard[];

  const quizMisses = db.prepare(`
    SELECT qa.question, qa.user_answer, qa.feedback, qa.created_at, w.name AS workflow_name
    FROM quiz_attempts qa
    JOIN runs r ON r.id = qa.run_id
    JOIN workflows w ON w.id = r.workflow_id
    WHERE qa.correct = 0
    ORDER BY qa.created_at DESC
    LIMIT 20
  `).all() as QuizMiss[];

  return { cards, quizMisses };
}
