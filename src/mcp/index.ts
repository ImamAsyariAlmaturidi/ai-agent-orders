import { MCPServerStreamableHttp } from "@openai/agents";

export class MCPConnectionManager {
  private static mcpServer: MCPServerStreamableHttp | null = null;
  private static isConnected = false;

  static async connect(url?: string): Promise<MCPServerStreamableHttp | null> {
    if (this.isConnected && this.mcpServer) return this.mcpServer;

    try {
      const mcpUrl = url || "http://localhost:3000";
      this.mcpServer = new MCPServerStreamableHttp({
        name: "ai-agent-mcp-client",
        url: `${mcpUrl}/mcp`,
      });

      await this.mcpServer.connect();
      this.isConnected = true;
      console.log(`✅ Connected to MCP server at ${mcpUrl}`);
      return this.mcpServer;
    } catch (err) {
      console.warn("⚠️ MCP connection failed:", err);
      this.isConnected = false;
      return null;
    }
  }

  static getStatus() {
    return this.isConnected ? "connected" : "disconnected";
  }

  static async healthCheck(url?: string) {
    const mcpUrl = url || "http://localhost:3000";
    try {
      const res = await fetch(`${mcpUrl}/health`);
      return res.ok;
    } catch {
      return false;
    }
  }

  static async disconnect() {
    this.mcpServer = null;
    this.isConnected = false;
    console.log("✅ Disconnected MCP server");
  }
}
