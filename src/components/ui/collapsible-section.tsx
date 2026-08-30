"use client";

import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  /** Title text shown in the header */
  title: string;
  /** Leading icon for the section header */
  icon?: React.ReactNode;
  /** Optional badge or counter text/number (e.g., "3", "$1,200") */
  badge?: string | number | null;
  /** Optional trailing action element (e.g., "+" add button) */
  action?: React.ReactNode;
  /** Initial open state */
  defaultOpen?: boolean;
  /** Controlled open state (optional) */
  open?: boolean;
  /** Callback fired when open state toggles */
  onOpenChange?: (open: boolean) => void;
  /** Optional custom container class name */
  className?: string;
  /** Optional header class name */
  headerClassName?: string;
  /** Content children to collapse/expand */
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  icon,
  badge,
  action,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  className,
  headerClassName,
  children,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : internalOpen;

  const handleToggle = useCallback(() => {
    const next = !isOpen;
    if (!isControlled) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }, [isOpen, isControlled, onOpenChange]);

  return (
    <div className={cn("group rounded-lg border border-border/50 bg-card/40 transition-all", className)}>
      {/* Header bar */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 select-none cursor-pointer rounded-lg hover:bg-muted/40 transition-colors",
          headerClassName
        )}
        onClick={handleToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleToggle();
          }
        }}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen ? "rotate-0" : "-rotate-90"
            )}
          />
          {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
          <span className="truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors">
            {title}
          </span>
          {badge !== undefined && badge !== null && (
            <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground">
              {badge}
            </span>
          )}
        </div>

        {action && (
          <div
            className="flex items-center shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {action}
          </div>
        )}
      </div>

      {/* Collapsible Content */}
      {isOpen && (
        <div className="px-3 pb-3 pt-1 animate-in fade-in-50 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}
