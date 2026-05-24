import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, Plus, Radio, X } from "lucide-react";
import { toast } from "sonner";

import { bulkSetTaskStatus, createTask, listTasks } from "@/lib/tasks/tasks.functions";
import { ActionsPanel } from "@/components/ontology/ActionsPanel";
import { VibeBar } from "@/components/ontology/VibeBar";
import { StatusBadge } from "@/components/ontology/StatusBadge";
import { HistoryPanel } from "@/components/ontology/HistoryPanel";
import { Breadcrumbs } from "@/components/ontology/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · AIP Ontology" },
      { name: "description", content: "Self-describing task ontology with dynamic actions." },
    ],
  }),
  component: TasksPage,
});

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  completed_at: string | null;
  created_at: string;
};

function TasksPage() {
  const fetchTasks = useServerFn(listTasks);
  const addTask = useServerFn(createTask);
  const bulkUpdate = useServerFn(bulkSetTaskStatus);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [draft, setDraft] = useState("");

  const { data } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks(),
  });

  useEffect(() => {
    const ch = supabase
      .channel("tasks-stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => qc.invalidateQueries({ queryKey: ["tasks"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const create = useMutation({
    mutationFn: (title: string) => addTask({ data: { title } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Task created");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const bulk = useMutation({
    mutationFn: (status: "complete" | "in_progress" | "blocked" | "open") =>
      bulkUpdate({ data: { ids: [...bulkIds], status } }),
    onSuccess: (res) => {
      toast.success(`Updated ${res.updated} tasks`);
      setBulkIds(new Set());
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Bulk failed"),
  });

  const tasks: Task[] = useMemo(() => (data?.tasks ?? []) as Task[], [data]);
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  function toggleBulk(id: string) {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      <Toaster />
      <header className="border-b border-zinc-800 px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-sm uppercase tracking-widest text-zinc-300">
              tasks.ontology
            </h1>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
              <Radio className="h-3 w-3 animate-pulse" /> live
            </span>
          </div>
          <div className="w-[480px]">
            <VibeBar
              contextObjectType="task"
              contextObjectId={selectedId ?? undefined}
              placeholder="Try: mark the first task complete · set priority to high"
            />
          </div>
        </div>
        <Breadcrumbs items={[{ label: "ontology", to: "/" }, { label: "tasks" }]} />
      </header>

      {bulkIds.size > 0 && (
        <div className="border-b border-emerald-500/30 bg-emerald-500/5 px-6 py-2 flex items-center gap-3 text-xs">
          <span className="text-emerald-300">{bulkIds.size} selected</span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("complete")} disabled={bulk.isPending}>
              Mark complete
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("in_progress")} disabled={bulk.isPending}>
              In progress
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("blocked")} disabled={bulk.isPending}>
              Block
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate("open")} disabled={bulk.isPending}>
              Reopen
            </Button>
          </div>
          <button
            onClick={() => setBulkIds(new Set())}
            className="ml-auto text-zinc-500 hover:text-zinc-300"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-[1fr_380px] gap-0">
        <section className="border-r border-zinc-800 p-6 space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim().length > 0) create.mutate(draft.trim());
            }}
            className="flex gap-2"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="New task title…"
              className="bg-zinc-900 border-zinc-800 font-mono text-xs h-8"
            />
            <Button type="submit" size="sm" disabled={create.isPending}>
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </form>

          <ul className="border border-zinc-800 rounded-sm divide-y divide-zinc-800">
            {tasks.length === 0 && (
              <li className="px-4 py-6 text-xs text-zinc-500">No tasks yet.</li>
            )}
            {tasks.map((t) => {
              const done = t.status === "complete";
              const active = t.id === selectedId;
              const checked = bulkIds.has(t.id);
              return (
                <li
                  key={t.id}
                  className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer ${
                    active ? "bg-zinc-900" : "hover:bg-zinc-900/50"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleBulk(t.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="border-zinc-700"
                  />
                  <div
                    className="flex items-center gap-3 flex-1 min-w-0"
                    onClick={() => setSelectedId(t.id)}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Circle className="h-4 w-4 text-zinc-600" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-xs truncate ${done ? "line-through text-zinc-500" : "text-zinc-100"}`}
                      >
                        {t.title}
                      </div>
                      <div className="text-[10px] text-zinc-600 truncate">{t.id}</div>
                    </div>
                    <StatusBadge value={t.status} />
                    <StatusBadge value={t.priority} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="p-6 space-y-4">
          <header>
            <h2 className="text-[10px] uppercase tracking-widest text-zinc-500">
              object inspector
            </h2>
            {selected ? (
              <>
                <div className="text-sm text-zinc-100 mt-1">{selected.title}</div>
                <div className="text-[10px] text-zinc-600">task / {selected.id}</div>
              </>
            ) : (
              <p className="text-xs text-zinc-500 mt-2">
                Select a task to view available actions.
              </p>
            )}
          </header>

          {selected && (
            <>
              <ActionsPanel objectType="task" objectId={selected.id} />
              <div className="pt-4 border-t border-zinc-800">
                <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-2">
                  history
                </h3>
                <HistoryPanel objectType="task" objectId={selected.id} />
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
