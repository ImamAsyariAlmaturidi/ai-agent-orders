// server.ts - Fixed version dengan better agent instructions dan turn management

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { Agent, RunContext, tool, assistant, user, run } from "@openai/agents";
import { unknown, z } from "zod";
import {
  ProductAgent,
  CartAgent,
  OrderAgent,
  PaymentAgent,
  ShippingAgent,
} from "./agents/index.js";
import {
  addToConversationHistory,
  getConversationHistory,
  connectToMongoDB,
  createConversation,
  createCart,
  getCartById,
  getActiveCart,
} from "./db.js";
import { AgentRunResult, AppContext } from "./types.js";
import { ObjectId } from "mongodb";

// ====================== SETUP PATH ======================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve static files dari ../public
app.use(express.static(path.join(__dirname, "../public")));

// Simple tool that can access the context directly
const getUserInfoTool = tool({
  name: "get_user_info",
  description:
    "Get detailed information about the current user including their profile",
  parameters: z.object({}),
  execute: async (
    _args,
    runContext?: RunContext<AppContext>
  ): Promise<string> => {
    if (!runContext?.context) {
      return "No context available";
    }

    const context = runContext.context;
    let response = `User ID: ${context.userId}\nConversation ID: ${
      context.conversationId || "unknown"
    }`;

    if (context.userProfile) {
      response += `\n\nUser Profile:`;
      response += `\n- Favorite Programming Language: ${context.userProfile.favoriteLanguage}`;
      response += `\n- Favorite Database: ${context.userProfile.favoriteDatabase}`;
      response += `\n- Years of Experience: ${context.userProfile.experience}`;

      if (context.userProfile.preferredFramework) {
        response += `\n- Preferred Framework: ${context.userProfile.preferredFramework}`;
      }
    }

    return response;
  },
});

// ====================== HELPER FUNCTION FOR CART ======================
const getOrCreateUserCart = async (
  db: any,
  userId: string
): Promise<string> => {
  const existingCart = await getActiveCart(db, userId);

  if (existingCart) {
    console.log(`Using existing cart: ${existingCart._id}`);
    return existingCart._id!.toString();
  }

  console.log(`Creating new cart for user: ${userId}`);
  const newCartId = await createCart(db, userId);
  return newCartId;
};

// ====================== AGENT RUNNER (FIXED WITH BETTER INSTRUCTIONS) ======================
export const runAgentWithMemory = async (
  input: string,
  context: AppContext
): Promise<AgentRunResult> => {
  const { db, conversationId, cartId } = context;

  if (!conversationId) {
    throw new Error("Conversation ID is required");
  }

  if (!ObjectId.isValid(conversationId)) {
    throw new Error(`Invalid conversation ID format: ${conversationId}`);
  }

  let activeConversationId = conversationId;

  try {
    // Check if conversation exists
    const conversationExists = await db
      .collection("conversations")
      .findOne({ _id: new ObjectId(conversationId) });

    if (!conversationExists) {
      console.log(
        `Conversation ${conversationId} not found, creating new one...`
      );

      await db.collection("conversations").insertOne({
        _id: new ObjectId(conversationId),
        userId: context.userId,
        cartId: new ObjectId(cartId),
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log("Created new conversation with ID:", conversationId);
    } else {
      console.log(`Using existing conversation: ${conversationId}`);
    }

    // Add user message to conversation history
    await addToConversationHistory(db, conversationId, "user", input);
    console.log("Added user message to conversation");

    // ✅ IMPROVED ORCHESTRATOR AGENT WITH CLEARER INSTRUCTIONS
    const agent = new Agent<AppContext>({
      name: "orchestrator_agent",
      instructions: (runContext: RunContext<AppContext>) =>
        `You are an Indonesia e-commerce assistant orchestrator for user ${runContext.context.userId}.

IMPORTANT RULES:
1. ONLY use ONE tool per user request unless absolutely necessary
2. For "add to cart" requests:
   - FIRST fetch the product details from product_tool
   - Extract the correct price
   - Calculate totalPrice = price * quantity (quantity = 1 if not specified)
   - Pass name, quantity, price, and totalPrice to cart_tool
   - Do NOT let cart_tool guess the price
3. Do NOT call multiple tools in sequence unless the user explicitly asks
4. After calling a tool and getting a result, provide a direct response
5. Do NOT call additional tools to "verify" or "confirm" - trust the tool results

TOOL MAPPING:
- Product questions/search → product_tool
- Cart operations (add/remove/view) → cart_tool  
- Order creation/status → order_tool
- Payment processing → payment_tool
- Shipping info → shipping_tool
- User info → get_user_info

WORKFLOW:
1. Identify what the user wants
2. If the user wants to add a product to cart:
   - Fetch product data from product_tool
   - Compute totalPrice
   - Call cart_tool once with {name, quantity, price, totalPrice}
3. Give a helpful response based on the tool result
4. STOP - do not call additional tools


Current user request: "${input}"
Choose the most appropriate single tool and respond.
`,
      tools: [
        ProductAgent.asTool({ toolName: "product_tool" }),
        CartAgent.asTool({ toolName: "cart_tool" }),
        OrderAgent.asTool({ toolName: "order_tool" }),
        PaymentAgent.asTool({ toolName: "payment_tool" }),
        ShippingAgent.asTool({ toolName: "shipping_tool" }),
        getUserInfoTool,
      ],
      model: "gpt-4o-mini",
    });

    // Get conversation history
    const history = await getConversationHistory(db, conversationId);
    console.log(`Loaded ${history.length} messages from history`);

    // Convert history to agent messages (limit to last 10 to avoid context overflow)
    const recentHistory = history.slice(-10);
    const agentMessages = recentHistory.map((entry) =>
      entry.role === "user" ? user(entry.content) : assistant(entry.content)
    );

    // ✅ Run with increased maxTurns and better error handling
    const result = await run(agent, [...agentMessages, user(input)], {
      context,
      maxTurns: 5, // ✅ Reduced from default 10 to force efficiency
    });

    // Store assistant's response
    if (result.finalOutput) {
      await addToConversationHistory(
        db,
        conversationId,
        "assistant",
        result.finalOutput
      );
      console.log("Saved assistant response to conversation");
    }

    return {
      conversationId,
      finalOutput:
        result.finalOutput ||
        "I apologize, but I had trouble processing your request. Please try again.",
    };
  } catch (error) {
    console.error("Error in runAgentWithMemory:", error);

    // ✅ Better error handling for MaxTurnsExceededError
    if (
      error.message?.includes("Max turns") ||
      error.name === "MaxTurnsExceededError"
    ) {
      console.log("Max turns exceeded, providing fallback response");

      // Try to provide a meaningful fallback based on the input
      let fallbackResponse = "I understand you want to ";

      if (
        input.toLowerCase().includes("cart") ||
        input.toLowerCase().includes("keranjang")
      ) {
        fallbackResponse +=
          "work with your cart. Let me help you with that directly.";
      } else if (
        input.toLowerCase().includes("order") ||
        input.toLowerCase().includes("pesan")
      ) {
        fallbackResponse += "place an order. I can help you with that.";
      } else if (
        input.toLowerCase().includes("product") ||
        input.toLowerCase().includes("produk")
      ) {
        fallbackResponse += "find products. Let me search for you.";
      } else {
        fallbackResponse +=
          "get help. Please try rephrasing your request more simply.";
      }

      return {
        conversationId,
        finalOutput: fallbackResponse,
      };
    }

    throw error;
  }
};

// ====================== ROUTES ======================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ✅ IMPROVED CHAT ENDPOINT WITH BETTER ERROR HANDLING
app.post("/api/chat", async (req, res) => {
  const { sessionId, message, userId } = req.body;

  console.log("Received chat request:", { sessionId, message, userId });

  if (!userId) {
    return res.status(400).json({ error: "userId is required" });
  }

  if (!message || message.trim() === "") {
    return res
      .status(400)
      .json({ error: "message is required and cannot be empty" });
  }

  try {
    // Connect to MongoDB
    const { db } = await connectToMongoDB();

    let conversationId = sessionId;
    const cartId = await getOrCreateUserCart(db, userId);
    console.log(`Using cartId: ${cartId} for user: ${userId}`);

    // Run agent with memory
    const result = await runAgentWithMemory(message, {
      db,
      cartId: cartId,
      userId,
      conversationId,
    });

    res.json({
      response: result.finalOutput,
      sessionId: result.conversationId,
      cartId: cartId,
    });
  } catch (err) {
    console.error("Chat error:", err);

    // Provide user-friendly error messages
    let errorMessage = "Maaf, terjadi kesalahan. Silakan coba lagi.";

    if (err.message?.includes("Max turns")) {
      errorMessage =
        "Permintaan terlalu kompleks. Silakan coba dengan cara yang lebih sederhana.";
    } else if (err.message?.includes("Invalid conversation")) {
      errorMessage = "Session tidak valid. Silakan refresh halaman.";
    }

    res.status(500).json({
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
});

// Get current cart for user
app.get("/api/cart/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const { db } = await connectToMongoDB();
    const cart = await getActiveCart(db, userId);

    if (!cart) {
      return res.json({ cart: null, message: "No active cart found" });
    }

    res.json({ cart });
  } catch (err) {
    console.error("Error fetching cart:", err);
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

// Get conversation history endpoint
app.get("/api/conversation/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  if (!ObjectId.isValid(sessionId)) {
    return res.status(400).json({ error: "Invalid sessionId format" });
  }

  try {
    const { db } = await connectToMongoDB();
    const history = await getConversationHistory(db, sessionId);
    res.json({ sessionId, history, count: history.length });
  } catch (err) {
    console.error("Error fetching conversation:", err);
    res.status(500).json({ error: "Failed to fetch conversation history" });
  }
});

// Clear conversation endpoint
app.delete("/api/conversation/:sessionId", async (req, res) => {
  const { sessionId } = req.params;

  if (!ObjectId.isValid(sessionId)) {
    return res.status(400).json({ error: "Invalid sessionId format" });
  }

  try {
    const { db } = await connectToMongoDB();
    await db.collection("conversations").deleteOne({
      _id: new ObjectId(sessionId),
    });
    res.json({ message: "Conversation deleted successfully" });
  } catch (err) {
    console.error("Error deleting conversation:", err);
    res.status(500).json({ error: "Failed to delete conversation" });
  }
});

// ====================== START SERVER ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || "development"}`);
});
