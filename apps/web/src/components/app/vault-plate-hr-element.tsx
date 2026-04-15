"use client";

/**
 * O plugin base usa `render.as: "hr"`; o React 19 exige que `<hr>` não tenha filhos.
 * O Slate continua a passar `children` (âncora de seleção) — envolvemos em bloco.
 */
import type { PlateElementProps } from "platejs/react";

export function VaultPlateHrElement(props: PlateElementProps) {
  const { attributes, children } = props;

  return (
    <div {...attributes} className="my-4 py-1">
      <div contentEditable={false}>
        <hr className="border-border" />
      </div>
      {children}
    </div>
  );
}
