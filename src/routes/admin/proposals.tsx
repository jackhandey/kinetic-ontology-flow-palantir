import { useRef, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Loader2, Sparkles, XCircle } from "lucide-react";

import {
  analyzeCsvProposal,
  decideProposal,
  listProposals,
  scanRawForProposals,
} from "@/lib/ontology/proposals.functions";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ontology/Breadcrumbs";
import { supabase } from "@/integrations/supabase/client";

const RAW_TABLES = [
  "raw_asset_status","raw_driver_logs","raw_fleet_status","raw_freight_orders",
  "raw_inventory_batches","raw_route_plans","raw_shipping_manifests",
  "raw_telemetry_logs","raw_tickets","raw_traffic_incidents",
  "raw_transactions","raw_weather_conditions",
] as const;

export const Route = createFileRoute("/admin/proposals")({
  head: () => ({
    meta: [{ title: "Schema Proposals — Self-Evolving Ontology" }],
  }),
  component: ProposalsPage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6 text-sm text-red-400">
        <p>Failed to load: {error.message}</p>
        <Button size="sm" variant="outline" onClick={() => { reset(); router.invalidate(); }}>
          Retry
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6 text-sm text-zinc-400">Not found.</div>,
});

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (l: string) => l.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  const headers = split(lines[0]);
  const rows = lines.slice(1, 21).map((l) => {
    const parts = split(l);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = parts[i] ?? ""; });
    return obj;
  });
  return { headers, rows };
}

function ProposalsPage() {
  const list = useServerFn(listProposals);
  const scan = useServerFn(scanRawForProposals);
  const analyze = useServerFn(analyzeCsvProposal);
  const decide = useServerFn(decideProposal);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["schema-proposals"],
    queryFn: () => list(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("schema-proposals-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "schema_proposals" }, () =>
        qc.invalidateQueries({ queryKey: ["schema-proposals"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const scanMut = useMutation({
    mutationFn: (rawTable: typeof RAW_TABLES[number]) => scan({ data: { rawTable } }),
    onSuccess: (r) => {
      if (r.ok) toast.success("Proposal created");
      else toast.message(r.message ?? "No proposal");
      qc.invalidateQueries({ queryKey: ["schema-proposals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Scan failed"),
  });

  const csvMut = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) throw new Error("Empty CSV");
      return analyze({ data: { filename: file.name, headers, sampleRows: rows } });
    },
    onSuccess: () => {
      toast.success("CSV analyzed — proposal created");
      qc.invalidateQueries({ queryKey: ["schema-proposals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "CSV analyze failed"),
  });

  const decideMut = useMutation({
    mutationFn: (vars: { id: string; decision: "promoted" | "rejected" }) =>
      decide({ data: vars }),
    onSuccess: (_r, vars) => {
      toast.success(`Proposal ${vars.decision}`);
      qc.invalidateQueries({ queryKey: ["schema-proposals"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Decision failed"),
  });

  const onFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    csvMut.mutate(f);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-3">
        <Breadcrumbs
          items={[
            { label: "ontology", to: "/" },
            { label: "admin" },
            { label: "proposals" },
          ]}
        />
        <h1 className="font-mono text-sm uppercase tracking-widest mt-2">
          Schema Proposals
        </h1>
        <p className="text-xs text-zinc-500 mt-1">
          LLM-suggested ontology evolutions awaiting promotion.{" "}
          <Link to="/" className="text-emerald-400 hover:underline">← back</Link>
        </p>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-8">
        {/* CSV Drop Zone */}
        <section>
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            Zero-friction ingest
          </h2>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onFiles(e.dataTransfer.files);
            }}
            onClick={() => fileRef.current?.click()}
            className={`border border-dashed rounded-sm p-6 text-center cursor-pointer transition ${
              dragOver ? "border-emerald-400 bg-emerald-500/5" : "border-zinc-700 hover:border-zinc-500"
            }`}
          >
            <FileUp className="h-5 w-5 mx-auto text-zinc-400 mb-2" />
            <div className="font-mono text-xs text-zinc-300">
              {csvMut.isPending ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Analyzing…
                </span>
              ) : (
                "Drop a CSV here or click to upload — the LLM will auto-map columns to the ontology"
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => onFiles(e.target.files)}
            />
          </div>
        </section>

        {/* Raw table scan */}
        <section>
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            Self-evolving schema · scan a raw table
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {RAW_TABLES.map((t) => (
              <Button
                key={t}
                size="sm"
                variant="outline"
                disabled={scanMut.isPending}
                onClick={() => scanMut.mutate(t)}
                className="font-mono text-[11px]"
              >
                <Sparkles className="h-3 w-3 mr-1 text-emerald-400" /> {t}
              </Button>
            ))}
          </div>
        </section>

        {/* Proposals list */}
        <section>
          <h2 className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
            Pending proposals
          </h2>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
          {data?.proposals.length === 0 && (
            <p className="text-xs text-zinc-500">No proposals yet.</p>
          )}
          <ul className="space-y-2">
            {data?.proposals.map((p) => (
              <li
                key={p.id}
                className="border border-zinc-800 rounded-sm bg-zinc-900/40 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-sm border ${
                          p.status === "pending"
                            ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
                            : p.status === "promoted"
                              ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                              : "border-zinc-700 text-zinc-400"
                        }`}
                      >
                        {p.status}
                      </span>
                      <span className="font-mono text-xs text-zinc-300">{p.title}</span>
                    </div>
                    <div className="font-mono text-[10px] text-zinc-500 mt-1">
                      {p.source} · {new Date(p.created_at).toLocaleString()}
                    </div>
                    {p.rationale && (
                      <div className="text-xs text-zinc-400 mt-1">{p.rationale}</div>
                    )}
                    <pre className="mt-2 text-[10px] font-mono text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-sm p-2 overflow-x-auto max-h-48">
                      {JSON.stringify(p.proposal, null, 2)}
                    </pre>
                  </div>
                  {p.status === "pending" && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={decideMut.isPending}
                        onClick={() => decideMut.mutate({ id: p.id, decision: "promoted" })}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Promote
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={decideMut.isPending}
                        onClick={() => decideMut.mutate({ id: p.id, decision: "rejected" })}
                      >
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
