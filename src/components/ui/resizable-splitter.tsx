"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface ResizableSplitterProps {
  /** Direction in which dragging moves the boundary: 'left' (modifies left panel) or 'right' (modifies right panel) */
  side: "left" | "right";
  /** Current panel width in pixels */
  width: number;
  /** Minimum allowable width in pixels */
  minWidth?: number;
  /** Maximum allowable width in pixels */
  maxWidth?: number;
  /** Default width in pixels (for double click reset) */
  defaultWidth?: number;
  /** Callback fired when the width changes during drag or on reset */
  onWidthChange: (newWidth: number) => void;
  /** Optional callback fired when dragging starts or ends */
  onDraggingChange?: (isDragging: boolean) => void;
  /** Custom class name */
  className?: string;
  /** Optional accessible label */
  ariaLabel?: string;
}

export function ResizableSplitter({
  side,
  width,
  minWidth = 240,
  maxWidth = 600,
  defaultWidth = 320,
  onWidthChange,
  onDraggingChange,
  className,
  ariaLabel,
}: ResizableSplitterProps) {
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(width);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragStartXRef.current = e.clientX;
      dragStartWidthRef.current = width;
      isDraggingRef.current = true;
      setIsDragging(true);
      onDraggingChange?.(true);
    },
    [width, onDraggingChange]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDraggingRef.current) return;
      const deltaX = e.clientX - dragStartXRef.current;
      const adjustedDelta = side === "left" ? deltaX : -deltaX;
      const calculatedWidth = Math.max(
        minWidth,
        Math.min(maxWidth, dragStartWidthRef.current + adjustedDelta)
      );
      onWidthChange(calculatedWidth);
    },
    [side, minWidth, maxWidth, onWidthChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDraggingRef.current) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // In case capture was already lost
        }
        isDraggingRef.current = false;
        setIsDragging(false);
        onDraggingChange?.(false);
      }
    },
    [onDraggingChange]
  );

  const handleDoubleClick = useCallback(() => {
    onWidthChange(defaultWidth);
  }, [defaultWidth, onWidthChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 20 : 8;
      if (side === "left") {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onWidthChange(Math.min(maxWidth, width + step));
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          onWidthChange(Math.max(minWidth, width - step));
        }
      } else {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onWidthChange(Math.min(maxWidth, width + step));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onWidthChange(Math.max(minWidth, width - step));
        }
      }
      if (e.key === "Home") {
        e.preventDefault();
        onWidthChange(minWidth);
      } else if (e.key === "End") {
        e.preventDefault();
        onWidthChange(maxWidth);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onWidthChange(defaultWidth);
      }
    },
    [side, width, minWidth, maxWidth, defaultWidth, onWidthChange]
  );

  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    } else {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isDragging]);

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={minWidth}
      aria-valuemax={maxWidth}
      aria-label={ariaLabel ?? `${side} panel resizer`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      title="Drag to resize, double-click to reset"
      className={cn(
        "group relative z-20 flex h-full w-2 shrink-0 cursor-col-resize select-none items-center justify-center -mx-1 touch-none transition-colors",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
        className
      )}
    >
      {/* Visual divider line with hover & active drag highlight */}
      <div
        className={cn(
          "h-full w-[2px] rounded-full transition-colors duration-150",
          isDragging
            ? "bg-primary w-[3px]"
            : "bg-transparent group-hover:bg-primary/50 group-active:bg-primary"
        )}
      />
      {/* Subtle grip dots shown on hover / active */}
      <div
        className={cn(
          "absolute pointer-events-none flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150",
          isDragging && "opacity-100"
        )}
      >
        <span className="h-1 w-1 rounded-full bg-primary/70" />
        <span className="h-1 w-1 rounded-full bg-primary/70" />
        <span className="h-1 w-1 rounded-full bg-primary/70" />
      </div>
    </div>
  );
}
