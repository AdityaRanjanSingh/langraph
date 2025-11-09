import { NextRequest } from "next/server";
import { streamResponse } from "@/services/agentService";
import type { MessageResponse } from "@/types/message";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SSE endpoint that streams incremental AI response chunks produced by the LangGraph React agent.
 * Query params:
 *  - content: user message text
 *  - threadId: (currently unused for history; placeholder for future multi-turn support)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userContent = searchParams.get("content") || "";
  const threadId = searchParams.get("threadId") || "unknown";
  const model = searchParams.get("model") || undefined;
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

  // AbortController to handle client disconnection
  const abortController = new AbortController();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Helper to safely enqueue data
      const safeEnqueue = (data: Uint8Array): boolean => {
        try {
          if (abortController.signal.aborted) {
            return false;
          }
          controller.enqueue(data);
          return true;
        } catch {
          // Controller already closed
          return false;
        }
      };

      const send = (data: MessageResponse): boolean => {
        return safeEnqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const sendEvent = (event: string, data?: Record<string, unknown>): boolean => {
        const eventStr = `event: ${event}\n`;
        const dataStr = data ? `data: ${JSON.stringify(data)}\n\n` : "data: {}\n\n";
        return safeEnqueue(encoder.encode(eventStr + dataStr));
      };

      // Initial comment to establish stream
      if (!safeEnqueue(encoder.encode(": connected\n\n"))) {
        return;
      }

      try {
        // Start streaming response
        const streamResult = await streamResponse({
          threadId,
          userText: userContent,
          opts: { model, tools, allowTool: allowTool || undefined, approveAllTools },
        });

        // Stream all message chunks
        for await (const chunk of streamResult.messages) {
          if (abortController.signal.aborted) {
            break;
          }
          // Only forward AI/tool chunks; ignore human/system
          if (chunk.type === "ai" || chunk.type === "tool") {
            if (!send(chunk)) {
              break;
            }
          }
        }

        // After streaming completes, check for interrupts
        // Only check if this is not a tool approval response
        if (!allowTool && !abortController.signal.aborted) {
          const interruptState = await streamResult.getInterruptState();
          if (interruptState) {
            sendEvent("interrupt", { threadId, next: interruptState });
          }
        }

        // Signal completion
        if (!abortController.signal.aborted) {
          sendEvent("done");
        }
      } catch (err: unknown) {
        // Emit an error event
        if (!abortController.signal.aborted) {
          sendEvent("error", {
            message: (err as Error)?.message || "Stream error",
            threadId,
          });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Controller already closed
        }
      }
    },
    cancel() {
      // Signal abort when client disconnects
      abortController.abort();
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
