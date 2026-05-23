/**
 * Semantic Ontology Layer — Mappers (SERVER ONLY)
 *
 * Translates raw_* JSONB payloads into typed business objects. These functions
 * are defensive: raw payloads originate from n8n pipelines and may be
 * malformed, partial, or evolving. A mapper that cannot produce a valid
 * business object returns `null` and the caller filters it out — one bad row
 * should never break the ontology.
 */
import { z } from "zod";
import {
  ActiveAssetSchema,
  type ActiveAsset,
  AssetOperationalStatusSchema,
  CustomerIssueSchema,
  type CustomerIssue,
  IssueChannelSchema,
  IssueStatusSchema,
  type LinkedTransaction,
  LinkedTransactionSchema,
  FinancialRiskSchema,
  type FinancialRisk,
  FinancialRiskKindSchema,
  GeoCoordinatesSchema,
  InventoryBatchSchema,
  type InventoryBatch,
  OperatorSchema,
  type Operator,
  DutyStatusSchema,
  RiskAlertSchema,
  type RiskAlert,
  RiskCategorySchema,
  RiskSeveritySchema,
  ShippingRouteSchema,
  type ShippingRoute,
  RouteStatusSchema,
  WaypointSchema,
} from "./schemas";

// ---------------------------------------------------------------------------
// Shared row shape — every raw_* table follows it
// ---------------------------------------------------------------------------

export interface RawRow {
  id: string;
  organization_id: string;
  raw_payload: unknown;
  ingested_at: string;
  processed_at: string | null;
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const parseLocation = (v: unknown) => {
  const p = obj(v);
  const lat = num(p.lat ?? p.latitude);
  const lng = num(p.lng ?? p.lon ?? p.longitude);
  if (lat === null || lng === null) return null;
  const r = GeoCoordinatesSchema.safeParse({ lat, lng });
  return r.success ? r.data : null;
};

const safeEnum = <T extends z.ZodEnum<[string, ...string[]]>>(
  schema: T,
  value: unknown,
  fallback: z.infer<T>,
): z.infer<T> => {
  const r = schema.safeParse(value);
  return r.success ? r.data : fallback;
};


// ---------------------------------------------------------------------------
// ActiveAsset ← raw_asset_status (+ optional telemetry merge)
// ---------------------------------------------------------------------------

export function mapAssetStatusRow(row: RawRow): ActiveAsset | null {
  const p = obj(row.raw_payload);
  const trackingId = str(p.tracking_id ?? p.asset_id ?? p.vehicle_id ?? p.id);
  if (!trackingId) return null;

  const candidate = {
    id: row.id,
    trackingId,
    assetType: safeEnum(
      z.enum(["truck", "vessel", "rail", "air", "other"]),
      p.asset_type ?? p.type,
      "other" as const,
    ),
    status: safeEnum(AssetOperationalStatusSchema, p.status ?? p.operational_status, "offline"),
    location: parseLocation(p.location ?? p.gps ?? p.coordinates),
    speedKph: num(p.speed_kph ?? p.speed),
    energyLevelPct: num(p.fuel_pct ?? p.battery_pct ?? p.energy_level_pct),
    lastTelemetryAt: str(p.last_telemetry_at) ?? row.ingested_at,
    organizationId: row.organization_id,
  };

  const r = ActiveAssetSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------------------
// ShippingRoute ← raw_route_plans
// ---------------------------------------------------------------------------

export function mapRoutePlanRow(row: RawRow): ShippingRoute | null {
  const p = obj(row.raw_payload);
  const routeCode = str(p.route_code ?? p.code ?? p.route_id);
  const originLoc = parseLocation(obj(p.origin).location ?? p.origin_location);
  const destLoc = parseLocation(obj(p.destination).location ?? p.destination_location);
  if (!routeCode || !originLoc || !destLoc) return null;

  const waypointsRaw = Array.isArray(p.waypoints) ? p.waypoints : [];
  const waypoints = waypointsRaw
    .map((w, i) => {
      const wp = obj(w);
      const loc = parseLocation(wp.location ?? wp);
      if (!loc) return null;
      const parsed = WaypointSchema.safeParse({
        name: str(wp.name) ?? `Waypoint ${i + 1}`,
        location: loc,
        sequence: num(wp.sequence) ?? i,
        arrivedAt: str(wp.arrived_at),
      });
      return parsed.success ? parsed.data : null;
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);

  const candidate = {
    id: row.id,
    routeCode,
    assetId: str(p.asset_id ?? p.vehicle_id),
    origin: { name: str(obj(p.origin).name) ?? "Origin", location: originLoc },
    destination: { name: str(obj(p.destination).name) ?? "Destination", location: destLoc },
    etaAt: str(p.eta_at ?? p.estimated_arrival),
    status: safeEnum(RouteStatusSchema, p.status, "planned"),
    waypoints,
    organizationId: row.organization_id,
  };

  const r = ShippingRouteSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------------------
// InventoryBatch ← raw_inventory_batches
// ---------------------------------------------------------------------------

export function mapInventoryBatchRow(row: RawRow): InventoryBatch | null {
  const p = obj(row.raw_payload);
  const sku = str(p.sku ?? p.product_code);
  const clientId = str(p.client_ownership_id ?? p.client_id ?? p.owner_id);
  if (!sku || !clientId) return null;

  const tempRaw = obj(p.temperature_requirement ?? p.temp_range);
  const minC = num(tempRaw.min_c ?? tempRaw.min);
  const maxC = num(tempRaw.max_c ?? tempRaw.max);
  const temperatureRequirement = minC !== null && maxC !== null ? { minC, maxC } : null;

  const candidate = {
    id: row.id,
    sku,
    description: str(p.description ?? p.name),
    volumeM3: num(p.volume_m3 ?? p.volume) ?? 0,
    weightKg: num(p.weight_kg ?? p.weight),
    temperatureRequirement,
    clientOwnershipId: clientId,
    declaredValueUsd: num(p.declared_value_usd ?? p.value) ?? 0,
    assignedRouteId: str(p.assigned_route_id ?? p.route_id),
    organizationId: row.organization_id,
  };

  const r = InventoryBatchSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------------------
// RiskAlert ← raw_weather_conditions | raw_traffic_incidents (unified)
// ---------------------------------------------------------------------------

export function mapWeatherToRisk(row: RawRow): RiskAlert | null {
  const p = obj(row.raw_payload);
  return buildRisk(row, {
    category: "weather",
    severity: deriveWeatherSeverity(p),
    headline: str(p.headline ?? p.event ?? p.condition) ?? "Weather alert",
    description: str(p.description ?? p.summary),
    impactedAssetIds: arrIds(p.impacted_asset_ids),
    impactedRouteIds: arrIds(p.impacted_route_ids),
    detectedAt: str(p.detected_at ?? p.observed_at) ?? row.ingested_at,
  });
}

export function mapTrafficToRisk(row: RawRow): RiskAlert | null {
  const p = obj(row.raw_payload);
  return buildRisk(row, {
    category: "traffic",
    severity: safeEnum(RiskSeveritySchema, p.severity, "medium"),
    headline: str(p.headline ?? p.incident_type) ?? "Traffic incident",
    description: str(p.description),
    impactedAssetIds: arrIds(p.impacted_asset_ids),
    impactedRouteIds: arrIds(p.impacted_route_ids),
    detectedAt: str(p.detected_at ?? p.reported_at) ?? row.ingested_at,
  });
}

function buildRisk(
  row: RawRow,
  partial: {
    category: z.infer<typeof RiskCategorySchema>;
    severity: z.infer<typeof RiskSeveritySchema>;
    headline: string;
    description: string | null;
    impactedAssetIds: string[];
    impactedRouteIds: string[];
    detectedAt: string;
  },
): RiskAlert | null {
  const candidate = {
    id: row.id,
    ...partial,
    resolvedAt: null,
    organizationId: row.organization_id,
  };
  const r = RiskAlertSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

function deriveWeatherSeverity(p: Record<string, unknown>): z.infer<typeof RiskSeveritySchema> {
  const explicit = RiskSeveritySchema.safeParse(p.severity);
  if (explicit.success) return explicit.data;
  const wind = num(p.wind_kph) ?? 0;
  if (wind >= 90) return "critical";
  if (wind >= 60) return "high";
  if (wind >= 35) return "medium";
  return "low";
}

function arrIds(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

// ---------------------------------------------------------------------------
// Operator ← raw_driver_logs
// ---------------------------------------------------------------------------

export function mapDriverLogRow(row: RawRow): Operator | null {
  const p = obj(row.raw_payload);
  const fullName = str(p.full_name ?? p.driver_name ?? p.name);
  if (!fullName) return null;

  const candidate = {
    id: row.id,
    fullName,
    dutyStatus: safeEnum(DutyStatusSchema, p.duty_status ?? p.status, "off_duty"),
    certificationLevel: str(p.certification_level ?? p.license_class),
    communicationRoutingId: str(p.communication_routing_id ?? p.contact_id),
    assignedAssetId: str(p.assigned_asset_id ?? p.vehicle_id),
    lastLogAt: str(p.last_log_at) ?? row.ingested_at,
    organizationId: row.organization_id,
  };

  const r = OperatorSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------------------
// Fleet status augmentation for ActiveAsset
// ---------------------------------------------------------------------------

export function mapFleetStatusRow(row: RawRow): ActiveAsset | null {
  const p = obj(row.raw_payload);
  const trackingId = str(p.tracking_id ?? p.fleet_id ?? p.asset_id ?? p.vehicle_id);
  if (!trackingId) return null;
  const candidate = {
    id: row.id,
    trackingId,
    assetType: safeEnum(
      z.enum(["truck", "vessel", "rail", "air", "other"]),
      p.asset_type ?? p.type,
      "truck" as const,
    ),
    status: safeEnum(AssetOperationalStatusSchema, p.status ?? p.operational_status, "idle"),
    location: parseLocation(p.location ?? p.gps),
    speedKph: num(p.speed_kph ?? p.speed),
    energyLevelPct: num(p.fuel_pct ?? p.battery_pct ?? p.energy_level_pct),
    lastTelemetryAt: str(p.updated_at ?? p.last_seen_at) ?? row.ingested_at,
    organizationId: row.organization_id,
  };
  const r = ActiveAssetSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------------------
// CustomerIssue ← raw_tickets ⨝ raw_transactions (by customer_id)
// ---------------------------------------------------------------------------

const TXN_KIND = z.enum(["charge", "refund", "chargeback", "adjustment", "other"]);

export function mapTransactionRowToLink(row: RawRow): {
  customerId: string | null;
  ticketRef: string | null;
  link: LinkedTransaction;
} | null {
  const p = obj(row.raw_payload);
  const txnId = str(p.transaction_id ?? p.txn_id ?? p.id) ?? row.id;
  const amount = num(p.amount_usd ?? p.amount);
  if (amount === null) return null;
  const candidate = {
    transactionId: txnId,
    amountUsd: amount,
    occurredAt: str(p.occurred_at ?? p.created_at),
    kind: safeEnum(TXN_KIND, p.kind ?? p.type, "other"),
  };
  const r = LinkedTransactionSchema.safeParse(candidate);
  if (!r.success) return null;
  return {
    customerId: str(p.customer_id ?? p.client_id),
    ticketRef: str(p.ticket_ref ?? p.ticket_id),
    link: r.data,
  };
}

export function mapTicketRow(
  row: RawRow,
  txnIndex: { byCustomer: Map<string, LinkedTransaction[]>; byTicketRef: Map<string, LinkedTransaction[]> },
): CustomerIssue | null {
  const p = obj(row.raw_payload);
  const ticketRef = str(p.ticket_ref ?? p.ticket_id ?? p.reference) ?? row.id;
  const customerId = str(p.customer_id ?? p.client_id);
  const subject = str(p.subject ?? p.title);
  if (!customerId || !subject) return null;

  const linked = [
    ...(txnIndex.byTicketRef.get(ticketRef) ?? []),
    ...(txnIndex.byCustomer.get(customerId) ?? []),
  ];
  // de-dupe by transactionId
  const seen = new Set<string>();
  const linkedTransactions = linked.filter((t) => {
    if (seen.has(t.transactionId)) return false;
    seen.add(t.transactionId);
    return true;
  });

  const financialExposureUsd = linkedTransactions.reduce(
    (acc, t) => acc + (t.kind === "refund" || t.kind === "chargeback" ? Math.abs(t.amountUsd) : 0),
    0,
  );

  const candidate = {
    id: row.id,
    ticketRef,
    customerId,
    customerName: str(p.customer_name ?? p.client_name),
    subject,
    description: str(p.description ?? p.body),
    channel: safeEnum(IssueChannelSchema, p.channel ?? p.source, "other"),
    severity: safeEnum(RiskSeveritySchema, p.severity ?? p.priority, "medium"),
    status: safeEnum(IssueStatusSchema, p.status, "open"),
    relatedShipmentId: str(p.shipment_id ?? p.freight_id ?? p.manifest_id),
    linkedTransactions,
    financialExposureUsd,
    openedAt: str(p.opened_at ?? p.created_at) ?? row.ingested_at,
    lastUpdatedAt: str(p.last_updated_at ?? p.updated_at),
    organizationId: row.organization_id,
  };
  const r = CustomerIssueSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------------------
// FinancialRisk ← raw_transactions + raw_fleet_status (downtime exposure)
// ---------------------------------------------------------------------------

export function mapTransactionToFinancialRisk(row: RawRow): FinancialRisk | null {
  const p = obj(row.raw_payload);
  const amount = num(p.amount_usd ?? p.amount);
  if (amount === null) return null;
  const kindRaw = str(p.kind ?? p.type) ?? "";

  let kind: z.infer<typeof FinancialRiskKindSchema> | null = null;
  if (kindRaw === "chargeback") kind = "chargeback";
  else if (kindRaw === "refund" && Math.abs(amount) >= 1000) kind = "chargeback";
  else if (p.fraud_flag === true || p.is_fraud === true) kind = "fraud_suspected";
  else if (p.status === "overdue" || p.status === "unpaid") kind = "unpaid_invoice";
  if (!kind) return null;

  const exposure = Math.abs(amount);
  const severity: z.infer<typeof RiskSeveritySchema> =
    exposure >= 25000 ? "critical" : exposure >= 5000 ? "high" : exposure >= 1000 ? "medium" : "low";

  const candidate = {
    id: row.id,
    kind,
    severity,
    headline: `${kind.replace(/_/g, " ")} — $${exposure.toFixed(0)}`,
    exposureUsd: exposure,
    currency: (str(p.currency)?.toUpperCase() ?? "USD").slice(0, 3),
    counterpartyId: str(p.customer_id ?? p.client_id ?? p.counterparty_id),
    relatedAssetId: str(p.asset_id ?? p.vehicle_id),
    relatedTransactionIds: [str(p.transaction_id ?? p.txn_id) ?? row.id],
    detectedAt: str(p.occurred_at ?? p.created_at) ?? row.ingested_at,
    resolvedAt: str(p.resolved_at),
    organizationId: row.organization_id,
  };
  const r = FinancialRiskSchema.safeParse(candidate);
  return r.success ? r.data : null;
}

export function mapFleetStatusToFinancialRisk(row: RawRow): FinancialRisk | null {
  const p = obj(row.raw_payload);
  const status = str(p.status ?? p.operational_status);
  if (status !== "maintenance" && status !== "offline") return null;

  const downtimeHours = num(p.downtime_hours) ?? 1;
  const hourlyCost = num(p.hourly_cost_usd) ?? 250;
  const exposure = Math.max(0, downtimeHours * hourlyCost);
  const severity: z.infer<typeof RiskSeveritySchema> =
    exposure >= 25000 ? "critical" : exposure >= 5000 ? "high" : exposure >= 1000 ? "medium" : "low";

  const candidate = {
    id: row.id,
    kind: "fleet_downtime" as const,
    severity,
    headline: `Fleet downtime — ${downtimeHours.toFixed(1)}h`,
    exposureUsd: exposure,
    currency: "USD",
    counterpartyId: null,
    relatedAssetId: str(p.asset_id ?? p.fleet_id ?? p.vehicle_id),
    relatedTransactionIds: [],
    detectedAt: str(p.updated_at ?? p.last_seen_at) ?? row.ingested_at,
    resolvedAt: null,
    organizationId: row.organization_id,
  };
  const r = FinancialRiskSchema.safeParse(candidate);
  return r.success ? r.data : null;
}
