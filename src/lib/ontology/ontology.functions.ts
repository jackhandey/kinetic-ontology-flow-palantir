/**
 * Semantic Ontology Layer — Server Functions
 *
 * The ONLY surface the Kinetic UI is allowed to consume. Each function:
 *   1. Authenticates the caller via requireSupabaseAuth (org-scoped Supabase client)
 *   2. Reads from raw_* tables — RLS ensures only the caller's org rows are returned
 *   3. Maps raw payloads → typed business objects via the .server mappers
 *   4. Returns plain DTOs (Zod-validated) to the UI
 *
 * Keep this file thin: server-fn declarations + their imports only.
 * Shared logic lives in mappers.server.ts.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  GetByIdSchema,
  ListQuerySchema,
  type ActiveAsset,
  type CustomerIssue,
  type FinancialRisk,
  type InventoryBatch,
  type LinkedTransaction,
  type Operator,
  type RiskAlert,
  type ShippingRoute,
} from "./schemas";
import {
  mapAssetStatusRow,
  mapDriverLogRow,
  mapFleetStatusRow,
  mapFleetStatusToFinancialRisk,
  mapInventoryBatchRow,
  mapRoutePlanRow,
  mapTicketRow,
  mapTrafficToRisk,
  mapTransactionRowToLink,
  mapTransactionToFinancialRisk,
  mapWeatherToRisk,
  type RawRow,
} from "./mappers.server";

const RAW_COLUMNS = "id, organization_id, raw_payload, ingested_at, processed_at";

// ---------------------------------------------------------------------------
// ActiveAsset
// ---------------------------------------------------------------------------

export const listActiveAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListQuerySchema.parse(input))
  .handler(async ({ data, context }): Promise<{ items: ActiveAsset[] }> => {
    const { supabase } = context;
    const window = data.offset + data.limit;
    const [statusRes, fleetRes] = await Promise.all([
      supabase
        .from("raw_asset_status")
        .select(RAW_COLUMNS)
        .order("ingested_at", { ascending: false })
        .limit(window),
      supabase
        .from("raw_fleet_status")
        .select(RAW_COLUMNS)
        .order("ingested_at", { ascending: false })
        .limit(window),
    ]);
    if (statusRes.error) throw new Error(statusRes.error.message);
    if (fleetRes.error) throw new Error(fleetRes.error.message);

    const statusItems = (statusRes.data as RawRow[] | null ?? [])
      .map(mapAssetStatusRow)
      .filter((x): x is ActiveAsset => x !== null);
    const fleetItems = (fleetRes.data as RawRow[] | null ?? [])
      .map(mapFleetStatusRow)
      .filter((x): x is ActiveAsset => x !== null);

    // Merge by trackingId — asset_status (telemetry) wins on conflict.
    const byTracking = new Map<string, ActiveAsset>();
    for (const a of fleetItems) byTracking.set(a.trackingId, a);
    for (const a of statusItems) byTracking.set(a.trackingId, a);
    const items = [...byTracking.values()]
      .sort((a, b) => (b.lastTelemetryAt ?? "").localeCompare(a.lastTelemetryAt ?? ""))
      .slice(data.offset, data.offset + data.limit);
    return { items };
  });

export const getActiveAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GetByIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ item: ActiveAsset | null }> => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("raw_asset_status")
      .select(RAW_COLUMNS)
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { item: row ? mapAssetStatusRow(row as RawRow) : null };
  });

// ---------------------------------------------------------------------------
// ShippingRoute
// ---------------------------------------------------------------------------

export const listShippingRoutes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListQuerySchema.parse(input))
  .handler(async ({ data, context }): Promise<{ items: ShippingRoute[] }> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("raw_route_plans")
      .select(RAW_COLUMNS)
      .order("ingested_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);

    const items = (rows as RawRow[] | null ?? [])
      .map(mapRoutePlanRow)
      .filter((x): x is ShippingRoute => x !== null);
    return { items };
  });

// ---------------------------------------------------------------------------
// InventoryBatch
// ---------------------------------------------------------------------------

export const listInventoryBatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListQuerySchema.parse(input))
  .handler(async ({ data, context }): Promise<{ items: InventoryBatch[] }> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("raw_inventory_batches")
      .select(RAW_COLUMNS)
      .order("ingested_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);

    const items = (rows as RawRow[] | null ?? [])
      .map(mapInventoryBatchRow)
      .filter((x): x is InventoryBatch => x !== null);
    return { items };
  });

// ---------------------------------------------------------------------------
// RiskAlert — fuses weather + traffic streams into a unified business object
// ---------------------------------------------------------------------------

export const listRiskAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListQuerySchema.parse(input))
  .handler(async ({ data, context }): Promise<{ items: RiskAlert[] }> => {
    const { supabase } = context;
    const window = data.offset + data.limit;

    const [weather, traffic] = await Promise.all([
      supabase
        .from("raw_weather_conditions")
        .select(RAW_COLUMNS)
        .order("ingested_at", { ascending: false })
        .limit(window),
      supabase
        .from("raw_traffic_incidents")
        .select(RAW_COLUMNS)
        .order("ingested_at", { ascending: false })
        .limit(window),
    ]);
    if (weather.error) throw new Error(weather.error.message);
    if (traffic.error) throw new Error(traffic.error.message);

    const weatherAlerts = (weather.data as RawRow[] | null ?? [])
      .map(mapWeatherToRisk)
      .filter((x): x is RiskAlert => x !== null);
    const trafficAlerts = (traffic.data as RawRow[] | null ?? [])
      .map(mapTrafficToRisk)
      .filter((x): x is RiskAlert => x !== null);

    const items = [...weatherAlerts, ...trafficAlerts]
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
      .slice(data.offset, data.offset + data.limit);
    return { items };
  });

// ---------------------------------------------------------------------------
// Operator
// ---------------------------------------------------------------------------

export const listOperators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListQuerySchema.parse(input))
  .handler(async ({ data, context }): Promise<{ items: Operator[] }> => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("raw_driver_logs")
      .select(RAW_COLUMNS)
      .order("ingested_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);

    const items = (rows as RawRow[] | null ?? [])
      .map(mapDriverLogRow)
      .filter((x): x is Operator => x !== null);
    return { items };
  });

// ---------------------------------------------------------------------------
// CustomerIssue — joins raw_tickets ⨝ raw_transactions
// ---------------------------------------------------------------------------

export const listCustomerIssues = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListQuerySchema.parse(input))
  .handler(async ({ data, context }): Promise<{ items: CustomerIssue[] }> => {
    const { supabase } = context;
    const window = (data.offset + data.limit) * 2; // overfetch for join coverage

    const [ticketsRes, txnRes] = await Promise.all([
      supabase
        .from("raw_tickets")
        .select(RAW_COLUMNS)
        .order("ingested_at", { ascending: false })
        .limit(window),
      supabase
        .from("raw_transactions")
        .select(RAW_COLUMNS)
        .order("ingested_at", { ascending: false })
        .limit(window),
    ]);
    if (ticketsRes.error) throw new Error(ticketsRes.error.message);
    if (txnRes.error) throw new Error(txnRes.error.message);

    // Build txn lookup indexes
    const byCustomer = new Map<string, LinkedTransaction[]>();
    const byTicketRef = new Map<string, LinkedTransaction[]>();
    for (const row of (txnRes.data as RawRow[] | null ?? [])) {
      const mapped = mapTransactionRowToLink(row);
      if (!mapped) continue;
      if (mapped.customerId) {
        const arr = byCustomer.get(mapped.customerId) ?? [];
        arr.push(mapped.link);
        byCustomer.set(mapped.customerId, arr);
      }
      if (mapped.ticketRef) {
        const arr = byTicketRef.get(mapped.ticketRef) ?? [];
        arr.push(mapped.link);
        byTicketRef.set(mapped.ticketRef, arr);
      }
    }

    const items = (ticketsRes.data as RawRow[] | null ?? [])
      .map((r) => mapTicketRow(r, { byCustomer, byTicketRef }))
      .filter((x): x is CustomerIssue => x !== null)
      .slice(data.offset, data.offset + data.limit);
    return { items };
  });

// ---------------------------------------------------------------------------
// FinancialRisk — unified from raw_transactions + raw_fleet_status
// ---------------------------------------------------------------------------

export const listFinancialRisks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListQuerySchema.parse(input))
  .handler(async ({ data, context }): Promise<{ items: FinancialRisk[] }> => {
    const { supabase } = context;
    const window = data.offset + data.limit;

    const [txnRes, fleetRes] = await Promise.all([
      supabase
        .from("raw_transactions")
        .select(RAW_COLUMNS)
        .order("ingested_at", { ascending: false })
        .limit(window),
      supabase
        .from("raw_fleet_status")
        .select(RAW_COLUMNS)
        .order("ingested_at", { ascending: false })
        .limit(window),
    ]);
    if (txnRes.error) throw new Error(txnRes.error.message);
    if (fleetRes.error) throw new Error(fleetRes.error.message);

    const txnRisks = (txnRes.data as RawRow[] | null ?? [])
      .map(mapTransactionToFinancialRisk)
      .filter((x): x is FinancialRisk => x !== null);
    const fleetRisks = (fleetRes.data as RawRow[] | null ?? [])
      .map(mapFleetStatusToFinancialRisk)
      .filter((x): x is FinancialRisk => x !== null);

    const items = [...txnRisks, ...fleetRisks]
      .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
      .slice(data.offset, data.offset + data.limit);
    return { items };
  });
