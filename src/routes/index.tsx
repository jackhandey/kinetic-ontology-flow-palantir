import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Radio, RefreshCw, Zap } from "lucide-react";

import {
  listActiveAssets,
  listOntologyAlerts,
} from "@/lib/ontology/ontology.functions";
import type {
  ActiveAsset,
  OntologyAlert,
  RiskSeverity,
} from "@/lib/ontology/schemas";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Command Center" },
      {
        name: "description",
        content:
          "Real-time operations dashboard: AI risk alerts and active fleet assets.",
      },
    ],
  }),
  component: CommandCenter,
});

const SEVERITY_STYLES: Record<RiskSeverity, string> = {
  low: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/20 text-red-400 border-red-500/40 animate-pulse",
};

function SeverityPill({ severity }: { severity: RiskSeverity }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest ${SEVERITY_STYLES[severity]}`}
    >
      {severity}
    </span>
  );
}

function StatusDot({ status }: { status: ActiveAsset["status"] }) {
  const color =
    status === "in_transit"
      ? "bg-emerald-400"
      : status === "idle" || status === "loading" || status === "unloading"
        ? "bg-amber-400"
        : status === "maintenance"
          ? "bg-orange-400"
          : "bg-zinc-500";
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300">
      <span className={`size-1.5 rounded-full ${color}`} />
      {status.replace("_", " ")}
    </span>
  );
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(11, 19) + "Z";
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10) + " " + d.toISOString().slice(11, 16);
}

function fmtUsd(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function CommandCenter() {
  const fetchAlerts = useServerFn(listOntologyAlerts);
  const fetchAssets = useServerFn(listActiveAssets);
  const [now, setNow] = useState(() => new Date());

  const alertsQ = useQuery({
    queryKey: ["ontology_alerts"],
    queryFn: () => fetchAlerts({ data: { limit: 100, offset: 0 } }),
    refetchInterval: 30_000,
  });
  const assetsQ = useQuery({
    queryKey: ["active_assets"],
    queryFn: () => fetchAssets({ data: { limit: 100, offset: 0 } }),
    refetchInterval: 30_000,
  });

  const alerts: OntologyAlert[] = alertsQ.data?.items ?? [];
  const assets: ActiveAsset[] = assetsQ.data?.items ?? [];

  const stats = useMemo(() => {
    const critical = alerts.filter((a) => a.severity === "critical").length;
    const inTransit = assets.filter((a) => a.status === "in_transit").length;
    const exposure = alerts.reduce((sum, a) => sum + (a.exposureUsd ?? 0), 0);
    return { critical, inTransit, exposure };
  }, [alerts, assets]);

  const handleRefresh = () => {
    setNow(new Date());
    alertsQ.refetch();
    assetsQ.refetch();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Toaster theme="dark" />

      {/* Header */}
      <header className="sticky top-0 z-10 grid grid-cols-1 gap-4 border-b border-zinc-800/80 bg-zinc-950/95 px-6 py-4 backdrop-blur md:grid-cols-[1fr_auto]">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-sm border border-emerald-500/40 bg-emerald-500/10">
            <Radio className="size-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-zinc-100">
              Operations Command Center
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              Ontology Layer · Live Feed · {fmtTime(now.toISOString())}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
          >
            <RefreshCw className="size-3" />
            Refresh
          </button>
        </div>
      </header>

      {/* KPI grid */}
      <section className="grid grid-cols-2 gap-px border-b border-zinc-800/80 bg-zinc-800/80 md:grid-cols-4">
        <KpiCell
          label="Critical Alerts"
          value={stats.critical.toString()}
          accent="text-red-400"
          icon={<AlertTriangle className="size-3.5" />}
        />
        <KpiCell
          label="Alerts (24h window)"
          value={alerts.length.toString()}
          accent="text-amber-400"
        />
        <KpiCell
          label="Assets In Transit"
          value={stats.inTransit.toString()}
          accent="text-emerald-400"
          icon={<Zap className="size-3.5" />}
        />
        <KpiCell
          label="Total Exposure"
          value={fmtUsd(stats.exposure)}
          accent="text-zinc-100"
        />
      </section>

      {/* Main grid */}
      <main className="grid grid-cols-1 gap-px bg-zinc-800/80 xl:grid-cols-5">
        {/* Alerts table — wider */}
        <section className="bg-zinc-950 xl:col-span-3">
          <PanelHeader
            title="AI Risk Alerts"
            subtitle="ontology_alerts · evaluator hourly"
            count={alerts.length}
            loading={alertsQ.isFetching}
            error={alertsQ.error}
          />
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="h-8 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Sev
                  </TableHead>
                  <TableHead className="h-8 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Detected
                  </TableHead>
                  <TableHead className="h-8 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Category
                  </TableHead>
                  <TableHead className="h-8 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Headline
                  </TableHead>
                  <TableHead className="h-8 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Asset
                  </TableHead>
                  <TableHead className="h-8 text-right font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Exposure
                  </TableHead>
                  <TableHead className="h-8 text-right font-mono text-[10px] uppercase tracking-widest text-zinc-500" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {alertsQ.isLoading ? (
                  <EmptyRow colSpan={7} label="Loading alerts…" />
                ) : alerts.length === 0 ? (
                  <EmptyRow colSpan={7} label="No alerts detected." />
                ) : (
                  alerts.map((a) => (
                    <TableRow
                      key={a.id}
                      className="border-zinc-900/80 transition-colors hover:bg-zinc-900/60"
                    >
                      <TableCell className="py-1.5">
                        <SeverityPill severity={a.severity} />
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-[11px] text-zinc-400">
                        {fmtDate(a.detectedAt)}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-300">
                        {a.category}
                      </TableCell>
                      <TableCell className="max-w-[28ch] truncate py-1.5 text-zinc-100">
                        {a.headline}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-[11px] text-zinc-400">
                        {a.sourceAssetId.slice(0, 12)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-[11px] text-zinc-200">
                        {fmtUsd(a.exposureUsd)}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 border-zinc-700 bg-transparent px-2 font-mono text-[10px] uppercase tracking-widest text-zinc-200 hover:bg-zinc-100 hover:text-zinc-900"
                          onClick={() =>
                            toast.success(`Action dispatched`, {
                              description: `Alert ${a.id.slice(0, 8)} → ${a.headline}`,
                            })
                          }
                        >
                          Take Action
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        {/* Assets table */}
        <section className="bg-zinc-950 xl:col-span-2">
          <PanelHeader
            title="Active Assets"
            subtitle="ActiveAsset · telemetry stream"
            count={assets.length}
            loading={assetsQ.isFetching}
            error={assetsQ.error}
          />
          <div className="overflow-x-auto">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="h-8 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Tracking
                  </TableHead>
                  <TableHead className="h-8 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Type
                  </TableHead>
                  <TableHead className="h-8 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Status
                  </TableHead>
                  <TableHead className="h-8 text-right font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Speed
                  </TableHead>
                  <TableHead className="h-8 text-right font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    Energy
                  </TableHead>
                  <TableHead className="h-8 text-right font-mono text-[10px] uppercase tracking-widest text-zinc-500" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {assetsQ.isLoading ? (
                  <EmptyRow colSpan={6} label="Loading assets…" />
                ) : assets.length === 0 ? (
                  <EmptyRow colSpan={6} label="No active assets." />
                ) : (
                  assets.map((a) => (
                    <TableRow
                      key={a.id}
                      className="border-zinc-900/80 transition-colors hover:bg-zinc-900/60"
                    >
                      <TableCell className="py-1.5 font-mono text-[11px] text-zinc-100">
                        {a.trackingId}
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400">
                        {a.assetType}
                      </TableCell>
                      <TableCell className="py-1.5">
                        <StatusDot status={a.status} />
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-[11px] text-zinc-200">
                        {a.speedKph == null ? "—" : `${a.speedKph.toFixed(0)} kph`}
                      </TableCell>
                      <TableCell className="py-1.5 text-right font-mono text-[11px] text-zinc-200">
                        {a.energyLevelPct == null
                          ? "—"
                          : `${a.energyLevelPct.toFixed(0)}%`}
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 border-zinc-700 bg-transparent px-2 font-mono text-[10px] uppercase tracking-widest text-zinc-200 hover:bg-zinc-100 hover:text-zinc-900"
                          onClick={() =>
                            toast.success("Action dispatched", {
                              description: `Asset ${a.trackingId} → operator notified`,
                            })
                          }
                        >
                          Take Action
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </main>
    </div>
  );
}

function KpiCell({
  label,
  value,
  accent,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-950 px-6 py-4">
      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        {icon}
        {label}
      </div>
      <div className={`mt-1 font-mono text-2xl tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  count,
  loading,
  error,
}: {
  title: string;
  subtitle: string;
  count: number;
  loading: boolean;
  error: unknown;
}) {
  return (
    <div className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
      <div>
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-200">
          {title}
          <span className="ml-2 text-zinc-500">[{count}]</span>
        </h2>
        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          {subtitle}
        </p>
      </div>
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest">
        {error ? (
          <span className="text-red-400">Error</span>
        ) : loading ? (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        ) : (
          <span className="text-zinc-500">Idle</span>
        )}
      </div>
    </div>
  );
}

function EmptyRow({ colSpan, label }: { colSpan: number; label: string }) {
  return (
    <TableRow className="border-zinc-900/80 hover:bg-transparent">
      <TableCell
        colSpan={colSpan}
        className="py-8 text-center font-mono text-[11px] uppercase tracking-widest text-zinc-600"
      >
        {label}
      </TableCell>
    </TableRow>
  );
}
