import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "pdf-parse", "@anthropic-ai/claude-agent-sdk"],
};

export default nextConfig;
