import type { ComponentPropsWithoutRef, ReactNode } from "react";

type PanelProps = ComponentPropsWithoutRef<"section"> & {
  children: ReactNode;
  className?: string;
  tone?: "document" | "quiet" | "sealed";
};

export function Panel({ children, className = "", tone = "document", ...props }: PanelProps) {
  return <section className={`player-panel player-panel--${tone} ${className}`} {...props}>{children}</section>;
}

export function StatusBadge({ children }: { children: ReactNode }) {
  return <span className="player-status-badge">{children}</span>;
}
