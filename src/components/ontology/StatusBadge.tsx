import { cn } from "@/lib/utils";

type Tone = "critical" | "high" | "medium" | "low" | "success" | "info" | "neutral";

const TONE_MAP: Record<string, Tone> = {
  critical: "critical",
  high: "high",
  open: "high",
  in_progress: "info",
  blocked: "critical",
  complete: "success",
  succeeded: "success",
  failed: "critical",
  medium: "medium",
  low: "low",
  pending_approval: "medium",
  approved: "info",
};

const TONE_STYLES: Record<Tone, string> = {
  critical:
    "bg-red-500/10 text-red-300 border-red-500/40 shadow-[0_0_10px_-2px_rgb(239,68,68)]",
  high:
    "bg-amber-500/10 text-amber-300 border-amber-500/40 shadow-[0_0_8px_-3px_rgb(245,158,11)]",
  medium: "bg-sky-500/10 text-sky-300 border-sky-500/40",
  low: "bg-zinc-500/10 text-zinc-400 border-zinc-700",
  success:
    "bg-emerald-500/10 text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_-3px_rgb(16,185,129)]",
  info: "bg-indigo-500/10 text-indigo-300 border-indigo-500/40",
  neutral: "bg-zinc-800/40 text-zinc-400 border-zinc-700",
};

export function StatusBadge({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const tone = TONE_MAP[value.toLowerCase()] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 border rounded-sm font-mono text-[10px] uppercase tracking-wider",
        TONE_STYLES[tone],
        className,
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "critical" && "bg-red-400 animate-pulse",
          tone === "high" && "bg-amber-400",
          tone === "medium" && "bg-sky-400",
          tone === "low" && "bg-zinc-500",
          tone === "success" && "bg-emerald-400",
          tone === "info" && "bg-indigo-400",
          tone === "neutral" && "bg-zinc-500",
        )}
      />
      {value}
    </span>
  );
}
