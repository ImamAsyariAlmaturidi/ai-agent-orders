import { Agent, tool, run, RunContext } from "@openai/agents";
import { z } from "zod";
import {
  addItemToCart,
  clearCartItems,
  getCartById,
  removeItemFromCartByName,
} from "../db.js";
import { AppContext } from "../types.js";

// Cart storage (bisa diganti DB nanti)
let cart: {
  type: "product" | "service";
  name: string;
  quantity?: number | null;
  totalPrice: number;
  price?: number; // Optional for products
}[] = [];

// ====================== CART TOOLS ======================
const addToCartTool = tool({
  name: "add_to_cart",
  description: `Add an item or service to the cart.
- For products: AI must fill 'price' from catalog and 'totalPrice = price * quantity'.
- For services: AI must fill 'price' (quantity optional), 'totalPrice = price'.`,
  parameters: z.object({
    type: z.enum(["product", "service"]),
    name: z.string(),
    quantity: z.number().nullable(),
    price: z
      .number()
      .describe("Price per unit for products, or total price for services"),
    totalPrice: z.number(),
  }),
  async execute(input, runContext?: RunContext<AppContext>) {
    if (!runContext?.context) {
      return "Error: No context available";
    }

    try {
      console.log("Adding to cart:", input);
      const cartId = runContext.context.cartId;

      if (!cartId) {
        return "Error: No cart ID available";
      }

      // Normalisasi quantity: null -> undefined
      const item = {
        ...input,
        quantity: input.quantity ?? undefined,
      };

      // Simpan ke memory cart (for quick access)
      cart.push(item);

      // Simpan ke DB - fungsi baru yang handle duplicates
      const result = await addItemToCart(runContext.context.db, cartId, item);

      // Return message from the smart add function
      return `✅ ${result.message}`;
    } catch (error) {
      console.error("Error adding to cart:", error);
      return `❌ Failed to add ${input.name} to cart. Please try again.`;
    }
  },
});

const removeFromCartTool = tool({
  name: "remove_from_cart",
  description: "Remove an item or service from the cart by name.",
  parameters: z.object({
    name: z.string().describe("Name of the item to remove from cart"),
  }),
  async execute(input, runContext?: RunContext<AppContext>) {
    try {
      if (!runContext?.context?.cartId) {
        return "❌ No cart available";
      }

      // Use the new removeItemFromCartByName function
      const removed = await removeItemFromCartByName(
        runContext.context.db,
        runContext.context.cartId,
        input.name
      );

      if (removed) {
        // Also remove from memory cart
        cart = cart.filter(
          (c) => !c.name.toLowerCase().includes(input.name.toLowerCase())
        );
        return `✅ Removed ${input.name} from your cart`;
      } else {
        return `❌ Could not find "${input.name}" in your cart`;
      }
    } catch (error) {
      console.error("Error removing from cart:", error);
      return `❌ Failed to remove ${input.name} from cart. Please try again.`;
    }
  },
});

const viewCartTool = tool({
  name: "view_cart",
  description: "View all items and services currently in the cart.",
  parameters: z.object({}),
  async execute(_input, runContext?: RunContext<AppContext>) {
    try {
      if (!runContext?.context?.cartId) {
        return "❌ No cart available";
      }

      // Get cart from database for most accurate data
      const dbCart = await getCartById(
        runContext.context.db,
        runContext.context.cartId
      );

      if (!dbCart || !dbCart.items || dbCart.items.length === 0) {
        return "🛒 Your cart is empty";
      }

      const cartItems = dbCart.items
        .map((item, index) => {
          const qtyText = item.quantity ? `${item.quantity} x ` : "";
          return `${index + 1}. ${qtyText}${item.name} - $${item.totalPrice}`;
        })
        .join("\n");

      const totalPrice = dbCart.items.reduce(
        (sum, item) => sum + (item.totalPrice || 0),
        0
      );

      return `🛒 Your Cart:\n${cartItems}\n\n💰 Total: $${totalPrice.toFixed(
        2
      )}`;
    } catch (error) {
      console.error("Error viewing cart:", error);
      return "❌ Failed to load cart. Please try again.";
    }
  },
});

const clearCartItemsTool = tool({
  name: "clear_cart",
  description: "Clear all items from the cart.",
  parameters: z.object({}),
  async execute(_input, runContext?: RunContext<AppContext>) {
    try {
      if (!runContext?.context?.cartId) {
        return "❌ No cart available";
      }

      // Clear memory cart
      cart = [];

      await clearCartItems(runContext.context.db, runContext.context.cartId);

      return "✅ Your cart has been cleared";
    } catch (error) {
      console.error("Error clearing cart:", error);
      return "❌ Failed to clear cart. Please try again.";
    }
  },
});

export const CartAgent = new Agent<AppContext>({
  name: "Cart Agent",
  instructions: (runContext: RunContext<AppContext>) => `
please insert totalPrice from price * quantity if available, otherwise use price directly.
You are a helpful shopping cart assistant. Your goal is to help users manage their cart efficiently.

IMPORTANT RULES:
1. Use ONLY ONE tool per user request
2. After using a tool, provide a direct response - do NOT call additional tools
3. Be concise and helpful in your responses
4. Always confirm actions to the user

Available tools:
- add_to_cart: Add items to cart (requires: type, name, quantity for products, totalPrice)
- remove_from_cart: Remove items from cart (requires: name)
- view_cart: Show current cart contents

For the current user ${runContext.context.userId} with cart ${runContext.context.cartId}.

EXAMPLES:
User: "add laptop to cart" → Use add_to_cart → Respond with confirmation
User: "show my cart" → Use view_cart → Show cart contents
User: "remove laptop" → Use remove_from_cart → Confirm removal

Respond naturally and be helpful!
  `,
  model: "gpt-4o-mini",
  tools: [addToCartTool, removeFromCartTool, viewCartTool, clearCartItemsTool],
});
