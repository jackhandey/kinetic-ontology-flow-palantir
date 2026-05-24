import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export type Crumb = { label: string; to?: string; params?: Record<string, string> };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-zinc-500">
      {items.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {c.to ? (
            <Link
              to={c.to}
              params={c.params as never}
              className="hover:text-emerald-400"
            >
              {c.label}
            </Link>
          ) : (
            <span className="text-zinc-300">{c.label}</span>
          )}
          {i < items.length - 1 && <ChevronRight className="h-3 w-3 text-zinc-700" />}
        </span>
      ))}
    </nav>
  );
}
