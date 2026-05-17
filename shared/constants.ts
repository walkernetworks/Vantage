export const CATEGORIES = [
  "Alcohol - 100",
  "Alcohol - 130",
  "Coffee",
  "Bakery",
  "Dairy",
  "Dry Goods",
  "Paper Goods",
  "Produce",
  "Protein",
  "Syrups",
  "Supplies",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const VENDORS = [
  "PFG",
  "Webstaurant",
  "Savannah Distributing",
  "Other",
] as const;

export type Vendor = (typeof VENDORS)[number];

export const STORAGE_AREAS = [
  "Dry Storage",
  "Walk-In",
  "Freezer",
  "Bar",
  "Other",
] as const;

export type StorageArea = (typeof STORAGE_AREAS)[number];

export const UNITS = ["Case", "Each"] as const;

export type Unit = (typeof UNITS)[number];

export const ALCOHOL_CATEGORIES = ["100", "130"] as const;
export type AlcoholCategory = (typeof ALCOHOL_CATEGORIES)[number];

export const VENDOR_COLORS: Record<string, string> = {
  PFG: "bg-ring/20 text-ring",
  Webstaurant: "bg-accent/20 text-accent",
  "Savannah Distributing": "bg-secondary text-secondary-foreground",
  Other: "bg-muted text-muted-foreground",
};

export const CATEGORY_ICONS: Record<string, string> = {
  "Alcohol - 100": "🥃",
  "Alcohol - 130": "🍷",
  Coffee: "☕",
  Bakery: "🥐",
  Dairy: "🥛",
  "Dry Goods": "📦",
  "Paper Goods": "🧻",
  Produce: "🥬",
  Protein: "🥩",
  Syrups: "🍯",
  Supplies: "🧴",
  Other: "📋",
};
