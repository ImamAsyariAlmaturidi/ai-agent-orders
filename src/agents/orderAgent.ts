import { Agent, tool, run } from "@openai/agents";
import { z } from "zod";

// Schema untuk setiap item dalam order
const orderItemSchema = z.object({
  type: z.enum(["product", "service"]),
  name: z.string(),
  quantity: z.number().nullable(),
  totalPrice: z.number(),
});

// Tool untuk place order
const placeOrderTool = tool({
  name: "place_order",
  description:
    "Place an order for items (can include both products and services)",
  parameters: z.object({ items: z.array(orderItemSchema) }),
  async execute(input) {
    // Contoh implementasi dummy
    const totalOrderPrice = input.items.reduce(
      (sum, item) => sum + item.totalPrice,
      0
    );
    return {
      message: "Order placed successfully",
      totalPrice: totalOrderPrice,
      items: input.items,
      orderId: "order_" + Date.now(),
    };
  },
});

// Tool untuk view all orders
const viewOrdersTool = tool({
  name: "view_orders",
  description: "View all orders placed",
  parameters: z.object({}),
  async execute(input) {
    // Dummy data
    const orders = [
      {
        orderId: "order_1",
        items: [
          {
            type: "product",
            name: "Karma Knows",
            quantity: 2,
            totalPrice: 4798000,
          },
          {
            type: "service",
            name: "Gift Wrapping",
            quantity: null,
            totalPrice: 50000,
          },
        ],
        totalPrice: 4848000,
        status: "completed",
      },
      {
        orderId: "order_2",
        items: [
          {
            type: "product",
            name: "Air Max 90",
            quantity: 1,
            totalPrice: 2300000,
          },
        ],
        totalPrice: 2300000,
        status: "pending",
      },
    ];
    return orders;
  },
});

// Tool untuk cancel order
const cancelOrderTool = tool({
  name: "cancel_order",
  description: "Cancel an order by ID",
  parameters: z.object({ orderId: z.string() }),
  async execute(input) {
    return { message: `Order ${input.orderId} has been cancelled` };
  },
});

// Tool untuk generate invoice
const generateInvoiceTool = tool({
  name: "generate_invoice",
  description: "Generate invoice for an order",
  parameters: z.object({ orderId: z.string() }),
  async execute(input) {
    return {
      message: `Invoice generated for order ${input.orderId}`,
      invoiceId: "inv_" + Date.now(),
    };
  },
});

// Agent
export const OrderAgent = new Agent({
  name: "Order Agent",
  instructions: "You are a helpful order agent.",
  model: "o4-mini",
  tools: [placeOrderTool, viewOrdersTool, cancelOrderTool, generateInvoiceTool],
});
