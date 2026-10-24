"use client";

import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useMemo, useRef } from "react";

export type BoardElement = Record<string, unknown> & { isDeleted?: boolean };

/** The Excalidraw canvas itself; loaded only on the client (see whiteboard.tsx). */
export default function WhiteboardCanvas({
  initialElements,
  onChange,
  readOnly = false,
}: {
  initialElements: BoardElement[];
  onChange?: (elements: BoardElement[]) => void;
  readOnly?: boolean;
}) {
  const last = useRef<string>("");
  const initialData = useMemo(
    () => ({
      elements: initialElements,
      // Dark theme inverts canvas colours, so a white base renders as dark.
      appState: { viewBackgroundColor: "#ffffff" },
      scrollToContent: true,
    }),
    // The canvas owns its state after mount; later prop changes must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <Excalidraw
      // Excalidraw's own types are stricter than the plain JSON we store.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      initialData={initialData as any}
      theme="dark"
      viewModeEnabled={readOnly}
      UIOptions={{
        canvasActions: { loadScene: false, saveToActiveFile: false, export: false, toggleTheme: false },
      }}
      onChange={(elements) => {
        if (!onChange || readOnly) return;
        const live = (elements as unknown as BoardElement[]).filter((e) => !e.isDeleted);
        // Excalidraw fires on every pointer move; only report real changes.
        const signature = live.map((e) => `${e.id}:${e.version}`).join(",");
        if (signature === last.current) return;
        last.current = signature;
        onChange(live);
      }}
    />
  );
}
