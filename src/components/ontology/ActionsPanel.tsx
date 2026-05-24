/**
 * Dynamic actions panel — renders buttons for every action_type whose
 * target_object_type matches the current object. Actions with a
 * payload_schema open a dynamic form dialog; others execute immediately.
 *
 * Subscribes to action_requests realtime so the latest dispatch status
 * appears without a refresh.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Play, Zap } from "lucide-react";

import {
  listActionRequests,
  listActionTypes,
  requestAction,
} from "@/lib/actions/action-framework.functions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type JsonSchema = {
  type?: string;
  properties?: Record<
    string,
    { type?: string; title?: string; description?: string; enum?: string[] }
  >;
  required?: string[];
};

type ActionType = {
  id: string;
  api_name: string;
  display_name: string;
  description: string | null;
  target_object_type: string;
  payload_schema: JsonSchema | null;
  rpc_function: string | null;
  webhook_url: string | null;
};

export function ActionsPanel({
  objectType,
  objectId,
}: {
  objectType: string;
  objectId: string;
}) {
  const fetchTypes = useServerFn(listActionTypes);
  const fetchRequests = useServerFn(listActionRequests);
  const submitAction = useServerFn(requestAction);
  const qc = useQueryClient();

  const { data: typesData, isLoading } = useQuery({
    queryKey: ["action-types"],
    queryFn: () => fetchTypes(),
  });

  const { data: requestsData } = useQuery({
    queryKey: ["action-requests", objectId],
    queryFn: () => fetchRequests({ data: { limit: 20 } }),
  });

  // Realtime: refresh on any action_request change for this object.
  useEffect(() => {
    const ch = supabase
      .channel(`action-requests-${objectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "action_requests" },
        () => {
          qc.invalidateQueries({ queryKey: ["action-requests", objectId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [objectId, qc]);

  const actions: ActionType[] = useMemo(() => {
    const all = (typesData?.actionTypes ?? []) as ActionType[];
    return all.filter((a) => a.target_object_type === objectType);
  }, [typesData, objectType]);

  const recent = useMemo(() => {
    return (requestsData?.requests ?? []).filter(
      (r) => r.target_object_id === objectId,
    );
  }, [requestsData, objectId]);

  const [activeAction, setActiveAction] = useState<ActionType | null>(null);

  const mutation = useMutation({
    mutationFn: async (vars: { action: ActionType; payload: Record<string, unknown> }) =>
      submitAction({
        data: {
          actionTypeId: vars.action.id,
          targetObjectId: objectId,
          payload: vars.payload,
        },
      }),
    onSuccess: (res, vars) => {
      toast.success(`${vars.action.display_name}: ${res.status}`);
      qc.invalidateQueries({ queryKey: ["action-requests", objectId] });
      setActiveAction(null);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Action failed"),
  });

  return (
    <section className="border border-zinc-800 rounded-sm">
      <header className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-emerald-400" />
          <h3 className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            Available actions
          </h3>
        </div>
        <span className="font-mono text-[10px] text-zinc-600">{actions.length}</span>
      </header>

      <div className="p-3 space-y-2">
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading actions…
          </div>
        )}
        {!isLoading && actions.length === 0 && (
          <p className="text-xs text-zinc-500">
            No actions registered for object type{" "}
            <code className="text-zinc-300">{objectType}</code>.
          </p>
        )}
        {actions.map((a) => {
          const needsForm = a.payload_schema && Object.keys(a.payload_schema.properties ?? {}).length > 0;
          return (
            <div
              key={a.id}
              className="flex items-start justify-between border border-zinc-800 rounded-sm px-3 py-2"
            >
              <div className="pr-3">
                <div className="font-mono text-sm text-zinc-100">{a.display_name}</div>
                {a.description && (
                  <p className="text-[11px] text-zinc-500 mt-0.5">{a.description}</p>
                )}
                <div className="text-[10px] font-mono text-zinc-600 mt-1">
                  {a.rpc_function ? `rpc → ${a.rpc_function}` : a.webhook_url ? "webhook" : "n8n"}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={mutation.isPending}
                onClick={() =>
                  needsForm
                    ? setActiveAction(a)
                    : mutation.mutate({ action: a, payload: {} })
                }
              >
                <Play className="h-3 w-3 mr-1" /> Run
              </Button>
            </div>
          );
        })}
      </div>

      {recent.length > 0 && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5">
            Recent dispatches
          </div>
          <ul className="space-y-1">
            {recent.slice(0, 5).map((r) => (
              <li key={r.id} className="text-[11px] font-mono text-zinc-400 flex justify-between">
                <span>{new Date(r.requested_at).toLocaleTimeString()}</span>
                <span
                  className={
                    r.status === "succeeded"
                      ? "text-emerald-400"
                      : r.status === "failed"
                        ? "text-red-400"
                        : "text-amber-400"
                  }
                >
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PayloadDialog
        action={activeAction}
        onClose={() => setActiveAction(null)}
        onSubmit={(payload) => activeAction && mutation.mutate({ action: activeAction, payload })}
        submitting={mutation.isPending}
      />
    </section>
  );
}

function PayloadDialog({
  action,
  onClose,
  onSubmit,
  submitting,
}: {
  action: ActionType | null;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
  submitting: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    setValues({});
  }, [action?.id]);

  if (!action) return null;
  const schema = action.payload_schema ?? { properties: {} };
  const props = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const handleSubmit = () => {
    const payload: Record<string, unknown> = {};
    for (const [key, def] of Object.entries(props)) {
      const v = values[key] ?? "";
      if (!v && required.has(key)) {
        return;
      }
      payload[key] = def.type === "number" ? Number(v) : v;
    }
    onSubmit(payload);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="font-mono">{action.display_name}</DialogTitle>
          {action.description && (
            <DialogDescription>{action.description}</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3 py-2">
          {Object.entries(props).map(([key, def]) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={key} className="font-mono text-xs">
                {def.title ?? key}
                {required.has(key) && <span className="text-red-400 ml-1">*</span>}
              </Label>
              {def.description && (
                <p className="text-[11px] text-zinc-500">{def.description}</p>
              )}
              {def.type === "string" && (def.description?.length ?? 0) > 60 ? (
                <Textarea
                  id={key}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              ) : (
                <Input
                  id={key}
                  type={def.type === "number" ? "number" : "text"}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Dispatch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
