// src/config/index.ts
import dotenv from "dotenv";

dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT || 3001,
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/ai-agent",
  MCP_SERVER_URL: process.env.MCP_SERVER_URL || "http://localhost:3000",
  NODE_ENV: process.env.NODE_ENV || "development",
  MAX_CONVERSATION_HISTORY: 10,
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  AGENT_MODEL: "gpt-4o",
  MAX_TURNS: 5,
};
