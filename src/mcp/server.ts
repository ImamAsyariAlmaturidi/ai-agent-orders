import express from "express";
import { z } from "zod";
import { DatabaseManager } from "../models/mongo.js"; // ✅ singleton
const DatabaseSchema = z.object({
  data: z.object({
    name: z.string(),
    age: z.number(),
    city: z.string(),
  }),
});

class HttpMCPServer {
  private app: express.Application;
  private port: number;

  constructor(port = 3000) {
    this.app = express();
    this.port = port;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());

    // CORS middleware
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
      res.header("Access-Control-Allow-Headers", "Content-Type");
      next();
    });

    // Logging middleware
    this.app.use((req, res, next) => {
      next();
    });
  }

  private setupRoutes() {
    // Health check
    this.app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        mcp_endpoint: "/mcp",
        tools_endpoint: "/tools",
      });
    });

    // Root endpoint
    this.app.get("/", (req, res) => {
      res.json({
        message: "MCP HTTP Server is running!",
        endpoints: {
          "/health": "GET - Health check",
          "/mcp": "POST - MCP Protocol endpoint",
          "/tools": "GET - List available tools",

          "/tools/database_query": "POST - Database query",
        },
      });
    });

    // MCP Protocol endpoint (yang dibutuhkan oleh MCPServerStreamableHttp)
    this.app.post("/mcp", async (req, res) => {
      try {
        const { method, params, id } = req.body;

        // Handle notifications (no id field)
        if (method.startsWith("notifications/")) {
          switch (method) {
            case "notifications/initialized":
              console.log("Client initialized successfully");
              break;
            default:
              console.log(`Unknown notification: ${method}`);
          }

          // Notifications don't need responses with id
          res.status(200).end();
          return;
        }

        // Handle regular requests (have id field)
        switch (method) {
          case "initialize":
            res.json({
              jsonrpc: "2.0",
              id: req.body.id,
              result: {
                protocolVersion: "2025-06-18", // Match client version
                capabilities: {
                  tools: {
                    listChanged: true,
                  },
                },
                serverInfo: {
                  name: "http-mcp-server",
                  version: "1.0.0",
                },
              },
            });
            break;

          case "tools/list":
            res.json({
              jsonrpc: "2.0",
              id: req.body.id,
              result: {
                tools: [
                  {
                    name: "database_insert",
                    description: "Excute database insert queries",
                    inputSchema: {
                      type: "object",
                      properties: {
                        data: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            age: { type: "number" },
                            city: { type: "string" },
                          },
                          required: ["name", "age", "city"],
                        },
                      },
                      required: ["query"],
                    },
                  },
                ],
              },
            });
            break;

          case "tools/call":
            const toolName = params?.name;
            const toolArgs = params?.arguments || {};

            let toolResult;

            switch (toolName) {
              case "database_insert":
                toolResult = await this.handleDatabaseQuery(toolArgs);
                break;
              case "add":
                toolResult = await this.handleAdd(toolArgs);
                break;
              default:
                throw new Error(`Tool ${toolName} tidak dikenali`);
            }

            res.json({
              jsonrpc: "2.0",
              id: req.body.id,
              result: {
                content: [
                  {
                    type: "text",
                    text:
                      typeof toolResult === "string"
                        ? toolResult
                        : JSON.stringify(toolResult, null, 2),
                  },
                ],
              },
            });
            break;

          case "notifications/initialized":
            // Handle initialization notification (no response needed for notifications)
            console.log("Client initialized successfully");
            res.status(200).json({ status: "ok" });
            break;

          case "ping":
            res.json({
              jsonrpc: "2.0",
              id: req.body.id,
              result: {},
            });
            break;

          case "notifications/initialized":
            // Handle initialization notification (no response needed for notifications)
            console.log("Client initialized successfully");
            res.status(200).json({ status: "ok" });
            break;

          case "ping":
            res.json({
              jsonrpc: "2.0",
              id: req.body.id,
              result: {},
            });
            break;

          default:
            res.status(400).json({
              jsonrpc: "2.0",
              id: req.body.id,
              error: {
                code: -32601,
                message: `Method ${method} not found`,
              },
            });
        }
      } catch (error) {
        console.error("MCP Error:", error);
        res.status(500).json({
          jsonrpc: "2.0",
          id: req.body.id,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });

    // Legacy REST endpoints (untuk compatibility)
    this.app.get("/tools", (req, res) => {
      res.json({
        tools: [
          {
            name: "database_query",
            description: "Execute database queries",
            endpoint: "/tools/database_query",
            method: "POST",
          },
        ],
      });
    });

    this.app.post("/tools/database_query", async (req, res) => {
      try {
        const result = await this.handleDatabaseQuery(req.body);
        res.json({ success: true, data: result });
      } catch (error) {
        res.status(400).json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  // Tool handlers
  private async handleAdd(args: any) {
    const { a, b } = args;
    const result = Number(a) + Number(b);
    return `${a} + ${b} = ${result}`;
  }

  private async handleDatabaseQuery(args: any) {
    const { data } = DatabaseSchema.parse(args);

    // Pastikan koneksi MongoDB sudah terbuka
    const db = await DatabaseManager.connect();
    const users = await db.collection("users").insertOne(data);

    console.log;

    return {
      rows: users,
    };
  }

  public start() {
    this.app.listen(this.port, () => {
      console.log(
        `🚀 MCP HTTP Server running on http://localhost:${this.port}`
      );
      console.log(
        `🔧 MCP Protocol endpoint: http://localhost:${this.port}/mcp`
      );
      console.log(`📋 Available endpoints:`);
      console.log(`   GET  http://localhost:${this.port}/`);
      console.log(`   GET  http://localhost:${this.port}/health`);
      console.log(`   POST http://localhost:${this.port}/mcp`);
      console.log(`   GET  http://localhost:${this.port}/tools`);
    });
  }
}

// Start server
const server = new HttpMCPServer(3000);
server.start();
