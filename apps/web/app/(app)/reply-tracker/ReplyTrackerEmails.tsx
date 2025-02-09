"use client";

import { useRouter } from "next/navigation";
import sortBy from "lodash/sortBy";
import { useState, useCallback } from "react";
import type { ParsedMessage } from "@/utils/types";
import { type ThreadTracker, ThreadTrackerType } from "@prisma/client";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { Button } from "@/components/ui/button";
import {
  CheckCircleIcon,
  CircleXIcon,
  HandIcon,
  RefreshCwIcon,
  ReplyIcon,
  XIcon,
} from "lucide-react";
import { useThreadsByIds } from "@/hooks/useThreadsByIds";
import { resolveThreadTrackerAction } from "@/utils/actions/reply-tracking";
import { isActionError } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { Loading } from "@/components/Loading";
import { TablePagination } from "@/components/TablePagination";
import {
  ResizableHandle,
  ResizablePanelGroup,
  ResizablePanel,
} from "@/components/ui/resizable";
import { ThreadContent } from "@/components/EmailViewer";
import { internalDateToDate } from "@/utils/date";
import { cn } from "@/utils";
import { CommandShortcut } from "@/components/ui/command";
import { useTableKeyboardNavigation } from "@/hooks/useTableKeyboardNavigation";

export function ReplyTrackerEmails({
  trackers,
  userEmail,
  type,
  isResolved,
  totalPages,
  isAnalyzing,
}: {
  trackers: ThreadTracker[];
  userEmail: string;
  type?: ThreadTrackerType;
  isResolved?: boolean;
  totalPages: number;
  isAnalyzing: boolean;
}) {
  const [selectedEmail, setSelectedEmail] = useState<{
    threadId: string;
    messageId: string;
  } | null>(null);
  const [resolvingThreads, setResolvingThreads] = useState<Set<string>>(
    new Set(),
  );

  const { data, isLoading } = useThreadsByIds(
    {
      threadIds: trackers.map((t) => t.threadId),
    },
    { keepPreviousData: true },
  );

  const sortedThreads = sortBy(
    data?.threads,
    (t) => -internalDateToDate(t.messages.at(-1)?.internalDate),
  );

  const handleResolve = useCallback(
    async (threadId: string, resolved: boolean) => {
      if (resolvingThreads.has(threadId)) return;

      setResolvingThreads((prev) => {
        const next = new Set(prev);
        next.add(threadId);
        return next;
      });

      const result = await resolveThreadTrackerAction({
        threadId,
        resolved,
      });

      if (isActionError(result)) {
        toastError({
          title: "Error",
          description: result.error,
        });
      } else {
        toastSuccess({
          title: "Success",
          description: resolved ? "Marked as done!" : "Marked as not done!",
        });
      }

      setResolvingThreads((prev) => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
    },
    [resolvingThreads],
  );

  const handleAction = useCallback(
    async (index: number, action: "reply" | "resolve" | "unresolve") => {
      const thread = sortedThreads[index];
      if (!thread) return;

      const message = thread.messages.at(-1)!;

      if (action === "reply") {
        setSelectedEmail({ threadId: thread.id, messageId: message.id });
      } else if (action === "resolve") {
        await handleResolve(thread.id, true);
      } else if (action === "unresolve") {
        await handleResolve(thread.id, false);
      }
    },
    [sortedThreads, handleResolve],
  );

  const { selectedIndex, setSelectedIndex } = useReplyTrackerKeyboardNav(
    sortedThreads,
    handleAction,
  );

  if (isLoading && !data) {
    return <Loading />;
  }

  if (!data?.threads.length) {
    return (
      <div className="mt-2">
        <EmptyState message="No emails yet!" isAnalyzing={isAnalyzing} />
      </div>
    );
  }

  const listView = (
    <>
      <Table>
        <TableBody>
          {sortedThreads.map((thread, index) => (
            <Row
              key={thread.id}
              message={thread.messages.at(-1)!}
              userEmail={userEmail}
              isResolved={isResolved}
              type={type}
              setSelectedEmail={setSelectedEmail}
              isSplitViewOpen={!!selectedEmail}
              isSelected={index === selectedIndex}
              onResolve={handleResolve}
              isResolving={resolvingThreads.has(thread.id)}
              onSelect={() => setSelectedIndex(index)}
            />
          ))}
        </TableBody>
      </Table>
      <TablePagination totalPages={totalPages} />
    </>
  );

  if (!selectedEmail) {
    return listView;
  }

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={35} minSize={0}>
        {listView}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={65} minSize={0} className="bg-slate-100">
        <ThreadContent
          threadId={selectedEmail.threadId}
          showReplyButton={true}
          autoOpenReplyForMessageId={selectedEmail.messageId}
          topRightComponent={
            <div className="flex items-center gap-1">
              {trackers.find((t) => t.threadId === selectedEmail.threadId)
                ?.resolved ? (
                <UnresolveButton
                  threadId={selectedEmail.threadId}
                  onResolve={handleResolve}
                  isLoading={resolvingThreads.has(selectedEmail.threadId)}
                  showShortcut={false}
                />
              ) : (
                <ResolveButton
                  threadId={selectedEmail.threadId}
                  onResolve={handleResolve}
                  isLoading={resolvingThreads.has(selectedEmail.threadId)}
                  showShortcut={false}
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedEmail(null)}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          }
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function Row({
  message,
  userEmail,
  isResolved,
  type,
  setSelectedEmail,
  isSplitViewOpen,
  isSelected,
  onResolve,
  isResolving,
  onSelect,
}: {
  message: ParsedMessage;
  userEmail: string;
  isResolved?: boolean;
  type?: ThreadTrackerType;
  setSelectedEmail: (email: { threadId: string; messageId: string }) => void;
  isSplitViewOpen: boolean;
  isSelected: boolean;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  isResolving: boolean;
  onSelect: () => void;
}) {
  const openSplitView = useCallback(() => {
    setSelectedEmail({
      threadId: message.threadId,
      messageId: message.id,
    });
  }, [message.id, message.threadId, setSelectedEmail]);

  return (
    <TableRow
      className={cn(
        "transition-colors duration-100 hover:bg-slate-100",
        isSelected && "bg-blue-50 hover:bg-blue-100",
      )}
      onMouseEnter={onSelect}
    >
      <TableCell onClick={openSplitView}>
        <div className="flex items-center justify-between">
          <EmailMessageCell
            sender={
              type === ThreadTrackerType.AWAITING
                ? message.headers.to
                : message.headers.from
            }
            subject={message.headers.subject}
            snippet={message.snippet}
            userEmail={userEmail}
            threadId={message.threadId}
            messageId={message.id}
            hideViewEmailButton
          />
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: buttons inside handle keyboard events */}
          <div
            className={cn(
              "ml-4 flex items-center gap-1",
              isSplitViewOpen && "flex-col",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {isResolved ? (
              <UnresolveButton
                threadId={message.threadId}
                onResolve={onResolve}
                isLoading={isResolving}
                showShortcut
              />
            ) : (
              <>
                {!!type && <NudgeButton type={type} onClick={openSplitView} />}
                <ResolveButton
                  threadId={message.threadId}
                  onResolve={onResolve}
                  isLoading={isResolving}
                  showShortcut
                />
              </>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NudgeButton({
  type,
  onClick,
}: {
  type: ThreadTrackerType;
  onClick: () => void;
}) {
  const showNudge = type === ThreadTrackerType.AWAITING;

  return (
    <Button
      className="w-full"
      Icon={showNudge ? HandIcon : ReplyIcon}
      onClick={onClick}
    >
      {showNudge ? "Nudge" : "Reply"}
      <div className="dark ml-2">
        <CommandShortcut>R</CommandShortcut>
      </div>
    </Button>
  );
}

function ResolveButton({
  threadId,
  onResolve,
  isLoading,
  showShortcut,
}: {
  threadId: string;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  isLoading: boolean;
  showShortcut: boolean;
}) {
  return (
    <Button
      className="w-full"
      variant="outline"
      Icon={CheckCircleIcon}
      loading={isLoading}
      onClick={() => onResolve(threadId, true)}
    >
      Mark Done
      {showShortcut && <CommandShortcut className="ml-2">D</CommandShortcut>}
    </Button>
  );
}

function UnresolveButton({
  threadId,
  onResolve,
  isLoading,
  showShortcut,
}: {
  threadId: string;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  isLoading: boolean;
  showShortcut: boolean;
}) {
  return (
    <Button
      className="w-full"
      variant="outline"
      Icon={CircleXIcon}
      loading={isLoading}
      onClick={() => onResolve(threadId, false)}
    >
      Not Done
      {showShortcut && <CommandShortcut className="ml-2">N</CommandShortcut>}
    </Button>
  );
}

function EmptyState({
  message,
  isAnalyzing,
}: {
  message: string;
  isAnalyzing: boolean;
}) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  return (
    <div className="content-container">
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-md border border-dashed bg-slate-50 p-8 text-center animate-in fade-in-50">
        {isAnalyzing ? (
          <>
            <p className="text-sm text-muted-foreground">
              Analyzing your emails...
            </p>
            <Button
              className="mt-4"
              variant="outline"
              Icon={RefreshCwIcon}
              loading={isRefreshing}
              onClick={async () => {
                setIsRefreshing(true);
                router.refresh();
                // Reset loading after a short delay
                setTimeout(() => setIsRefreshing(false), 1000);
              }}
            >
              Refresh
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{message}</p>
        )}
      </div>
    </div>
  );
}

function useReplyTrackerKeyboardNav(
  items: { id: string }[],
  onAction: (index: number, action: "reply" | "resolve" | "unresolve") => void,
) {
  const handleKeyAction = useCallback(
    (index: number, key: string) => {
      if (key === "r") onAction(index, "reply");
      else if (key === "d") onAction(index, "resolve");
      else if (key === "n") onAction(index, "unresolve");
    },
    [onAction],
  );

  return useTableKeyboardNavigation({
    items,
    onKeyAction: handleKeyAction,
  });
}
