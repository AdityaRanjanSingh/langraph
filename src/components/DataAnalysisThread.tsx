"use client";
import { MessageInput } from "./MessageInput";
import MessageList from "./MessageList";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { useEffect, useRef, useState, useCallback } from "react";
import { MessageOptions, MessageResponse, AIMessageData } from "@/types/message";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchMessageHistory } from "@/services/chatService";
import { v4 as uuidv4 } from "uuid";

// Custom stream function for data analysis endpoint
function createDataAnalysisStream(
  threadId: string,
  message: string,
  opts?: MessageOptions,
): EventSource {
  const params = new URLSearchParams({ content: message, threadId });
  if (opts?.model) params.set("model", opts.model);
  if (opts?.provider) params.set("provider", opts.provider);
  if (opts?.tools?.length) params.set("tools", opts.tools.join(","));
  if (opts?.allowTool) params.set("allowTool", opts.allowTool);
  if (opts?.approveAllTools !== undefined)
    params.set("approveAllTools", opts.approveAllTools ? "true" : "false");
  return new EventSource(`/api/agent/data-analysis/stream?${params}`);
}

// Custom hook for data analysis chat
function useDataAnalysisChatThread({ threadId }: { threadId: string | null }) {
  const queryClient = useQueryClient();
  const streamRef = useRef<EventSource | null>(null);
  const currentMessageRef = useRef<MessageResponse | null>(null);
  const [sendError, setSendError] = useState<Error | null>(null);
  const [isSending, setIsSending] = useState(false);

  const {
    data: messages = [],
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchMessagesQuery,
  } = useQuery<MessageResponse[]>({
    queryKey: ["messages", threadId],
    enabled: !!threadId,
    queryFn: () => (threadId ? fetchMessageHistory(threadId) : Promise.resolve([])),
  });

  useEffect(() => {
    if (threadId) {
      void refetchMessagesQuery();
    }
  }, [threadId, refetchMessagesQuery]);

  const handleStreamResponse = useCallback(
    async (streamParams: { threadId: string; text?: string; opts?: MessageOptions }) => {
      const { threadId, text = "", opts } = streamParams;

      setIsSending(true);
      setSendError(null);

      if (streamRef.current) {
        try {
          streamRef.current.close();
        } catch {}
      }

      try {
        const stream = createDataAnalysisStream(threadId, text, opts);
        streamRef.current = stream;

        stream.onmessage = (event: MessageEvent) => {
          try {
            const messageResponse = JSON.parse(event.data) as MessageResponse;
            const data = messageResponse.data as AIMessageData;

            if (!currentMessageRef.current || currentMessageRef.current.data.id !== data.id) {
              currentMessageRef.current = messageResponse;
              queryClient.setQueryData(["messages", threadId], (old: MessageResponse[] = []) => [
                ...old,
                currentMessageRef.current!,
              ]);
            } else {
              const currentData = currentMessageRef.current.data as AIMessageData;
              const newContent =
                typeof data.content === "string" && typeof currentData.content === "string"
                  ? currentData.content + data.content
                  : data.content;

              currentMessageRef.current = {
                ...currentMessageRef.current,
                data: {
                  ...currentData,
                  content: newContent,
                  ...(data.tool_calls && { tool_calls: data.tool_calls }),
                  ...(data.additional_kwargs && { additional_kwargs: data.additional_kwargs }),
                  ...(data.response_metadata && { response_metadata: data.response_metadata }),
                },
              };
              queryClient.setQueryData(["messages", threadId], (old: MessageResponse[] = []) => {
                const index = old.findIndex((m) => m.data.id === currentMessageRef.current?.data.id);
                if (index === -1) return old;
                const updated = [...old];
                updated[index] = currentMessageRef.current!;
                return updated;
              });
            }
          } catch (err) {
            console.error("Failed to parse SSE message:", err);
          }
        };

        stream.addEventListener("done", () => {
          stream.close();
          streamRef.current = null;
          currentMessageRef.current = null;
          setIsSending(false);
          void refetchMessagesQuery();
        });

        stream.onerror = () => {
          stream.close();
          streamRef.current = null;
          currentMessageRef.current = null;
          setSendError(new Error("Stream connection failed"));
          setIsSending(false);
        };
      } catch (error) {
        setSendError(error instanceof Error ? error : new Error("Unknown error"));
        setIsSending(false);
      }
    },
    [queryClient, refetchMessagesQuery],
  );

  const sendMessage = useCallback(
    async (text: string, opts?: MessageOptions) => {
      if (!threadId || !text.trim()) return;

      const userMessage: MessageResponse = {
        type: "human",
        data: { id: uuidv4(), content: text },
      };
      queryClient.setQueryData(["messages", threadId], (old: MessageResponse[] = []) => [
        ...old,
        userMessage,
      ]);

      await handleStreamResponse({ threadId, text, opts });
    },
    [threadId, queryClient, handleStreamResponse],
  );

  const approveToolExecution = useCallback(
    async (toolCallId: string, action: "allow" | "deny") => {
      if (!threadId) return;
      await handleStreamResponse({
        threadId,
        text: "",
        opts: { allowTool: action },
      });
    },
    [threadId, handleStreamResponse],
  );

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        try {
          streamRef.current.close();
        } catch {}
      }
    };
  }, []);

  return {
    messages,
    isLoadingHistory,
    isSending,
    historyError: historyError as Error | null,
    sendError,
    sendMessage,
    refetchMessages: refetchMessagesQuery,
    approveToolExecution,
  };
}

export const DataAnalysisThread = () => {
  const [threadId] = useState(() => `data-analysis-${uuidv4()}`);
  const { messages, isLoadingHistory, isSending, sendMessage, approveToolExecution } =
    useDataAnalysisChatThread({ threadId });
  const firstMessageInitiatedRef = useRef(false);
  const [awaitingFirstResponse, setAwaitingFirstResponse] = useState(false);

  const handleSendMessage = async (message: string, opts?: MessageOptions) => {
    const wasEmpty = messages.length === 0;
    await sendMessage(message, opts);
    if (wasEmpty) {
      firstMessageInitiatedRef.current = true;
      setAwaitingFirstResponse(true);
    }
  };

  useEffect(() => {
    if (awaitingFirstResponse && !isSending) {
      const hasNonHuman = messages.some((m) => m.type !== "human");
      if (hasNonHuman) {
        setAwaitingFirstResponse(false);
      }
    }
  }, [awaitingFirstResponse, isSending, messages]);

  if (isLoadingHistory) {
    return (
      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/60 absolute inset-0 flex items-center justify-center backdrop-blur">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
        <p className="text-muted-foreground mt-2">Loading conversation history...</p>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      {messages.length > 0 ? (
        <>
          <div className="min-h-0 flex-1">
            <ScrollArea className="h-full">
              <div className="space-y-4 px-4 py-4">
                <MessageList messages={messages} approveToolExecution={approveToolExecution} />
              </div>
            </ScrollArea>
          </div>
          <div className="flex-shrink-0">
            <div className="w-full p-4 pb-6">
              <div className="mx-auto max-w-3xl">
                <MessageInput onSendMessage={handleSendMessage} isLoading={isSending} />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-3xl px-4">
            <div className="mb-5 text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Data Analysis Agent
              </h1>
              <p className="text-muted-foreground mt-2">
                Ask me to analyze data, calculate statistics, or generate chart specifications
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 text-sm text-gray-600 dark:text-gray-400 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <strong>Calculator:</strong> Evaluate math expressions
                </div>
                <div className="rounded-md border p-3">
                  <strong>Statistics:</strong> Mean, median, mode, std dev
                </div>
                <div className="rounded-md border p-3">
                  <strong>Data Transform:</strong> Sort, filter, slice data
                </div>
                <div className="rounded-md border p-3">
                  <strong>Charts:</strong> Generate chart specifications
                </div>
              </div>
            </div>
            <MessageInput onSendMessage={handleSendMessage} isLoading={isSending} />
          </div>
        </div>
      )}
    </div>
  );
};
