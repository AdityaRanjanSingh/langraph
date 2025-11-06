import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { ArrowUp, Loader2, Eye, EyeOff } from "lucide-react";
import { MessageOptions } from "@/types/message";
import { SettingsPanel } from "./SettingsPanel";
import { useUISettings } from "@/contexts/UISettingsContext";

interface MessageInputProps {
  onSendMessage: (message: string, opts?: MessageOptions) => Promise<void>;
  isLoading?: boolean;
  maxLength?: number;
}

export const MessageInput = ({
  onSendMessage,
  isLoading = false,
  maxLength = 2000,
}: MessageInputProps) => {
  const [message, setMessage] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [provider, setProvider] = useState<string>("google");
  const [model, setModel] = useState<string>("gemini-2.5-flash");
  const [approveAllTools, setApproveAllTools] = useState<boolean>(false);
  const [settingsExpanded, setSettingsExpanded] = useState<boolean>(false);

  // UI settings for toggling tool messages
  const { hideToolMessages, toggleToolMessages } = useUISettings();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = textarea.scrollHeight + "px";
    }
  }, [message]);
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!message.trim() || isLoading) return;

    await onSendMessage(message, {
      model,
      tools: [],
      approveAllTools: approveAllTools,
    });
    setMessage("");
  };
  // Calculate remaining characters
  const remainingChars = maxLength - message.length;
  const isNearLimit = remainingChars < maxLength * 0.1; // Less than 10% remaining
  return (
    <form onSubmit={handleSubmit} className="relative">
      <div
        className={`relative mx-auto flex max-w-[80%] flex-col rounded-lg border transition-all duration-200 ${
          isFocused ? "border-blue-500 shadow-sm" : "border-gray-200"
        }`}
      >
        {/* Settings Panel */}
        <SettingsPanel
          isExpanded={settingsExpanded}
          onToggle={() => setSettingsExpanded(!settingsExpanded)}
          provider={provider}
          setProvider={setProvider}
          model={model}
          setModel={setModel}
        />

        {/* Input Section */}
        <div className="px-4 pt-4 pb-2">
          <textarea
            value={message}
            ref={textareaRef}
            onChange={(e) => setMessage(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={"Type your message..."}
            className="max-h-[200px] min-h-[60px] w-full flex-1 resize-none overflow-auto pr-12 focus:outline-none"
            rows={1}
            aria-label="Message input"
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Character counter */}
              <div className={`text-xs ${isNearLimit ? "text-amber-500" : "text-gray-400"}`}>
                {remainingChars}/{maxLength}
              </div>

              {/* Auto-approve tools setting - always visible */}
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={approveAllTools}
                  onChange={(e) => setApproveAllTools(e.target.checked)}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-600 dark:text-gray-300">Auto-approve tools</span>
              </label>

              {/* Tool messages toggle */}
              <button
                type="button"
                onClick={toggleToolMessages}
                className="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover:bg-gray-200 dark:hover:bg-gray-700"
                aria-label={hideToolMessages ? "Show tool messages" : "Hide tool messages"}
              >
                {hideToolMessages ? (
                  <EyeOff className="h-3.5 w-3.5 text-gray-500" />
                ) : (
                  <Eye className="h-3.5 w-3.5 text-gray-500" />
                )}
                <span className="text-gray-600 dark:text-gray-300">
                  {hideToolMessages ? "Show tools" : "Hide tools"}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={!message.trim() || isLoading}
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full p-0 ${
                  message.trim() && !isLoading ? "bg-primary hover:bg-primary/90 text-white" : ""
                }`}
                aria-label="Send message"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
};
