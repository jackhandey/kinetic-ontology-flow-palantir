/**
 * Semantic Ontology Layer — Business Object Schemas
 *
 * This file is the canonical contract between the data plane (raw_* tables)
 * and the Kinetic UI. The UI imports types from here ONLY. It must never
 * touch raw_* tables directly.
 *
 * These schemas are client-safe (no server imports).
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const GeoCoordinatesSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type GeoCoordinates = z.infer<typeof GeoCoordinatesSchema>;

export const RiskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskSeverity = z.infer<typeof RiskSeveritySchema>;

// ---------------------------------------------------------------------------
// ActiveAsset — physical transport units
// ---------------------------------------------------------------------------

export const AssetOperationalStatusSchema = z.enum([
  "in_transit",
  "idle",
  "loading",
  "unloading",
  "maintenance",
  "offline",
]);
export type AssetOperationalStatus = z.infer<typeof AssetOperationalStatusSchema>;

export const ActiveAssetSchema = z.object({
  id: z.string(),
  trackingId: z.string(),
  assetType: z.enum(["truck", "vessel", "rail", "air", "other"]),
  status: AssetOperationalStatusSchema,
  location: GeoCoordinatesSchema.nullable(),
  speedKph: z.number().nonnegative().nullable(),
  energyLevelPct: z.number().min(0).max(100).nullable(),
  lastTelemetryAt: z.string().datetime().nullable(),
  organizationId: z.string().uuid(),
});
export type ActiveAsset = z.infer<typeof ActiveAssetSchema>;

// ---------------------------------------------------------------------------
// ShippingRoute — the planned journey
// ---------------------------------------------------------------------------

export const RouteStatusSchema = z.enum([
  "planned",
  "active",
  "completed",
  "cancelled",
  "delayed",
]);
export type RouteStatus = z.infer<typeof RouteStatusSchema>;

export const WaypointSchema = z.object({
  name: z.string(),
  location: GeoCoordinatesSchema,
  sequence: z.number().int().nonnegative(),
  arrivedAt: z.string().datetime().nullable(),
});
export type Waypoint = z.infer<typeof WaypointSchema>;

export const ShippingRouteSchema = z.object({
  id: z.string(),
  routeCode: z.string(),
  assetId: z.string().nullable(),
  origin: z.object({ name: z.string(), location: GeoCoordinatesSchema }),
  destination: z.object({ name: z.string(), location: GeoCoordinatesSchema }),
  etaAt: z.string().datetime().nullable(),
  status: RouteStatusSchema,
  waypoints: z.array(WaypointSchema),
  organizationId: z.string().uuid(),
});
export type ShippingRoute = z.infer<typeof ShippingRouteSchema>;

// ---------------------------------------------------------------------------
// InventoryBatch — cargo being transported
// ---------------------------------------------------------------------------

export const TemperatureRequirementSchema = z.object({
  minC: z.number(),
  maxC: z.number(),
});

export const InventoryBatchSchema = z.object({
  id: z.string(),
  sku: z.string(),
  description: z.string().nullable(),
  volumeM3: z.number().nonnegative(),
  weightKg: z.number().nonnegative().nullable(),
  temperatureRequirement: TemperatureRequirementSchema.nullable(),
  clientOwnershipId: z.string(),
  declaredValueUsd: z.number().nonnegative(),
  assignedRouteId: z.string().nullable(),
  organizationId: z.string().uuid(),
});
export type InventoryBatch = z.infer<typeof InventoryBatchSchema>;

// ---------------------------------------------------------------------------
// RiskAlert — operational disruption
// ---------------------------------------------------------------------------

export const RiskCategorySchema = z.enum([
  "weather",
  "traffic",
  "mechanical",
  "geopolitical",
  "compliance",
  "telemetry_anomaly",
  "other",
]);
export type RiskCategory = z.infer<typeof RiskCategorySchema>;

export const RiskAlertSchema = z.object({
  id: z.string(),
  severity: RiskSeveritySchema,
  category: RiskCategorySchema,
  headline: z.string(),
  description: z.string().nullable(),
  impactedAssetIds: z.array(z.string()),
  impactedRouteIds: z.array(z.string()),
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  organizationId: z.string().uuid(),
});
export type RiskAlert = z.infer<typeof RiskAlertSchema>;

// ---------------------------------------------------------------------------
// Operator — human element
// ---------------------------------------------------------------------------

export const DutyStatusSchema = z.enum([
  "on_duty",
  "driving",
  "resting",
  "off_duty",
  "unavailable",
]);
export type DutyStatus = z.infer<typeof DutyStatusSchema>;

export const OperatorSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  dutyStatus: DutyStatusSchema,
  certificationLevel: z.string().nullable(),
  communicationRoutingId: z.string().nullable(),
  assignedAssetId: z.string().nullable(),
  lastLogAt: z.string().datetime().nullable(),
  organizationId: z.string().uuid(),
});
export type Operator = z.infer<typeof OperatorSchema>;

// ---------------------------------------------------------------------------
// CustomerIssue — unified view of a customer-facing problem.
// Joins raw_tickets (the complaint) with raw_transactions (the money at risk).
// ---------------------------------------------------------------------------

export const IssueStatusSchema = z.enum([
  "open",
  "acknowledged",
  "in_progress",
  "waiting_customer",
  "resolved",
  "closed",
]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

export const IssueChannelSchema = z.enum([
  "email",
  "phone",
  "chat",
  "portal",
  "social",
  "internal",
  "other",
]);
export type IssueChannel = z.infer<typeof IssueChannelSchema>;

export const LinkedTransactionSchema = z.object({
  transactionId: z.string(),
  amountUsd: z.number(),
  occurredAt: z.string().datetime().nullable(),
  kind: z.enum(["charge", "refund", "chargeback", "adjustment", "other"]),
});
export type LinkedTransaction = z.infer<typeof LinkedTransactionSchema>;

export const CustomerIssueSchema = z.object({
  id: z.string(),
  ticketRef: z.string(),
  customerId: z.string(),
  customerName: z.string().nullable(),
  subject: z.string(),
  description: z.string().nullable(),
  channel: IssueChannelSchema,
  severity: RiskSeveritySchema,
  status: IssueStatusSchema,
  relatedShipmentId: z.string().nullable(),
  linkedTransactions: z.array(LinkedTransactionSchema),
  financialExposureUsd: z.number(),
  openedAt: z.string().datetime(),
  lastUpdatedAt: z.string().datetime().nullable(),
  organizationId: z.string().uuid(),
});
export type CustomerIssue = z.infer<typeof CustomerIssueSchema>;

// ---------------------------------------------------------------------------
// FinancialRisk — quantified monetary exposure derived from transactions,
// fleet status, and operational conditions.
// ---------------------------------------------------------------------------

export const FinancialRiskKindSchema = z.enum([
  "chargeback",
  "unpaid_invoice",
  "fraud_suspected",
  "cargo_loss",
  "fleet_downtime",
  "compliance_penalty",
  "other",
]);
export type FinancialRiskKind = z.infer<typeof FinancialRiskKindSchema>;

export const FinancialRiskSchema = z.object({
  id: z.string(),
  kind: FinancialRiskKindSchema,
  severity: RiskSeveritySchema,
  headline: z.string(),
  exposureUsd: z.number().nonnegative(),
  currency: z.string().length(3),
  counterpartyId: z.string().nullable(),
  relatedAssetId: z.string().nullable(),
  relatedTransactionIds: z.array(z.string()),
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  organizationId: z.string().uuid(),
});
export type FinancialRisk = z.infer<typeof FinancialRiskSchema>;

// ---------------------------------------------------------------------------
// Query input schemas
// ---------------------------------------------------------------------------

export const ListQuerySchema = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().nonnegative().default(0),
});
export type ListQuery = z.infer<typeof ListQuerySchema>;

export const GetByIdSchema = z.object({ id: z.string().min(1).max(255) });
