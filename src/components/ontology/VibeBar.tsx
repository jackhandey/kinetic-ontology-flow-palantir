/**
 * Vibe command bar — natural-language action dispatcher backed by
 * Lovable AI tool-calling. Designed to be mounted anywhere a user
 * might want to operate on the ontology.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { dispatchVibe } from "@/lib/actions/vibe.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function VibeBar({
  contextObjectId,
  contextObjectType,
  placeholder = "Try: resolve the latest critical alert",
}: {
  contextObjectId?: string;
  contextObjectType?: string;
  placeholder?: string;
}) {
  const fn = useServerFn(dispatchVibe);
  const [value, setValue] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      fn({
        data: {
          prompt: value,
          contextObjectId,
          contextObjectType,
        },
      }),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Dispatched ${res.action} → ${res.targetObjectId} (${res.status})`);
        setValue("");
        qc.invalidateQueries({ queryKey: ["action-requests"] });
        qc.invalidateQueries({ queryKey: ["ontology-alerts"] });
      } else {
        toast.message(res.message ?? "No action taken");
      }
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Vibe dispatch failed"),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim().length > 1) mutation.mutate();
      }}
      className="flex items-center gap-2 border border-zinc-800 rounded-sm bg-zinc-950/60 px-2 py-1.5"
    >
      <Sparkles className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent border-0 focus-visible:ring-0 h-7 font-mono text-xs px-1"
        disabled={mutation.isPending}
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        disabled={mutation.isPending || value.trim().length < 2}
      >
        {mutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
        Dispatch
      </Button>
    </form>
  );
}
