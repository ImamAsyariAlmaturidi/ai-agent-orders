import express from "express";
import { z } from "zod";

// --- Schemas ---
const DatabaseSchema = z.object({
  query: z.string(),
  database: z.string().default("main"),
});

// --- Types ---
interface OrderItem {
  productId: number;
  name: string;
  quantity: number;
  price: number;
}

interface Order {
  userId: string;
  items: OrderItem[];
  status: string;
}

interface Invoice extends Order {
  invoiceId: string;
  total: number;
}

// Tool argument types
interface AddArgs {
  a: number;
  b: number;
}

interface CartArgs {
  userId: string;
  productId: number;
  quantity: number;
}

interface UpdateOrderArgs {
  orderId: string;
  status: string;
}

interface GenerateInvoiceArgs {
  orderId: string;
}

interface GetInvoiceArgs {
  invoiceId: string;
}

// --- In-memory storage ---
const carts: Record<string, CartArgs[]> = {};
const orders: Record<string, Order> = {};
const invoices: Record<string, Invoice> = {};

// --- Tool Handlers ---
function handleAdd({ a, b }: AddArgs) {
  return `${a} + ${b} = ${a + b}`;
}

async function handleDatabaseQuery(args: unknown) {
  const { query, database } = DatabaseSchema.parse(args);
  return {
    query,
    database,
    rows: [
      { id: 1, name: "John Doe", email: "john@example.com" },
      { id: 2, name: "Jane Smith", email: "jane@example.com" },
    ],
    row_count: 2,
    execution_time: "0.05ms",
  };
}

function handleGetProduct({ productId }: { productId: number }) {
  return { id: productId, name: `Product ${productId}`, price: 100 };
}

function handleListProducts() {
  return [
    { id: 1, name: "Product 1", price: 100 },
    { id: 2, name: "Product 2", price: 200 },
    { id: 3, name: "Product 3", price: 300 },
  ];
}

function handleAddToCart({ userId, productId, quantity }: CartArgs) {
  if (!carts[userId]) carts[userId] = [];
  carts[userId].push({ userId, productId, quantity });
  return carts[userId];
}

function handleUpdateCart({ userId, productId, quantity }: CartArgs) {
  if (!carts[userId]) carts[userId] = [];
  const item = carts[userId].find((i) => i.productId === productId);
  if (item) item.quantity = quantity;
  return carts[userId];
}

function handleViewCart({ userId }: { userId: string }) {
  return carts[userId] || [];
}

function handleCreateOrder({ userId }: { userId: string }) {
  const cart = carts[userId] || [];

  // Mapping cart items ke OrderItem lengkap
  const items: OrderItem[] = cart.map((c) => {
    const product = handleGetProduct({ productId: c.productId });
    return {
      productId: c.productId,
      name: product.name,
      price: product.price,
      quantity: c.quantity,
    };
  });

  const orderId = `ORD-${Date.now()}`;
  orders[orderId] = { userId, items, status: "pending" };

  // Kosongkan cart
  carts[userId] = [];

  return orders[orderId];
}

function handleUpdateOrder({ orderId, status }: UpdateOrderArgs) {
  if (!orders[orderId]) throw new Error("Order not found");
  orders[orderId].status = status;
  return orders[orderId];
}

function handleGenerateInvoice({ orderId }: GenerateInvoiceArgs) {
  if (!orders[orderId]) throw new Error("Order not found");
  const invoiceId = `INV-${Date.now()}`;
  const order = orders[orderId];
  const total = order.items.reduce((acc, i) => acc + i.quantity * i.price, 0);
  invoices[invoiceId] = { ...order, invoiceId, total };
  return invoices[invoiceId];
}

function handleGetInvoice({ invoiceId }: GetInvoiceArgs) {
  if (!invoices[invoiceId]) throw new Error("Invoice not found");
  return invoices[invoiceId];
}

// --- Express Server ---
function createServer(port = 3000) {
  const app = express();
  app.use(express.json());

  // CORS
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  // Health check
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      mcp_endpoint: "/mcp",
      tools_endpoint: "/tools",
    });
  });

  // Root
  app.get("/", (_req, res) => {
    res.json({ message: "MCP HTTP Server is running!" });
  });

  // MCP endpoint
  app.post("/mcp", async (req, res) => {
    try {
      const { method, params, id } = req.body;

      if (method?.startsWith("notifications/")) {
        console.log(`Notification: ${method}`);
        return res.status(200).end();
      }

      let toolResult;

      switch (method) {
        case "initialize":
          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: "2025-06-18",
              capabilities: { tools: { listChanged: true } },
              serverInfo: { name: "http-mcp-server", version: "1.0.0" },
            },
          });

        case "tools/list":
          return res.json({
            jsonrpc: "2.0",
            id,
            result: {
              tools: [
                { name: "get_product", description: "Get product by ID" },
                { name: "list_products", description: "List all products" },
                { name: "add_to_cart", description: "Add product to cart" },
                { name: "update_cart", description: "Update cart item" },
                { name: "view_cart", description: "View user cart" },
                { name: "create_order", description: "Create order from cart" },
                { name: "update_order", description: "Update order status" },
                { name: "generate_invoice", description: "Generate invoice" },
                { name: "get_invoice", description: "Get invoice by ID" },
                {
                  name: "database_query",
                  description: "Execute database queries",
                },
                { name: "add", description: "Simple addition" },
              ],
            },
          });

        case "tools/call":
          const toolName: string = params?.name;
          const toolArgs: any = params?.arguments || {};

          switch (toolName) {
            case "get_product":
              toolResult = handleGetProduct(toolArgs);
              break;
            case "list_products":
              toolResult = handleListProducts();
              break;
            case "add_to_cart":
              toolResult = handleAddToCart(toolArgs);
              break;
            case "update_cart":
              toolResult = handleUpdateCart(toolArgs);
              break;
            case "view_cart":
              toolResult = handleViewCart(toolArgs);
              break;
            case "create_order":
              toolResult = handleCreateOrder(toolArgs);
              break;
            case "update_order":
              toolResult = handleUpdateOrder(toolArgs);
              break;
            case "generate_invoice":
              toolResult = handleGenerateInvoice(toolArgs);
              break;
            case "get_invoice":
              toolResult = handleGetInvoice(toolArgs);
              break;
            case "database_query":
              toolResult = await handleDatabaseQuery(toolArgs);
              break;
            case "add":
              toolResult = handleAdd(toolArgs);
              break;
            default:
              throw new Error(`Tool ${toolName} tidak dikenali`);
          }

          return res.json({
            jsonrpc: "2.0",
            id,
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

        case "ping":
          return res.json({ jsonrpc: "2.0", id, result: {} });

        default:
          return res.status(400).json({
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Method ${method} not found` },
          });
      }
    } catch (err) {
      console.error("MCP Error:", err);
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });

  app.listen(port, () => {
    console.log(`🚀 MCP HTTP Server running on http://localhost:${port}`);
    console.log(`🔧 MCP Protocol endpoint: http://localhost:${port}/mcp`);
  });
}

// Start server
createServer(3000);
