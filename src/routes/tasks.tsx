import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Plus, Radio } from "lucide-react";
import { toast } from "sonner";

import { listTasks, createTask } from "@/lib/tasks/tasks.functions";
import { ActionsPanel } from "@/components/ontology/ActionsPanel";
import { VibeBar } from "@/components/ontology/VibeBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const PRIORITY_COLOR: Record<string, string> = {
  low: "text-zinc-500",
  medium: "text-sky-400",
  high: "text-amber-400",
  critical: "text-red-400",
};

function TasksPage() {
  const fetchTasks = useServerFn(listTasks);
  const addTask = useServerFn(createTask);
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const { data } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => fetchTasks(),
  });

  // Realtime: any task change refreshes the list
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

  const tasks: Task[] = (data?.tasks ?? []) as Task[];
  const selected = tasks.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-mono">
      <Toaster />
      <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
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
      </header>

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
              return (
                <li
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`px-4 py-2.5 flex items-center gap-3 cursor-pointer ${
                    active ? "bg-zinc-900" : "hover:bg-zinc-900/50"
                  }`}
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
                    <div className="text-[10px] text-zinc-600 truncate">
                      {t.id}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wider ${PRIORITY_COLOR[t.priority] ?? "text-zinc-500"}`}
                  >
                    {t.priority}
                  </span>
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
                <div className="text-[10px] text-zinc-600">
                  task / {selected.id}
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500 mt-2">
                Select a task to view available actions.
              </p>
            )}
          </header>

          {selected && (
            <ActionsPanel objectType="task" objectId={selected.id} />
          )}
        </aside>
      </div>
    </div>
  );
}
