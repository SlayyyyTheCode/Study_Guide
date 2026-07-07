import type { BrainDriver } from "./types";
import { claudeDriver } from "./claude";
import { ollamaDriver } from "./ollama";

export const DRIVERS: Record<string, BrainDriver> = {
  claude: claudeDriver,
  ollama: ollamaDriver,
};

export function getDriver(id: string): BrainDriver {
  const d = DRIVERS[id];
  if (!d) throw new Error(`Unknown brain provider: ${id}`);
  return d;
}
