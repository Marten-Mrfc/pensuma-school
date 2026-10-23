"use client";

import type { ReactNode } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";

/**
 * Names of the two drag handles (role="separator", focusable, arrow keys
 * resize). Without a name a screen reader only says "scheidingslijn".
 * ResizableHandle sets the orientation from its group: the handle between
 * the side-by-side editor and tools is a vertical line.
 */
export const PROMPT_EDITOR_HANDLE_LABEL =
  "Hoogte van opdracht en code aanpassen";
export const EDITOR_TOOLS_HANDLE_LABEL =
  "Breedte van code en uitvoer aanpassen";

/**
 * Code question from 1024px: the assignment above the editor (resizable
 * height) and, when running or testing is allowed, the tools beside them
 * (resizable width).
 */
export function CodeSplitLayout({
  prompt,
  editor,
  tools,
}: {
  prompt: ReactNode;
  editor: ReactNode;
  /** Run/test panel; null when both are switched off. */
  tools: ReactNode | null;
}) {
  const hasTools = tools != null;
  return (
    <ResizablePanelGroup
      direction="horizontal"
      autoSaveId="pensuma-exam-code-h"
    >
      <ResizablePanel defaultSize={hasTools ? 58 : 100} minSize={35}>
        <ResizablePanelGroup
          direction="vertical"
          autoSaveId="pensuma-exam-code-v"
        >
          <ResizablePanel defaultSize={40} minSize={12}>
            {prompt}
          </ResizablePanel>
          <ResizableHandle withHandle aria-label={PROMPT_EDITOR_HANDLE_LABEL} />
          <ResizablePanel defaultSize={60} minSize={30}>
            {editor}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      {hasTools ? (
        <>
          <ResizableHandle withHandle aria-label={EDITOR_TOOLS_HANDLE_LABEL} />
          <ResizablePanel defaultSize={42} minSize={25}>
            {tools}
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  );
}
