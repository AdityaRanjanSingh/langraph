import { NextRequest } from "next/server";
import { ensureThread } from "@/lib/thread";
import type { MessageOptions, MessageResponse, ToolCall } from "@/types/message";
import { HumanMessage } from "@langchain/core/messages";
import { Command } from "@langchain/langgraph";
import { createDataAnalysisAgent } from "@/lib/agent/data-analysis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Stream response specifically for data analysis agent
 */
async function streamDataAnalysisResponse(params: {
  threadId: string;
  userText: string;
  opts?: MessageOptions;
}) {
  const { threadId, userText, opts } = params;
  await ensureThread(threadId, userText);

  // If allowTool is present, use Command with resume action instead of regular inputs
  const inputs = opts?.allowTool
    ? new Command({
        resume: {
          action: opts.allowTool === "allow" ? "continue" : "update",
          data: {},
        },
      })
    : {
        messages: [new HumanMessage(userText)],
      };

  const agent = await createDataAnalysisAgent({
    model: opts?.model,
    provider: opts?.provider,
    tools: opts?.tools,
    approveAllTools: opts?.approveAllTools,
  });

  const iterable = await agent.stream(inputs, {
    streamMode: ["updates"],
    configurable: { thread_id: threadId },
  });

  async function* generator(): AsyncGenerator<MessageResponse, void, unknown> {
    for await (const chunk of iterable) {
      if (!chunk) continue;

      // Handle tuple format: [type, data]
      if (Array.isArray(chunk) && chunk.length === 2) {
        const [chunkType, chunkData] = chunk;

        if (
          chunkType === "updates" &&
          chunkData &&
          typeof chunkData === "object" &&
          !Array.isArray(chunkData)
        ) {
          // Handle updates: ['updates', { agent: { messages: [Array] } }]
          if (
            "agent" in chunkData &&
            chunkData.agent &&
            typeof chunkData.agent === "object" &&
            !Array.isArray(chunkData.agent) &&
            "messages" in chunkData.agent
          ) {
            const messages = Array.isArray(chunkData.agent.messages)
              ? chunkData.agent.messages
              : [chunkData.agent.messages];
            for (const message of messages) {
              if (!message) continue;

              const isAIMessage =
                message?.constructor?.name === "AIMessageChunk" ||
                message?.constructor?.name === "AIMessage";

              if (!isAIMessage) continue;

              const messageWithTools = message as Record<string, unknown>;
              const processedMessage = processAIMessage(messageWithTools);
              if (processedMessage) {
                yield processedMessage;
              }
            }
          }
        }
      }
    }
  }
  return generator();
}

// Helper function to process any AI message and return the appropriate MessageResponse
function processAIMessage(message: Record<string, unknown>): MessageResponse | null {
  // Check if this is a tool call (content is array with functionCall)
  const hasToolCall =
    Array.isArray(message.content) &&
    message.content.some(
      (item: unknown) => item && typeof item === "object" && "functionCall" in item,
    );

  if (hasToolCall) {
    // Return full AIMessageData for tool calls to preserve all information
    return {
      type: "ai",
      data: {
        id: (message.id as string) || Date.now().toString(),
        content: typeof message.content === "string" ? message.content : "",
        tool_calls: (message.tool_calls as ToolCall[]) || undefined,
        additional_kwargs: (message.additional_kwargs as Record<string, unknown>) || undefined,
        response_metadata: (message.response_metadata as Record<string, unknown>) || undefined,
      },
    };
  } else {
    // Handle regular text content - extract text from various content types
    let text = "";
    if (typeof message.content === "string") {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .map((c: string | { text?: string }) => (typeof c === "string" ? c : c?.text || ""))
        .join("");
    } else {
      text = String(message.content ?? "");
    }

    // Only return message if we have actual text content
    if (text.trim()) {
      return {
        type: "ai",
        data: { id: (message.id as string) || Date.now().toString(), content: text },
      };
    }
  }
  return null;
}

/**
 * SSE endpoint that streams incremental AI response chunks from the Data Analysis Agent.
 * Query params:
 *  - content: user message text
 *  - threadId: thread identifier for conversation history
 *  - model: (optional) model name to use
 *  - provider: (optional) model provider (google/openai)
 *  - allowTool: (optional) "allow" or "deny" for tool execution approval
 *  - approveAllTools: (optional) "true" to auto-approve all tools
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userContent = searchParams.get("content") || "";
  const threadId = searchParams.get("threadId") || "unknown";
  const model = searchParams.get("model") || undefined;
  const provider = searchParams.get("provider") || undefined;
  const allowTool = searchParams.get("allowTool") as "allow" | "deny" | null;
  const toolsParam = searchParams.get("tools") || "";
  const approveAllTools = searchParams.get("approveAllTools") === "true";
  const tools = toolsParam
    ? toolsParam
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : undefined;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: MessageResponse) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial comment to establish stream
      controller.enqueue(encoder.encode(": connected\n\n"));

      // Run the agent streaming in the background
      (async () => {
        try {
          const iterable = await streamDataAnalysisResponse({
            threadId,
            userText: userContent,
            opts: { model, provider, tools, allowTool: allowTool || undefined, approveAllTools },
          });
          for await (const chunk of iterable) {
            // Only forward AI/tool chunks; ignore human/system
            if (chunk.type === "ai" || chunk.type === "tool") {
              send(chunk);
            }
          }

          // Signal completion
          controller.enqueue(encoder.encode("event: done\n"));
          controller.enqueue(encoder.encode("data: {}\n\n"));
        } catch (err: unknown) {
          // Emit an error event (client onerror will capture general network; providing data for diagnostics)
          controller.enqueue(encoder.encode("event: error\n"));
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ message: (err as Error)?.message || "Stream error", threadId })}\n\n`,
            ),
          );
        } finally {
          controller.close();
        }
      })();
    },
    cancel() {
      // If client disconnects, nothing special yet (LangGraph stream will stop as iteration halts)
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
