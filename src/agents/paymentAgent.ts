import { Agent, tool } from "@openai/agents";
import { z } from "zod";

// Wrap function as a proper tool
const processPaymentTool = tool({
  name: "process_payment",
  description: "Process a payment with amount and method",
  parameters: z.object({
    amount: z.number(),
    method: z.string(),
  }),
  async execute(input) {
    const { amount, method } = input;
    // Simulate payment processing
    return `Payment of ${amount} processed using ${method}.`;
  },
});

export const PaymentAgent = new Agent({
  name: "Payment Agent",
  instructions: "You are a helpful payment agent.",
  model: "o4-mini",
  tools: [processPaymentTool],
});
