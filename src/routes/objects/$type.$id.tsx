import { useEffect } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Network } from "lucide-react";

import { getObjectGraph } from "@/lib/ontology/graph.functions";
import { Button } from "@/components/ui/button";
import { ActionsPanel } from "@/components/ontology/ActionsPanel";
import { VibeBar } from "@/components/ontology/VibeBar";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/objects/$type/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.type} · ${params.id} — Object Explorer` },
      {
        name: "description",
        content: `Relational graph view of ontology object ${params.id} (${params.type}).`,
      },
    ],
  }),
  component: ObjectExplorer,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 text-sm text-red-400">
        <p>Failed to load object: {error.message}</p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6 text-sm text-zinc-400">Object not found.</div>,
});

function ObjectExplorer() {
  const { type, id } = Route.useParams();
  const fetchGraph = useServerFn(getObjectGraph);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["object-graph", type, id],
    queryFn: () => fetchGraph({ data: { objectType: type, objectId: id, depth: 1 } }),
  });

  // Realtime: refresh graph when links or alerts change.
  useEffect(() => {
    const ch = supabase
      .channel(`object-${type}-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ontology_object_links" },
        () => qc.invalidateQueries({ queryKey: ["object-graph", type, id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ontology_alerts" },
        () => qc.invalidateQueries({ queryKey: ["object-graph", type, id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [type, id, qc]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200">
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button size="sm" variant="ghost" className="text-zinc-400">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {type}
            </div>
            <h1 className="font-mono text-lg">{id}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 text-zinc-500 text-xs">
          <Network className="h-4 w-4" /> Object Explorer
        </div>
      </header>

      <main className="px-6 py-6 max-w-5xl mx-auto space-y-6">
        <VibeBar contextObjectId={id} contextObjectType={type} />
        <ActionsPanel objectType={type} objectId={id} />

        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading graph…
          </div>
        )}

        {data && (
          <>
            <section>
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
                Connected objects ({data.nodes.length - 1})
              </h2>
              {data.nodes.length <= 1 ? (
                <p className="text-zinc-400 text-sm">
                  No relational links recorded yet. Populate{" "}
                  <code className="text-zinc-300">ontology_object_links</code> to see neighbors here.
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.nodes
                    .filter((n) => n.id !== id)
                    .map((n) => (
                      <li
                        key={n.id}
                        className="border border-zinc-800 rounded-sm px-3 py-2 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                            {n.type}
                          </div>
                          <div className="font-mono text-sm">{n.title}</div>
                        </div>
                        <Link
                          to="/objects/$type/$id"
                          params={{ type: n.type, id: n.id }}
                          className="text-xs text-emerald-400 hover:underline"
                        >
                          Explore →
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
                Edges ({data.edges.length})
              </h2>
              <ul className="text-xs font-mono text-zinc-400 space-y-1">
                {data.edges.map((e, i) => (
                  <li key={i}>
                    {e.from} <span className="text-zinc-600">— {e.linkDisplay} →</span> {e.to}
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
