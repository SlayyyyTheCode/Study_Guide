import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "@anthropic-ai/claude-agent-sdk"],
  // A stray lockfile in a parent directory (C:\Users\B3n) makes Next.js guess
  // the wrong workspace root under Turbopack. Pin it to this project.
  turbopack: { root: path.resolve(__dirname) },
};

export default nextConfig;
