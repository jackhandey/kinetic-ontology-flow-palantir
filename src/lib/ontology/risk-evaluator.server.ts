/**
 * Risk Evaluator — SERVER ONLY
 *
 * Calls the Lovable AI Gateway with a strict tool-calling schema mirroring
 * `RiskEvaluationSchema` so the model returns structured output we can parse
 * with Zod. Used by the hourly background worker to evaluate ActiveAssets.
 *
 * This file is `.server.ts` so the bundler refuses any client-side import.
 */
import { RiskEvaluationSchema, type RiskEvaluation, type ActiveAsset } from "./schemas";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

const SYSTEM_PROMPT = `You are a senior logistics risk analyst.
Evaluate a single ActiveAsset (vehicle / vessel / cargo carrier) against the supplied
recent operational context (telemetry, weather, traffic, driver activity in its area).
Decide whether the asset is at meaningful logistical risk in the next 24 hours.

Rules:
- Only set riskDetected=true when there is concrete evidence in the provided context.
- Choose severity by impact: low (advisory), medium (delay likely),
  high (significant delay or partial loss), critical (safety / total loss).
- Choose category from the allowed enum. Use "other" only as last resort.
- headline: <= 120 chars, action-oriented.
- description: 1-3 sentences explaining the evidence.
- impactedAssetIds / impactedRouteIds: only include IDs that appear in the input.
- exposureUsd: best-effort monetary exposure, or null if not derivable.
- rationale: short internal reasoning trail (or null).`;

const TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "report_risk_evaluation",
    description: "Return the structured risk evaluation for the supplied asset.",
    parameters: {
      type: "object",
      properties: {
        riskDetected: { type: "boolean" },
        severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
        category: {
          type: "string",
          enum: [
            "weather",
            "traffic",
            "mechanical",
            "geopolitical",
            "compliance",
            "telemetry_anomaly",
            "other",
          ],
        },
        headline: { type: "string" },
        description: { type: "string" },
        impactedAssetIds: { type: "array", items: { type: "string" } },
        impactedRouteIds: { type: "array", items: { type: "string" } },
        exposureUsd: { type: ["number", "null"] },
        rationale: { type: ["string", "null"] },
      },
      required: [
        "riskDetected",
        "severity",
        "category",
        "headline",
        "description",
        "impactedAssetIds",
        "impactedRouteIds",
        "exposureUsd",
        "rationale",
      ],
      additionalProperties: false,
    },
  },
};

export interface RiskContext {
  recentWeather: unknown[];
  recentTraffic: unknown[];
  recentDriverLogs: unknown[];
  recentTelemetry: unknown[];
}

export interface EvaluatorResult {
  evaluation: RiskEvaluation | null;
  model: string;
  errorCode?: "rate_limited" | "payment_required" | "gateway_error" | "parse_error";
  errorMessage?: string;
}

export async function evaluateAssetRisk(
  asset: ActiveAsset,
  context: RiskContext,
  opts: { model?: string } = {},
): Promise<EvaluatorResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      evaluation: null,
      model: opts.model ?? DEFAULT_MODEL,
      errorCode: "gateway_error",
      errorMessage: "LOVABLE_API_KEY is not configured",
    };
  }

  const model = opts.model ?? DEFAULT_MODEL;

  const userPayload = {
    asset,
    context: {
      recentWeather: context.recentWeather.slice(0, 20),
      recentTraffic: context.recentTraffic.slice(0, 20),
      recentDriverLogs: context.recentDriverLogs.slice(0, 20),
      recentTelemetry: context.recentTelemetry.slice(0, 50),
    },
  };

  let resp: Response;
  try {
    resp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              "Evaluate this asset and return the structured risk evaluation via the tool.\n\n" +
              JSON.stringify(userPayload),
          },
        ],
        tools: [TOOL_DEFINITION],
        tool_choice: {
          type: "function",
          function: { name: "report_risk_evaluation" },
        },
      }),
    });
  } catch (e) {
    return {
      evaluation: null,
      model,
      errorCode: "gateway_error",
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }

  if (resp.status === 429) {
    return { evaluation: null, model, errorCode: "rate_limited", errorMessage: "Rate limited" };
  }
  if (resp.status === 402) {
    return {
      evaluation: null,
      model,
      errorCode: "payment_required",
      errorMessage: "Lovable AI credits exhausted",
    };
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return {
      evaluation: null,
      model,
      errorCode: "gateway_error",
      errorMessage: `Gateway ${resp.status}: ${text.slice(0, 300)}`,
    };
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch (e) {
    return {
      evaluation: null,
      model,
      errorCode: "parse_error",
      errorMessage: e instanceof Error ? e.message : "Bad JSON",
    };
  }

  const toolCall =
    (body as { choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }> })
      .choices?.[0]?.message?.tool_calls?.[0];
  const argsStr = toolCall?.function?.arguments;
  if (!argsStr) {
    return {
      evaluation: null,
      model,
      errorCode: "parse_error",
      errorMessage: "Model returned no tool call",
    };
  }

  let parsedArgs: unknown;
  try {
    parsedArgs = JSON.parse(argsStr);
  } catch (e) {
    return {
      evaluation: null,
      model,
      errorCode: "parse_error",
      errorMessage: `Tool arg JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const validated = RiskEvaluationSchema.safeParse(parsedArgs);
  if (!validated.success) {
    return {
      evaluation: null,
      model,
      errorCode: "parse_error",
      errorMessage: validated.error.message,
    };
  }

  return { evaluation: validated.data, model };
}
