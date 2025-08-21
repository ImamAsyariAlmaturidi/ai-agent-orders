import { createApp } from "./app.js";
import { CONFIG } from "./config/index.js";
import { MCPConnectionManager } from "./mcp/index.js";
import { DatabaseManager } from "./models/mongo.js";

const PORT = Number(CONFIG.PORT) || 3001;

(async () => {
  const app = await createApp();

  // Non-blocking MCP connect
  MCPConnectionManager.connect().catch(console.warn);

  const server = app.listen(PORT, () =>
    console.log(`🚀 Server running on http://localhost:${PORT}`)
  );

  const gracefulShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down...`);
    server.close();
    await MCPConnectionManager.disconnect();
    await DatabaseManager.disconnect();
    process.exit(0);
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
})();
