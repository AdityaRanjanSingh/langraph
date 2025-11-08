import { NextRequest } from "next/server";
import { streamResponse } from "@/services/agentService";
import type { MessageResponse } from "@/types/message";
import { ensureAgent } from "@/lib/agent";

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
  // Thread existence handled in service.

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let isClosed = false;

      const safeEnqueue = (data: Uint8Array) => {
        if (isClosed) return;
        try {
          controller.enqueue(data);
        } catch (err) {
          // Controller closed externally, mark as closed
          isClosed = true;
        }
      };

      const send = (data: MessageResponse) => {
        safeEnqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const safeClose = () => {
        if (!isClosed) {
          try {
            controller.close();
            isClosed = true;
          } catch (err) {
            // Controller already closed, ignore
            isClosed = true;
          }
        }
      };

      // Initial comment to establish stream
      safeEnqueue(encoder.encode(": connected\n\n"));

      // Run the agent streaming in the background
      (async () => {
        try {
          const iterable = await streamResponse({
            threadId,
            userText: userContent,
            opts: { model, tools, allowTool: allowTool || undefined, approveAllTools },
          });
          for await (const chunk of iterable) {
            // Only forward AI/tool chunks; ignore human/system
            if (chunk.type === "ai" || chunk.type === "tool") {
              send(chunk);
            }
          }

          // After stream completes, check if the agent is in an interrupted state
          // This happens when tool approval is required
          if (!allowTool) {
            const agent = await ensureAgent({
              model,
              tools,
              approveAllTools,
            });

            const state = await agent.getState({ configurable: { thread_id: threadId } });

            console.log("[STREAM] Checking for interrupt:", {
              next: state.next,
              tasks: state.tasks,
              threadId,
            });

            // Check if the graph is interrupted (waiting for tool approval)
            if (state.next && state.next.length > 0) {
              console.log("[STREAM] Emitting interrupt event for thread:", threadId);
              // Emit an interrupt event to signal the frontend to show approval UI
              safeEnqueue(encoder.encode("event: interrupt\n"));
              safeEnqueue(
                encoder.encode(`data: ${JSON.stringify({ threadId, next: state.next })}\n\n`),
              );
            } else {
              console.log("[STREAM] No interrupt detected - state.next is empty");
            }
          }

          // Signal completion
          safeEnqueue(encoder.encode("event: done\n"));
          safeEnqueue(encoder.encode("data: {}\n\n"));
        } catch (err: unknown) {
          console.error("[STREAM] Error in agent stream:", err);
          // Emit an error event (client onerror will capture general network; providing data for diagnostics)
          safeEnqueue(encoder.encode("event: error\n"));
          safeEnqueue(
            encoder.encode(
              `data: ${JSON.stringify({ message: (err as Error)?.message || "Stream error", threadId })}\n\n`,
            ),
          );
        } finally {
          safeClose();
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
