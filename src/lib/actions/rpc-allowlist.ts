/**
 * Server-side allowlist of PostgreSQL functions that may be invoked
 * via supabaseAdmin.rpc() from action dispatchers. The `action_types.rpc_function`
 * column is admin-editable, so we MUST validate it here to prevent
 * privilege escalation through arbitrary RPC calls under service role.
 */
export const ALLOWED_RPC_FUNCTIONS = new Set<string>([
  "mark_task_complete",
  "set_task_priority",
  "resolve_ontology_alert",
  "bulk_set_task_status",
]);

export function assertAllowedRpc(name: string | null | undefined): string {
  if (!name || !ALLOWED_RPC_FUNCTIONS.has(name)) {
    throw new Error(`RPC function not allowed: ${name ?? "(none)"}`);
  }
  return name;
}
