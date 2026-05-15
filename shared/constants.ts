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

export const UNITS = [
  "CS",
  "EACH",
  "LB",
  "OZ",
  "GAL",
  "BTL",
  "BAG",
  "BOX",
  "PKG",
] as const;

export type Unit = (typeof UNITS)[number];

export const ALCOHOL_CATEGORIES = ["100", "130"] as const;
export type AlcoholCategory = (typeof ALCOHOL_CATEGORIES)[number];

export const VENDOR_COLORS: Record<string, string> = {
  PFG: "bg-blue-100 text-blue-800",
  Webstaurant: "bg-purple-100 text-purple-800",
  "Savannah Distributing": "bg-amber-100 text-amber-800",
  Other: "bg-gray-100 text-gray-700",
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
