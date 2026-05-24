/**
 * Multiplayer presence overlay. Renders live cursors of other users on top
 * of a relative container using Supabase Realtime Presence.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Cursor = { x: number; y: number; name: string; color: string };

const COLORS = ["#10b981", "#f59e0b", "#3b82f6", "#ec4899", "#a855f7", "#ef4444"];

export function PresenceLayer({ room }: { room: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const meRef = useRef({
    id: Math.random().toString(36).slice(2, 10),
    name: "user-" + Math.random().toString(36).slice(2, 6),
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  });

  useEffect(() => {
    const me = meRef.current;
    const channel = supabase.channel(`presence:${room}`, {
      config: { presence: { key: me.id } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<Cursor & { id: string }>();
        const next: Record<string, Cursor> = {};
        for (const [key, metas] of Object.entries(state)) {
          if (key === me.id) continue;
          const meta = metas[0];
          if (meta) next[key] = meta;
        }
        setCursors(next);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ x: 0, y: 0, name: me.name, color: me.color });
        }
      });

    const onMove = (e: MouseEvent) => {
      const el = containerRef.current?.parentElement;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      if (x < 0 || x > 100 || y < 0 || y > 100) return;
      channel.track({ x, y, name: me.name, color: me.color });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      supabase.removeChannel(channel);
    };
  }, [room]);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-50">
      {Object.entries(cursors).map(([id, c]) => (
        <div
          key={id}
          style={{
            position: "absolute",
            left: `${c.x}%`,
            top: `${c.y}%`,
            transform: "translate(-2px, -2px)",
            transition: "left 80ms linear, top 80ms linear",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16">
            <path
              d="M1 1 L1 12 L4 9 L7 14 L9 13 L6 8 L11 8 Z"
              fill={c.color}
              stroke="black"
              strokeWidth="0.5"
            />
          </svg>
          <span
            className="ml-1 font-mono text-[10px] px-1 rounded-sm"
            style={{ background: c.color, color: "#000" }}
          >
            {c.name}
          </span>
        </div>
      ))}
    </div>
  );
}
