"use client";

import { ConversationList } from "@/components/coach-conversations";
import type { Conversation } from "@/lib/types";

export function ConversationSidebar({
  open,
  onClose,
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onRename: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          aria-label="Close conversation list"
          onClick={onClose}
        />
      )}

      <nav
        className={`coach-conv-sidebar fixed inset-y-0 left-0 z-50 flex w-[min(100vw-3rem,17rem)] flex-col border-r transition-transform duration-200 ease-out lg:static lg:z-auto lg:w-60 lg:translate-x-0 lg:transition-none ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
        style={{
          borderColor: "var(--border)",
          background: "var(--panel)",
          boxShadow: open ? "var(--shadow-lg)" : undefined,
        }}
        aria-label="Conversations"
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={(id) => {
              onSelect(id);
              onClose();
            }}
            onNew={onNew}
            onRename={onRename}
            onDelete={onDelete}
            compact
          />
        </div>
      </nav>
    </>
  );
}
