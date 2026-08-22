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
  decreasePercent: number;
  difference: number;
};

/**
 * Flags material decreases, while avoiding noise from very small prior counts.
 * Example: 24 to 2 is an anomaly; 1 to 0 is not.
 */
export function detectCountAnomalies(comparisons: CountComparison[]): CountAnomaly[] {
  return comparisons
    .filter((comparison) => {
      if (comparison.previousQuantity < MINIMUM_PRIOR_QUANTITY) return false;
      if (comparison.currentQuantity >= comparison.previousQuantity) return false;
      return comparison.currentQuantity <= comparison.previousQuantity * MATERIAL_DECREASE_RATIO;
    })
    .map((comparison) => ({
      ...comparison,
      difference: comparison.previousQuantity - comparison.currentQuantity,
      decreasePercent: Math.round(
        ((comparison.previousQuantity - comparison.currentQuantity) / comparison.previousQuantity) * 100
      ),
    }))
    .sort((a, b) => b.decreasePercent - a.decreasePercent || a.itemName.localeCompare(b.itemName));
}
