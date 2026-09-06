export const MATERIAL_DECREASE_RATIO = 0.5;
export const MINIMUM_PRIOR_QUANTITY = 2;

export type CountComparison = {
  itemId: number;
  itemName: string;
  previousQuantity: number;
  currentQuantity: number;
  unitLabel: string;
};

export type CountAnomaly = CountComparison & {
  direction: "increase" | "decrease";
  changePercent: number;
  difference: number;
};

/**
 * Flags material increases or decreases, while avoiding noise from very small prior counts.
 * Example: 24 to 2 and 12 to 20 are anomalies; 1 to 0 and 12 to 15 are not.
 */
export function detectCountAnomalies(comparisons: CountComparison[]): CountAnomaly[] {
  return comparisons
    .filter((comparison) => {
      if (comparison.previousQuantity < MINIMUM_PRIOR_QUANTITY) return false;
      const changeRatio = Math.abs(comparison.currentQuantity - comparison.previousQuantity) / comparison.previousQuantity;
      return changeRatio >= MATERIAL_DECREASE_RATIO;
    })
    .map((comparison) => ({
      ...comparison,
      direction: (comparison.currentQuantity >= comparison.previousQuantity ? "increase" : "decrease") as "increase" | "decrease",
      difference: Math.abs(comparison.previousQuantity - comparison.currentQuantity),
      changePercent: Math.round(
        (Math.abs(comparison.currentQuantity - comparison.previousQuantity) / comparison.previousQuantity) * 100
      ),
    }))
    .sort((a, b) => b.changePercent - a.changePercent || a.itemName.localeCompare(b.itemName));
}
