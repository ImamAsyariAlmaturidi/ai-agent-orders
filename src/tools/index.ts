import { tool } from "@openai/agents";
import { z } from "zod";
import { AppContext } from "../types";

export const createTools = () => {
  const basicCalculatorTool = tool({
    name: "basic_calculator",
    description: "Basic math operations",
    parameters: z.object({
      operation: z.enum(["add", "subtract", "multiply", "divide"]),
      a: z.number(),
      b: z.number(),
    }),
    execute: async ({ operation, a, b }) => {
      switch (operation) {
        case "add":
          return `${a} + ${b} = ${a + b}`;
        case "subtract":
          return `${a} - ${b} = ${a - b}`;
        case "multiply":
          return `${a} × ${b} = ${a * b}`;
        case "divide":
          return b !== 0 ? `${a} ÷ ${b} = ${a / b}` : "Division by zero";
        default:
          return "Unknown operation";
      }
    },
  });

  const getUserInfoTool = tool({
    name: "get_user_info",
    description: "Get current user info",
    parameters: z.object({}),
    execute: async (_args, runContext) => {
      const ctx = runContext?.context as AppContext | undefined;
      return `User ID: ${ctx?.userId || "unknown"}\nSession: ${
        ctx?.userId || "unknown"
      }\nConversation ID: ${ctx?.conversationId || "N/A"}`;
    },
  });

  return [basicCalculatorTool, getUserInfoTool];
};
