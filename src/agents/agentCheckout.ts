// checkoutAgent.ts - Improved version
import { Agent, tool, run, RunContext } from "@openai/agents";
import { z } from "zod";
import { getCartById, updateCartStatus, createOrder } from "../db.js";
import { AppContext } from "../types.js";
import { ObjectId } from "mongodb";

// ====================== TOOLS ======================
const getCartDetailsTool = tool({
  name: "get_cart_details",
  description: "Get current cart details for checkout validation",
  parameters: z.object({
    cartId: z.string().describe("Cart ID to retrieve details"),
  }),
  async execute(input, runContext?: RunContext<AppContext>) {
    if (!runContext?.context.db) {
      return "Error: Database connection not available";
    }

    try {
      const cart = await getCartById(runContext.context.db, input.cartId);

      if (!cart || !cart.items || cart.items.length === 0) {
        return "Error: Cart is empty or not found";
      }

      const cartSummary = {
        cartId: input.cartId,
        items: cart.items,
        totalItems: cart.items.reduce(
          (sum: number, item: any) => sum + item.quantity,
          0
        ),
        subtotal: cart.items.reduce(
          (sum: number, item: any) => sum + item.totalPrice,
          0
        ),
        status: cart.status || "active",
      };

      return `Cart Details:
Items: ${cart.items.length} products
Total Items: ${cartSummary.totalItems}
Subtotal: Rp ${cartSummary.subtotal.toLocaleString("id-ID")}
Status: ${cartSummary.status}

Items in cart:
${cart.items
  .map(
    (item: any, index: number) =>
      `${index + 1}. ${item.name} - Qty: ${
        item.quantity
      } - Price: Rp ${item.price.toLocaleString(
        "id-ID"
      )} - Total: Rp ${item.totalPrice.toLocaleString("id-ID")}`
  )
  .join("\n")}`;
    } catch (error) {
      return `Error retrieving cart: ${error}`;
    }
  },
});

const calculateTotalTool = tool({
  name: "calculate_total",
  description: "Calculate final total including tax and shipping",
  parameters: z.object({
    subtotal: z.number().describe("Subtotal amount from cart"),
    shippingCost: z
      .number()
      .default(15000)
      .describe("Shipping cost (default 15000)"),
    taxRate: z.number().default(0.11).describe("Tax rate (default 11%)"),
  }),
  async execute(input) {
    const { subtotal, shippingCost, taxRate } = input;

    const tax = Math.round(subtotal * taxRate);
    const total = subtotal + shippingCost + tax;

    return `Cost Breakdown:
Subtotal: Rp ${subtotal.toLocaleString("id-ID")}
Shipping: Rp ${shippingCost.toLocaleString("id-ID")}
Tax (${Math.round(taxRate * 100)}%): Rp ${tax.toLocaleString("id-ID")}
---
TOTAL: Rp ${total.toLocaleString("id-ID")}`;
  },
});

const releaseInvoiceTool = tool({
  name: "release_invoice",
  description: "Generate and release invoice for payment processing",
  parameters: z.object({
    cartId: z.string().describe("Cart ID for the order"),
    total_amount: z.number().describe("Total amount to be paid"),
    customer_info: z
      .object({
        userId: z.string(),
        email: z.string().optional().nullable(),
        phone: z.string().optional().nullable(),
      })
      .describe("Customer information"),
    items: z
      .array(
        z.object({
          name: z.string(),
          quantity: z.number(),
          price: z.number(),
          total_price: z.number(),
        })
      )
      .describe("Order items"),
    shipping_cost: z.number().default(15000),
    tax_amount: z.number(),
  }),
  async execute(input, runContext?: RunContext<AppContext>) {
    if (!runContext?.context.db) {
      return "Error: Database connection not available";
    }
    return {
      invoiceLink: `https://example.com/invoice/${input.cartId}`,
      invoiceId: new ObjectId().toString(),
      paymentInstructions: `Please pay Rp ${input.total_amount.toLocaleString(
        "id-ID"
      )} to the following account: 123-456-789`,
    }; // Placeholder for invoice URL
  },
});

// ====================== CHECKOUT AGENT ======================
export const CheckoutAgent = new Agent<AppContext>({
  name: "Checkout Agent",
  instructions: (runContext: RunContext<AppContext>) => `
You are the Indonesian E-commerce Checkout Agent. You handle the complete checkout process for customers.

## YOUR ROLE:
Help customers complete their purchase by:
1. Validating cart contents
2. Calculating total costs (including tax & shipping)  
3. Generating invoices for payment
4. Providing clear payment instructions

## CHECKOUT PROCESS:
When user says "checkout", "bayar", "pesan", or similar:

1. **GET CART DETAILS**:
   - Use get_cart_details with current cartId: "${runContext.context.cartId}"
   - Verify cart has items and is valid

2. **CALCULATE TOTAL**:
   - Use calculate_total with subtotal from cart
   - Include shipping (default Rp 15,000) and tax (11%)
   - Show clear breakdown to customer

3. **CONFIRM ORDER**:
   - Ask customer to confirm the order details
   - Show all items, quantities, prices
   - Display total amount clearly

4. **GENERATE INVOICE**:
   - Use release_invoice to create payment invoice
   - Include all order details and payment instructions
   - Provide invoice ID and payment deadline

## TOOLS AVAILABLE:
- get_cart_details: Get current cart information
- calculate_total: Calculate total with tax and shipping
- release_invoice: Generate invoice and payment instructions

## IMPORTANT RULES:
- ALWAYS validate cart before checkout
- ALWAYS show cost breakdown clearly
- Use Indonesian Rupiah (Rp) formatting: toLocaleString('id-ID')
- Be friendly and professional in Indonesian
- Include clear payment instructions
- Provide customer service contact info

## SAMPLE RESPONSES:
- "Mari saya bantu proses checkout Anda..."
- "Total pesanan: Rp 150.000 (sudah termasuk ongkir & pajak)"
- "Invoice berhasil dibuat! Silakan lakukan pembayaran..."

Current context: 
- User ID: ${runContext.context.userId}
- Cart ID: ${runContext.context.cartId}
- Database: Connected

Respond in Bahasa Indonesia and help customer complete their purchase smoothly!
  `,
  model: "gpt-4o-mini",
  tools: [getCartDetailsTool, calculateTotalTool, releaseInvoiceTool],
});
