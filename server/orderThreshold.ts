/**
 * Order thresholds are stored as a percentage of par (0–100). Older catalog
 * rows saved the default as the fractional form 0.50. Interpret that legacy
 * representation as 50%, never as 0.5%.
 */
export function normalizeOrderThresholdPercent(value: string | null | undefined): number {
  const parsed = parseFloat(value ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return 50;
  if (parsed > 0 && parsed <= 1) return parsed * 100;
  return Math.min(100, parsed);
}

export function getOrderTrigger(parLevel: number, storedThreshold: string | null | undefined) {
  const orderThresholdPercent = normalizeOrderThresholdPercent(storedThreshold);
  return {
    orderThresholdPercent,
    orderTriggerCases: parLevel * (orderThresholdPercent / 100),
    usesDefaultThreshold: !storedThreshold || parseFloat(storedThreshold) <= 0,
  };
}
