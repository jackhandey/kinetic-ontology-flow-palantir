import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getObjectHistory } from "@/lib/ontology/history.functions";
import { supabase } from "@/integrations/supabase/client";

export function HistoryPanel({
  objectType,
  objectId,
}: {
  objectType: string;
  objectId: string;
}) {
  const fetchFn = useServerFn(getObjectHistory);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["object-history", objectType, objectId],
    queryFn: () => fetchFn({ data: { objectType, objectId } }),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`audit-${objectType}-${objectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "audit_log",
          filter: `object_id=eq.${objectId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["object-history", objectType, objectId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [objectType, objectId, qc]);

  if (isLoading) return <p className="text-xs text-zinc-500">Loading history…</p>;
  const events = data?.events ?? [];
  if (events.length === 0)
    return <p className="text-xs text-zinc-500">No recorded activity.</p>;

  return (
    <ol className="space-y-2 font-mono text-[11px]">
      {events.map((e) => (
        <li
          key={e.id}
          className="border-l-2 border-zinc-800 pl-3 py-1 hover:border-emerald-500/40"
        >
          <div className="flex items-center gap-2 text-zinc-300">
            <span className="uppercase tracking-wider text-emerald-400">{e.action}</span>
            <span className="text-zinc-600">·</span>
            <time className="text-zinc-500">
              {new Date(e.created_at).toLocaleString()}
            </time>
          </div>
          <div className="text-[10px] text-zinc-600 truncate">
            actor {e.actor_id?.slice(0, 8) ?? "system"}
          </div>
        </li>
      ))}
    </ol>
  );
}
