import type { MessageResponse } from "@/types/message";
import { UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { getMessageContent } from "@/services/messageUtils";

interface HumanMessageProps {
  message: MessageResponse;
}

export const HumanMessage = ({ message }: HumanMessageProps) => {
  return (
    <div className="flex justify-end gap-3">
      <div className="max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-2",
            "bg-gray-300/50 text-gray-800",
            "backdrop-blur-sm supports-[backdrop-filter]:bg-gray-300/50",
          )}
        >
          <div className="prose dark:prose-invert max-w-none">
            <p className="my-0">{getMessageContent(message)}</p>
          </div>
        </div>
      </div>
      <div className="bg-primary/10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full">
        <UserIcon className="text-primary h-5 w-5" />
      </div>
    </div>
  );
};
