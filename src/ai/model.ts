import { readFileSync } from "node:fs";

import { defaultAiPolicyWeights, type AiPolicyWeights } from "./policy.js";

export interface AiPolicyModel {
  schemaVersion: number;
  kind: "heuristic-policy-weights";
  weights: AiPolicyWeights;
  sourcePath?: string;
}

export interface ResolvedAiPolicyModel {
  label: string;
  weights: AiPolicyWeights;
  sourcePath?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readWeightContainer(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return null;
  }

  if (isRecord(raw.weights)) {
    return raw.weights;
  }

  if (isRecord(raw.best) && isRecord(raw.best.weights)) {
    return raw.best.weights;
  }

  return raw;
}

export function parseAiPolicyWeights(raw: unknown): AiPolicyWeights {
  const container = readWeightContainer(raw);

  if (!isRecord(container)) {
    throw new Error("AI policy model must contain a weights object.");
  }

  const weights = { ...defaultAiPolicyWeights };

  for (const key of Object.keys(defaultAiPolicyWeights) as (keyof AiPolicyWeights)[]) {
    const value = container[key];

    if (value === undefined) {
      continue;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`AI policy weight ${key} must be a finite number.`);
    }

    weights[key] = value;
  }

  return weights;
}

export function loadAiPolicyModel(path: string): AiPolicyModel {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const weights = parseAiPolicyWeights(parsed);

  return {
    schemaVersion: isRecord(parsed) && typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : 1,
    kind: "heuristic-policy-weights",
    weights,
    sourcePath: path,
  };
}

export function resolveAiPolicyModel(spec: string | undefined, fallbackLabel = "base"): ResolvedAiPolicyModel {
  if (!spec || spec === "base") {
    return {
      label: fallbackLabel,
      weights: defaultAiPolicyWeights,
    };
  }

  const model = loadAiPolicyModel(spec);
  return {
    label: spec,
    weights: model.weights,
    sourcePath: model.sourcePath,
  };
}
