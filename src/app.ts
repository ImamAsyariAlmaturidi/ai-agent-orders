// createApp.ts
import express from "express";
import path from "path";
import { DatabaseManager } from "./models/mongo.js"; // ✅ singleton
import { MCPConnectionManager } from "./mcp/index";
import { ConversationManager } from "./conversation/index";
import { processChat } from "./agent/index";

export const createApp = async () => {
  const app = express();

  // Connect to MongoDB
  await DatabaseManager.connect();
  const db = DatabaseManager.getDb();

  const conversationManager = ConversationManager(db);
  const mcpStatus = MCPConnectionManager.getStatus();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.static(path.join(process.cwd(), "public")));

  // CORS
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
  });

  app.get("/", (_req, res) =>
    res.sendFile(path.join(process.cwd(), "public/index.html"))
  );

  app.get("/health", async (_req, res) => {
    const dbStatus = DatabaseManager.getDb() ? "connected" : "disconnected"; // ✅ singleton
    const healthy = await MCPConnectionManager.healthCheck();
    res.json({
      status: "ok",
      services: { database: dbStatus, mcp: mcpStatus, mcpHealthy: healthy },
    });
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { sessionId, message, userId } = req.body;
      if (!userId || !message)
        return res.status(400).json({ error: "userId and message required" });

      const response = await processChat(
        message,
        userId,
        sessionId,
        db,
        conversationManager,
        mcpStatus
      );
      res.json(response);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return app;
};
