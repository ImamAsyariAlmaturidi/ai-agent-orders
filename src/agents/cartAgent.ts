import { Agent, tool, run, RunContext } from "@openai/agents";
import { z } from "zod";
import {
  addItemToCart,
  clearCartItems,
  getCartById,
  removeItemFromCartByName,
  updateCartItemQuantity, // Function baru untuk update quantity
} from "../db.js";
import { AppContext } from "../types.js";

// In-memory cart cache
let cart: {
  type: "product" | "service";
  name: string;
  quantity?: number | null;
  totalPrice: number;
  price?: number;
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
    if (!runContext?.context) return "❌ No context available";
    try {
      const cartId = runContext.context.cartId;
      if (!cartId) return "❌ No cart ID available";

      const item = { ...input, quantity: input.quantity ?? undefined };
      cart.push(item); // memory

      const result = await addItemToCart(runContext.context.db, cartId, item);
      return `✅ ${result.message}`;
    } catch (error) {
      console.error("Error adding to cart:", error);
      return `❌ Failed to add ${input.name} to cart.`;
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
      if (!runContext?.context?.cartId) return "❌ No cart available";

      const removed = await removeItemFromCartByName(
        runContext.context.db,
        runContext.context.cartId,
        input.name
      );

      if (removed) {
        cart = cart.filter(
          (c) => c.name.toLowerCase() !== input.name.toLowerCase()
        );
        return `✅ Removed ${input.name} from your cart`;
      } else {
        return `❌ Could not find "${input.name}" in your cart`;
      }
    } catch (error) {
      console.error("Error removing from cart:", error);
      return `❌ Failed to remove ${input.name} from cart.`;
    }
  },
});

const viewCartTool = tool({
  name: "view_cart",
  description: "View all items and services currently in the cart.",
  parameters: z.object({}),
  async execute(_input, runContext?: RunContext<AppContext>) {
    try {
      if (!runContext?.context?.cartId) return "❌ No cart available";

      const dbCart = await getCartById(
        runContext.context.db,
        runContext.context.cartId
      );
      if (!dbCart?.items?.length) return "🛒 Your cart is empty";

      const cartItems = dbCart.items
        .map((item, i) => {
          const qtyText = item.quantity ? `${item.quantity} x ` : "";
          return `${i + 1}. ${qtyText}${item.name} - $${item.totalPrice}`;
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
      if (!runContext?.context?.cartId) return "❌ No cart available";

      cart = []; // clear memory
      await clearCartItems(runContext.context.db, runContext.context.cartId);

      return "✅ Your cart has been cleared";
    } catch (error) {
      console.error("Error clearing cart:", error);
      return "❌ Failed to clear cart. Please try again.";
    }
  },
});

// ====================== NEW QUANTITY TOOLS ======================
const decreaseQuantityTool = tool({
  name: "decrease_quantity",
  description: `Decrease the quantity of a product in the cart by a specified amount.
- Only works for products (not services)
- If quantity becomes 0 or less, removes the item from cart
- Updates totalPrice automatically (totalPrice = price * newQuantity)
- If multiple items with same name exist, will ask user to specify which one`,
  parameters: z.object({
    name: z.string().describe("Name of the product to decrease quantity"),
    amount: z
      .number()
      .min(1)
      .default(1)
      .describe("Amount to decrease (default: 1)"),
    itemId: z
      .string()
      .optional()
      .nullable()
      .describe("Specific item ID if multiple items with same name exist"),
  }),
  async execute(input, runContext?: RunContext<AppContext>) {
    if (!runContext?.context) return "❌ No context available";

    try {
      const cartId = runContext.context.cartId;
      if (!cartId) return "❌ No cart ID available";

      // Get current cart
      const dbCart = await getCartById(runContext.context.db, cartId);
      if (!dbCart?.items?.length) return "🛒 Your cart is empty";

      // Find items with matching name
      const matchingItems = dbCart.items.filter(
        (item) => item.name.toLowerCase() === input.name.toLowerCase()
      );

      if (matchingItems.length === 0) {
        return `❌ Could not find "${input.name}" in your cart`;
      }

      // If multiple items and no specific ID provided, ask user to choose
      if (matchingItems.length > 1 && !input.itemId) {
        const itemsList = matchingItems
          .map((item, i) => {
            const qtyText = item.quantity ? `${item.quantity} x ` : "";
            return `${i + 1}. ${qtyText}${item.name} - $${
              item.totalPrice
            } (ID: ${item._id})`;
          })
          .join("\n");

        return `❓ Found multiple "${input.name}" items in your cart:\n${itemsList}\n\nPlease specify which one you want to decrease by providing the item ID.`;
      }

      // Get the specific item
      let targetItem;
      if (input.itemId) {
        targetItem = matchingItems.find((item) => item._id === input.itemId);
        if (!targetItem) {
          return `❌ Could not find item with ID "${input.itemId}"`;
        }
      } else {
        targetItem = matchingItems[0];
      }

      // Check if it's a product
      if (targetItem.type !== "product") {
        return `❌ Cannot decrease quantity for service "${input.name}". Services don't have quantities.`;
      }

      // Check current quantity
      if (!targetItem.quantity || targetItem.quantity <= 0) {
        return `❌ "${input.name}" has no quantity to decrease`;
      }

      const newQuantity = targetItem.quantity - input.amount;

      // If quantity becomes 0 or less, remove item
      if (newQuantity <= 0) {
        const removed = await removeItemFromCartByName(
          runContext.context.db,
          cartId,
          input.name,
          targetItem._id
        );

        if (removed) {
          // Update memory cache
          cart = cart.filter(
            (c) => c.name.toLowerCase() !== input.name.toLowerCase()
          );
          return `✅ Removed "${input.name}" from your cart (quantity reached 0)`;
        } else {
          return `❌ Failed to remove "${input.name}" from cart`;
        }
      }

      // Update quantity and totalPrice
      const result = await updateCartItemQuantity(
        runContext.context.db,
        cartId,
        targetItem._id!,
        newQuantity
      );

      if (result.success) {
        // Update memory cache
        const memoryIndex = cart.findIndex(
          (c) => c.name.toLowerCase() === input.name.toLowerCase()
        );
        if (memoryIndex !== -1) {
          cart[memoryIndex] = {
            ...cart[memoryIndex],
            quantity: newQuantity,
            totalPrice: (targetItem.price || 0) * newQuantity,
          };
        }

        return `✅ Decreased "${input.name}" quantity by ${input.amount}. New quantity: ${newQuantity}`;
      } else {
        return `❌ Failed to update "${input.name}" quantity`;
      }
    } catch (error) {
      console.error("Error decreasing quantity:", error);
      return `❌ Failed to decrease quantity for ${input.name}.`;
    }
  },
});

const setQuantityTool = tool({
  name: "set_quantity",
  description: `Set the exact quantity of a product in the cart.
- Only works for products (not services)
- If quantity is 0, removes the item from cart
- Updates totalPrice automatically (totalPrice = price * quantity)
- If multiple items with same name exist, will ask user to specify which one`,
  parameters: z.object({
    name: z.string().describe("Name of the product to set quantity"),
    quantity: z.number().min(0).describe("New quantity to set"),
    itemId: z
      .string()
      .optional()
      .nullable()
      .describe("Specific item ID if multiple items with same name exist"),
  }),
  async execute(input, runContext?: RunContext<AppContext>) {
    if (!runContext?.context) return "❌ No context available";

    try {
      const cartId = runContext.context.cartId;
      if (!cartId) return "❌ No cart ID available";

      // Get current cart
      const dbCart = await getCartById(runContext.context.db, cartId);
      if (!dbCart?.items?.length) return "🛒 Your cart is empty";

      // Find items with matching name
      const matchingItems = dbCart.items.filter(
        (item) => item.name.toLowerCase() === input.name.toLowerCase()
      );

      if (matchingItems.length === 0) {
        return `❌ Could not find "${input.name}" in your cart`;
      }

      // If multiple items and no specific ID provided, ask user to choose
      if (matchingItems.length > 1 && !input.itemId) {
        const itemsList = matchingItems
          .map((item, i) => {
            const qtyText = item.quantity ? `${item.quantity} x ` : "";
            return `${i + 1}. ${qtyText}${item.name} - $${
              item.totalPrice
            } (ID: ${item._id})`;
          })
          .join("\n");

        return `❓ Found multiple "${input.name}" items in your cart:\n${itemsList}\n\nPlease specify which one you want to update by providing the item ID.`;
      }

      // Get the specific item
      let targetItem;
      if (input.itemId) {
        targetItem = matchingItems.find((item) => item._id === input.itemId);
        if (!targetItem) {
          return `❌ Could not find item with ID "${input.itemId}"`;
        }
      } else {
        targetItem = matchingItems[0];
      }

      // Check if it's a product
      if (targetItem.type !== "product") {
        return `❌ Cannot set quantity for service "${input.name}". Services don't have quantities.`;
      }

      // If quantity is 0, remove item
      if (input.quantity === 0) {
        const removed = await removeItemFromCartByName(
          runContext.context.db,
          cartId,
          input.name,
          targetItem._id
        );

        if (removed) {
          // Update memory cache
          cart = cart.filter(
            (c) => c.name.toLowerCase() !== input.name.toLowerCase()
          );
          return `✅ Removed "${input.name}" from your cart`;
        } else {
          return `❌ Failed to remove "${input.name}" from cart`;
        }
      }

      // Update quantity
      const result = await updateCartItemQuantity(
        runContext.context.db,
        cartId,
        targetItem._id!,
        input.quantity
      );

      if (result.success) {
        // Update memory cache
        const memoryIndex = cart.findIndex(
          (c) => c.name.toLowerCase() === input.name.toLowerCase()
        );
        if (memoryIndex !== -1) {
          cart[memoryIndex] = {
            ...cart[memoryIndex],
            quantity: input.quantity,
            totalPrice: (targetItem.price || 0) * input.quantity,
          };
        }

        return `✅ Set "${input.name}" quantity to ${input.quantity}`;
      } else {
        return `❌ Failed to update "${input.name}" quantity`;
      }
    } catch (error) {
      console.error("Error setting quantity:", error);
      return `❌ Failed to set quantity for ${input.name}.`;
    }
  },
});

// ====================== CART AGENT ======================
export const CartAgent = new Agent<AppContext>({
  name: "Cart Agent",
  instructions: (runContext: RunContext<AppContext>) => `
You are a helpful shopping cart assistant. Your goal is to help users manage their cart efficiently.

IMPORTANT RULES:
1. Use ONLY ONE tool per user request
2. After using a tool, provide a direct response - do NOT call additional tools
3. Be concise and helpful in your responses
4. Always confirm actions to the user
5. For quantity-related requests (decrease, reduce, lower, less, kurangin, etc.), use decrease_quantity or set_quantity tools, NOT remove_from_cart or clear_cart
6. If user says words like "kurangin", "decrease", "reduce", "lower", "less" about a product, they want to decrease quantity, not remove the item completely

Available tools:
- add_to_cart: Add items to cart (requires: type, name, quantity for products, totalPrice)
- remove_from_cart: Remove items completely from cart (requires: name)
- view_cart: Show current cart contents
- clear_cart: Clear all items from cart
- decrease_quantity: Decrease quantity of a product by specified amount (requires: name, amount)
- set_quantity: Set exact quantity of a product (requires: name, quantity)

For the current user ${runContext.context.userId} with cart ${runContext.context.cartId}.

EXAMPLES:
User: "add laptop to cart" → Use add_to_cart → Respond with confirmation
User: "show my cart" → Use view_cart → Show cart contents
User: "remove laptop" → Use remove_from_cart → Confirm removal
User: "kurangin laptop" → Use decrease_quantity → Decrease by 1
User: "kurangin 2 laptop" → Use decrease_quantity with amount: 2
User: "set laptop quantity to 5" → Use set_quantity with quantity: 5

QUANTITY KEYWORDS: kurangin, decrease, reduce, lower, less, minus, kurang
REMOVAL KEYWORDS: remove, delete, hapus, buang

Always distinguish between decreasing quantity vs completely removing items!

Respond naturally and be helpful!
  `,
  model: "gpt-4o-mini",
  tools: [
    addToCartTool,
    removeFromCartTool,
    viewCartTool,
    clearCartItemsTool,
    decreaseQuantityTool,
    setQuantityTool,
  ],
});
