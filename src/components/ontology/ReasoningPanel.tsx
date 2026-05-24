/**
 * Visual reasoning chain panel — shows the step-by-step logic the LLM
 * followed when dispatching an action, plus the context node IDs it
 * considered ("receipts" view).
 */
export function ReasoningPanel({
  reasoning,
  contextNodeIds,
}: {
  reasoning: string[];
  contextNodeIds: string[];
}) {
  return (
    <div className="border border-zinc-800 bg-zinc-950 font-mono text-[11px] text-zinc-300 rounded-sm overflow-hidden">
      <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 text-zinc-500 uppercase tracking-widest text-[10px]">
        Reasoning Chain
      </div>
      <ol className="px-3 py-2 space-y-1">
        {reasoning.map((step, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-emerald-500">{String(i + 1).padStart(2, "0")}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      {contextNodeIds.length > 0 && (
        <div className="border-t border-zinc-800 px-3 py-2">
          <div className="text-zinc-500 uppercase tracking-widest text-[10px] mb-1">
            Context nodes ({contextNodeIds.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {contextNodeIds.slice(0, 30).map((id) => (
              <span
                key={id}
                className="px-1.5 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-sm"
              >
                {id.slice(0, 8)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
