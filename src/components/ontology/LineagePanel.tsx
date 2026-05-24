import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Database, GitBranch } from "lucide-react";
import { getObjectLineage } from "@/lib/ontology/history.functions";
import { StatusBadge } from "./StatusBadge";

export function LineagePanel({
  objectType,
  objectId,
}: {
  objectType: string;
  objectId: string;
}) {
  const fetchFn = useServerFn(getObjectLineage);
  const { data, isLoading } = useQuery({
    queryKey: ["object-lineage", objectType, objectId],
    queryFn: () => fetchFn({ data: { objectType, objectId } }),
  });

  if (isLoading) return <p className="text-xs text-zinc-500">Loading lineage…</p>;
  const pipelines = data?.pipelines ?? [];
  const runs = data?.runs ?? [];

  if (pipelines.length === 0)
    return (
      <p className="text-xs text-zinc-500">
        No pipelines target <code className="text-zinc-300">{objectType}</code> yet.
      </p>
    );

  return (
    <div className="space-y-4 font-mono text-[11px]">
      {pipelines.map((p) => (
        <div key={p.id} className="border border-zinc-800 rounded-sm p-3 space-y-2">
          <div className="flex items-center gap-2 text-zinc-300">
            <Database className="h-3 w-3 text-zinc-500" />
            <span className="text-zinc-500">{p.source_table}</span>
            <ArrowRight className="h-3 w-3 text-zinc-700" />
            <GitBranch className="h-3 w-3 text-emerald-400" />
            <span>{p.name}</span>
            <ArrowRight className="h-3 w-3 text-zinc-700" />
            <span className="text-zinc-400">{p.target_object_type}</span>
          </div>
          <div className="text-[10px] text-zinc-600">
            schedule: {p.schedule_cron ?? "—"} · {p.enabled ? "enabled" : "disabled"}
          </div>
          <ul className="pl-4 space-y-0.5 text-[10px] text-zinc-500">
            {runs
              .filter((r) => r.pipeline_id === p.id)
              .slice(0, 5)
              .map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <StatusBadge value={r.status} />
                  <span>{new Date(r.started_at).toLocaleTimeString()}</span>
                  <span className="text-zinc-700">
                    {r.rows_in}→{r.rows_out}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
