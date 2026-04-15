"use client";

import { DndPlugin } from "@platejs/dnd";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { VaultPlateBlockDraggable } from "@/components/app/vault-plate-block-draggable";

/** Alinhado a https://platejs.org/docs/components/block-draggable e `dnd-kit.tsx` do registo Plate. */
export const VaultPlateDndPlugin = DndPlugin.configure({
  options: {
    enableScroller: true,
  },
  render: {
    aboveNodes: VaultPlateBlockDraggable,
    aboveSlate: ({ children }) => <DndProvider backend={HTML5Backend}>{children}</DndProvider>,
  },
});
