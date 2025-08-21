import { Agent, user, assistant, run, RunContext } from "@openai/agents";
import { Db } from "mongodb";
import { MCPConnectionManager } from "../mcp/index";
import { ConversationManager } from "../conversation/index";
import { createTools } from "../tools/index";
import { extractImages, extractFunctionCalls } from "../utils/index";

interface AppContext {
  userId: string;
  sessionId: string;
  conversationId?: string;
  db?: Db;
}

export const processChat = async (
  message: string,
  userId: string,
  sessionId: string | undefined,
  db: Db,
  conversationManager: ReturnType<typeof ConversationManager>,
  mcpStatus: string
) => {
  const conversationId = await conversationManager.getOrCreateConversation(
    sessionId || "",
    userId
  );
  await conversationManager.addMessage(conversationId, "user", message);

  const agentTools = createTools();
  const agent = new Agent<AppContext>({
    name: "ai_agent_server",
    instructions: (ctx: RunContext<AppContext>) => `
MCP STATUS: ${mcpStatus}
Current User: ${ctx.context?.userId}
Current Session: ${ctx.context?.sessionId}

User request: "${message}"
    `,
    tools: agentTools,
    model: "gpt-4o",
  });

  const history = await conversationManager.getHistory(conversationId, 10);
  const agentMessages = history.map((h: any) =>
    h.role === "user" ? user(h.content) : assistant(h.content)
  );
  const context: AppContext = {
    userId,
    sessionId: conversationId,
    conversationId,
    db,
  };
  const result = await run(agent, [...agentMessages, user(message)], {
    context,
    maxTurns: 5,
  });

  const images = extractImages(result);
  const functionCalls = extractFunctionCalls(result);
  const finalOutput =
    result.finalOutput || "Maaf, terjadi kesalahan memproses permintaan.";

  await conversationManager.addMessage(
    conversationId,
    "assistant",
    finalOutput,
    {
      images: images.length ? images : undefined,
      functionCalls: functionCalls.length ? functionCalls : undefined,
    }
  );

  return {
    response: finalOutput,
    sessionId: conversationId,
    images,
    functionCalls,
    mcpStatus,
    timestamp: new Date().toISOString(),
  };
};
