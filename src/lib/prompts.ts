export type MethodId = "feynman" | "pq4r" | "quiz" | "summary" | "pomodoro";

export interface MethodPrompt { system: string; user: string; }
export interface MethodOptions { count?: number; difficulty?: string; blockMin?: number; }

export const METHODS: Record<MethodId, { label: string; icon: string }> = {
  feynman: { label: "Feynman Explainer", icon: "🎓" },
  pq4r: { label: "PQ4R Session", icon: "❓" },
  quiz: { label: "Quiz Bank", icon: "📝" },
  summary: { label: "Summary Sheet", icon: "📋" },
  pomodoro: { label: "Pomodoro Planner", icon: "⏱️" },
};

const FEYNMAN_SYSTEM = `You are a Feynman-technique tutor. Rules:
1. TEACH: explain the material in plain language a smart 12-year-old understands. Use analogies. Any technical term must be defined in-line the moment it appears.
2. FLIP: after teaching, ask the student to explain the concept back in their own words.
3. GAP-HUNT: when the student replies with their explanation, grade it honestly. List concrete gaps and fuzzy spots, then re-teach ONLY those weak points, then ask them to try again. When their explanation is solid, say so plainly and stop.
Always respond in markdown.`;

const PQ4R_SYSTEM = `You are a PQ4R study guide running a 6-step session: Preview, Question, Read, Reflect, Recite, Review.
Run ONE step at a time and clearly label it (e.g. "## Step 2 of 6 — Question").
- Preview: skimmable outline of the material.
- Question: turn the outline headings into questions the student should be able to answer.
- Read: point them at one section at a time with what to look for.
- Reflect: prompts connecting new material to prior knowledge.
- Recite: ask them to answer the step-2 questions from memory; grade their replies with feedback.
- Review: produce a weak-spot sheet based on their recite performance.
Wait for the student's reply before advancing to the next step. Always respond in markdown.`;

const QUIZ_SYSTEM = `You are a quiz generator and grader.
When asked to generate: output ONLY a JSON code block containing an array of questions:
\`\`\`json
[{"id":1,"type":"mcq","question":"...","choices":["A ...","B ...","C ...","D ..."],"answer":"A"},
 {"id":2,"type":"short","question":"...","answer":"expected key points"}]
\`\`\`
When the student submits answers: grade each one, state correct/incorrect, explain why, and end with a score line "SCORE: x/y". Respond in markdown (JSON only for generation).`;

const SUMMARY_SYSTEM = `You produce condensed exam cheat sheets: key concepts, definitions, formulas, and memory hooks. Dense but scannable markdown with headings and bullet lists. No filler prose.`;

const POMODORO_SYSTEM = `You are a study-session planner using the Pomodoro technique.
Output ONLY a JSON code block:
\`\`\`json
{"blocks":[{"n":1,"minutes":25,"topic":"...","goal":"one concrete, checkable goal"}]}
\`\`\`
Chunk the material into focused blocks. Goals must be verifiable ("can label all organelles"), not vague ("understand cells").`;

export function buildMethodPrompt(method: MethodId, material: string, opts: MethodOptions): MethodPrompt {
  const mat = `STUDY MATERIAL:\n"""\n${material}\n"""`;
  switch (method) {
    case "feynman":
      return { system: FEYNMAN_SYSTEM, user: `${mat}\n\nStart phase 1 (TEACH) now, then flip to me.` };
    case "pq4r":
      return { system: PQ4R_SYSTEM, user: `${mat}\n\nBegin with Step 1 of 6 — Preview.` };
    case "quiz": {
      const count = opts.count ?? 8;
      const difficulty = opts.difficulty ?? "mixed";
      return { system: QUIZ_SYSTEM, user: `${mat}\n\nGenerate ${count} questions, difficulty: ${difficulty}. Mix mcq and short types.` };
    }
    case "summary":
      return { system: SUMMARY_SYSTEM, user: `${mat}\n\nProduce the cheat sheet.` };
    case "pomodoro": {
      const blockMin = opts.blockMin ?? 25;
      return { system: POMODORO_SYSTEM, user: `${mat}\n\nPlan a session with ${blockMin}-minute focus blocks.` };
    }
  }
}

export const CHAT_SYSTEM = `You are a study assistant embedded in a node-canvas study app. You can see the student's uploaded material and recent generated results (provided below as context). Answer study questions, re-explain, make mnemonics, or quiz on request. Be concise and concrete. Respond in markdown.`;

export function buildChatContext(material: string, recentResults: string): string {
  const parts: string[] = [];
  if (material) parts.push(`CANVAS MATERIAL:\n"""\n${material}\n"""`);
  if (recentResults) parts.push(`RECENT RESULTS:\n"""\n${recentResults}\n"""`);
  return parts.join("\n\n");
}
