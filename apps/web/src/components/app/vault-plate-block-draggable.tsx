"use client";

/**
 * Adaptado de {@link https://platejs.org/docs/components/block-draggable}
 * e `refs/plate/apps/www/src/registry/ui/block-draggable.tsx`.
 */

import * as React from "react";

import { DndPlugin, useDraggable, useDropLine } from "@platejs/dnd";
import { expandListItemsWithChildren } from "@platejs/list";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { GripVertical } from "lucide-react";
import { type TElement, getPluginByType, isType, KEYS } from "platejs";
import {
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
  MemoizedChildren,
  useEditorRef,
  useElement,
  usePluginOption,
  useSelected,
} from "platejs/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const UNDRAGGABLE_KEYS = [KEYS.column, KEYS.tr, KEYS.td, KEYS.th];

/** `toDOMNode` pode devolver `null` ou um nó de texto; `getComputedStyle` exige `Element`. */
function asStyleElement(node: Node | null | undefined): Element | null {
  if (!node) return null;
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
  return node.parentElement;
}

function blockSelection(editor: PlateEditor) {
  return editor.getApi(BlockSelectionPlugin).blockSelection;
}

const VaultPlateDropLine = React.memo(function VaultPlateDropLine({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { dropLine } = useDropLine();

  if (!dropLine) return null;

  return (
    <div
      {...props}
      className={cn(
        "slate-dropLine",
        "absolute inset-x-0 h-0.5 opacity-100 transition-opacity",
        "bg-primary/50",
        dropLine === "top" && "-top-px",
        dropLine === "bottom" && "-bottom-px",
        className,
      )}
    />
  );
});

const createDragPreviewElements = (editor: PlateEditor, blocks: TElement[]): HTMLElement[] => {
  const elements: HTMLElement[] = [];
  const ids: string[] = [];

  const removeDataAttributes = (el: HTMLElement) => {
    Array.from(el.attributes).forEach((attr) => {
      if (attr.name.startsWith("data-slate") || attr.name.startsWith("data-block-id")) {
        el.removeAttribute(attr.name);
      }
    });

    Array.from(el.children).forEach((child) => {
      removeDataAttributes(child as HTMLElement);
    });
  };

  const resolveElement = (node: TElement, index: number) => {
    const raw = editor.api.toDOMNode(node);
    const domNode = asStyleElement(raw) as HTMLElement | null;
    if (!domNode) return;
    const newDomNode = domNode.cloneNode(true) as HTMLElement;

    const applyScrollCompensation = (original: Element, cloned: HTMLElement) => {
      const scrollLeft = original.scrollLeft;

      if (scrollLeft > 0) {
        const scrollWrapper = document.createElement("div");
        scrollWrapper.style.overflow = "hidden";
        scrollWrapper.style.width = `${original.clientWidth}px`;

        const innerContainer = document.createElement("div");
        innerContainer.style.transform = `translateX(-${scrollLeft}px)`;
        innerContainer.style.width = `${original.scrollWidth}px`;

        while (cloned.firstChild) {
          innerContainer.append(cloned.firstChild);
        }

        const originalStyles = window.getComputedStyle(original);
        cloned.style.padding = "0";
        innerContainer.style.padding = originalStyles.padding;

        scrollWrapper.append(innerContainer);
        cloned.append(scrollWrapper);
      }
    };

    applyScrollCompensation(domNode, newDomNode);

    ids.push(node.id as string);
    const wrapper = document.createElement("div");
    wrapper.append(newDomNode);
    wrapper.style.display = "flow-root";

    const lastDomNode = blocks[index - 1];

    if (lastDomNode) {
      const lastEl = asStyleElement(editor.api.toDOMNode(lastDomNode));
      const lastParent = lastEl?.parentElement;
      const domNodeRect = domNode.parentElement?.getBoundingClientRect();
      if (lastParent && domNodeRect) {
        const lastDomNodeRect = lastParent.getBoundingClientRect();
        const distance = domNodeRect.top - lastDomNodeRect.bottom;
        if (distance > 15) {
          wrapper.style.marginTop = `${distance}px`;
        }
      }
    }

    removeDataAttributes(newDomNode);
    elements.push(wrapper);
  };

  blocks.forEach((node, index) => {
    resolveElement(node, index);
  });

  editor.setOption(DndPlugin, "draggingId", ids);

  return elements;
};

const calculatePreviewTop = (
  editor: PlateEditor,
  {
    blocks,
    element,
  }: {
    blocks: TElement[];
    element: TElement;
  },
): number => {
  const child = asStyleElement(editor.api.toDOMNode(element));
  const editable = asStyleElement(editor.api.toDOMNode(editor));
  const firstSelectedChild = blocks[0];
  const firstDomNode = asStyleElement(editor.api.toDOMNode(firstSelectedChild));

  if (!child || !editable || !firstDomNode) return 0;

  const editorPaddingTop = Number(window.getComputedStyle(editable).paddingTop.replace("px", ""));

  const firstNodeToEditorDistance =
    firstDomNode.getBoundingClientRect().top - editable.getBoundingClientRect().top - editorPaddingTop;

  const firstMarginTopString = window.getComputedStyle(firstDomNode).marginTop;
  const marginTop = Number(firstMarginTopString.replace("px", ""));

  const currentToEditorDistance =
    child.getBoundingClientRect().top - editable.getBoundingClientRect().top - editorPaddingTop;

  const currentMarginTopString = window.getComputedStyle(child).marginTop;
  const currentMarginTop = Number(currentMarginTopString.replace("px", ""));

  return currentToEditorDistance - firstNodeToEditorDistance + marginTop - currentMarginTop;
};

const calcDragButtonTop = (editor: PlateEditor, element: TElement): number => {
  const child = asStyleElement(editor.api.toDOMNode(element));
  if (!child) return 0;
  const currentMarginTopString = window.getComputedStyle(child).marginTop;
  return Number(currentMarginTopString.replace("px", ""));
};

const VaultPlateDragHandle = React.memo(function VaultPlateDragHandle({
  isDragging,
  previewRef,
  resetPreview,
  setPreviewTop,
}: {
  isDragging: boolean;
  previewRef: React.RefObject<HTMLDivElement | null>;
  resetPreview: () => void;
  setPreviewTop: (top: number) => void;
}) {
  const editor = useEditorRef();
  const element = useElement();
  const bs = blockSelection(editor);

  return (
    <div
      className="flex size-full items-center justify-center"
      title="Arrastar para mover"
      onClick={(e) => {
        e.preventDefault();
        bs.focus();
      }}
      onMouseDown={(e) => {
        resetPreview();

        if ((e.button !== 0 && e.button !== 2) || e.shiftKey) return;

        const blockSelectionNodes = bs.getNodes({ sort: true });

        let selectionNodes =
          blockSelectionNodes.length > 0 ? blockSelectionNodes : editor.api.blocks({ mode: "highest" });

        if (!selectionNodes.some(([node]) => node.id === element.id)) {
          selectionNodes = [[element, editor.api.findPath(element)!]];
        }

        const blocks = expandListItemsWithChildren(editor, selectionNodes).map(([node]) => node);

        if (blockSelectionNodes.length === 0) {
          editor.tf.blur();
          editor.tf.collapse();
        }

        const elements = createDragPreviewElements(editor, blocks);
        previewRef.current?.append(...elements);
        previewRef.current?.classList.remove("hidden");
        previewRef.current?.classList.add("opacity-0");
        editor.setOption(DndPlugin, "multiplePreviewRef", previewRef);

        bs.set(blocks.map((block) => block.id as string));
      }}
      onMouseEnter={() => {
        if (isDragging) return;

        const blockSelectionNodes = bs.getNodes({ sort: true });

        let selectedBlocks =
          blockSelectionNodes.length > 0 ? blockSelectionNodes : editor.api.blocks({ mode: "highest" });

        if (!selectedBlocks.some(([node]) => node.id === element.id)) {
          selectedBlocks = [[element, editor.api.findPath(element)!]];
        }

        const processedBlocks = expandListItemsWithChildren(editor, selectedBlocks);

        const ids = processedBlocks.map((block) => block[0].id as string);

        if (ids.length > 1 && ids.includes(element.id as string)) {
          const top = calculatePreviewTop(editor, {
            blocks: processedBlocks.map((block) => block[0]),
            element,
          });
          setPreviewTop(top);
        } else {
          setPreviewTop(0);
        }
      }}
      onMouseUp={() => {
        resetPreview();
      }}
      data-plate-prevent-deselect
      role="button"
    >
      <GripVertical className="text-muted-foreground" aria-hidden />
    </div>
  );
});

function VaultPlateDndGutter({ children, className, ...props }: React.ComponentProps<"div">) {
  const editor = useEditorRef();
  const element = useElement();
  const isSelectionAreaVisible = usePluginOption(BlockSelectionPlugin, "isSelectionAreaVisible");
  const selected = useSelected();

  return (
    <div
      {...props}
      className={cn(
        "slate-gutterLeft",
        "-translate-x-full absolute top-0 z-50 flex h-full cursor-text hover:opacity-100 sm:opacity-0",
        getPluginByType(editor, element.type)?.node.isContainer
          ? "group-hover/container:opacity-100"
          : "group-hover:opacity-100",
        isSelectionAreaVisible && "hidden",
        !selected && "opacity-0",
        className,
      )}
      contentEditable={false}
    >
      {children}
    </div>
  );
}

function VaultPlateDraggableInner(props: PlateElementProps) {
  const { children, editor, element, path } = props;
  const bs = blockSelection(editor);

  const { isAboutToDrag, isDragging, nodeRef, previewRef, handleRef } = useDraggable({
    element,
    onDropHandler: (_, { dragItem }) => {
      const id = (dragItem as { id: string[] | string }).id;
      bs.add(id);
      resetPreview();
    },
  });

  const depth = path?.length ?? 0;
  const isInColumn = depth === 3;
  const isInTable = depth === 4;

  const [previewTop, setPreviewTop] = React.useState(0);

  const resetPreview = () => {
    if (previewRef.current) {
      previewRef.current.replaceChildren();
      previewRef.current.classList.add("hidden");
    }
  };

  React.useEffect(() => {
    if (!isDragging) {
      resetPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDragging]);

  React.useEffect(() => {
    if (isAboutToDrag) {
      previewRef.current?.classList.remove("opacity-0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAboutToDrag]);

  const [dragButtonTop, setDragButtonTop] = React.useState(0);

  return (
    <div
      className={cn(
        "relative",
        isDragging && "opacity-50",
        getPluginByType(editor, element.type)?.node.isContainer ? "group/container" : "group",
      )}
      onMouseEnter={() => {
        if (isDragging) return;
        setDragButtonTop(calcDragButtonTop(editor, element));
      }}
    >
      {!isInTable && (
        <VaultPlateDndGutter>
          <div className={cn("slate-blockToolbarWrapper flex h-[1.5em]", isInColumn && "h-4")}>
            <div
              className={cn(
                "slate-blockToolbar pointer-events-auto relative mr-1 flex w-[18px] items-center",
                isInColumn && "mr-1.5",
              )}
            >
              <Button
                type="button"
                ref={handleRef}
                variant="ghost"
                className="absolute -left-0 h-6 w-full p-0"
                style={{ top: `${dragButtonTop + 3}px` }}
                data-plate-prevent-deselect
              >
                <VaultPlateDragHandle
                  isDragging={isDragging}
                  previewRef={previewRef}
                  resetPreview={resetPreview}
                  setPreviewTop={setPreviewTop}
                />
              </Button>
            </div>
          </div>
        </VaultPlateDndGutter>
      )}

      <div
        ref={previewRef}
        className={cn("-left-0 absolute hidden w-full")}
        style={{ top: `${-previewTop}px` }}
        contentEditable={false}
      />

      <div
        ref={nodeRef}
        className="slate-blockWrapper flow-root"
        onContextMenu={(event) => {
          blockSelection(editor).addOnContextMenu({ element, event });
        }}
      >
        <MemoizedChildren>{children}</MemoizedChildren>
        <VaultPlateDropLine />
      </div>
    </div>
  );
}

export const VaultPlateBlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props;

  const enabled = React.useMemo(() => {
    if (!path || !Array.isArray(path)) return false;
    if (editor.dom.readOnly) return false;

    if (path.length === 1 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      return true;
    }
    if (path.length === 3 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      const block = editor.api.some({
        at: path,
        match: {
          type: editor.getType(KEYS.column),
        },
      });

      if (block) {
        return true;
      }
    }
    if (path.length === 4 && !isType(editor, element, UNDRAGGABLE_KEYS)) {
      const block = editor.api.some({
        at: path,
        match: {
          type: editor.getType(KEYS.table),
        },
      });

      if (block) {
        return true;
      }
    }

    return false;
  }, [editor, element, path]);

  if (!enabled) return;

  return (p) => <VaultPlateDraggableInner {...p} />;
};
