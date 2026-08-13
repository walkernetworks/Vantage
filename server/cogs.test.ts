import { calculateCogsPeriod, type CogsCountSnapshot, type CogsReceiptLine } from "./cogs";
import { describe, expect, it } from "vitest";

const openingSnapshot: CogsCountSnapshot = {
  sessionId: 1,
  completedAt: new Date("2026-08-02T18:00:00"),
  lines: [{
    itemId: 101,
    itemName: "Coffee Beans",
    vendor: "PFG",
    category: "Coffee",
    quantityCases: 10,
    price: 5,
  }],
};

const closingSnapshot: CogsCountSnapshot = {
  sessionId: 2,
  completedAt: new Date("2026-08-08T18:00:00"),
  lines: [{
    itemId: 101,
    itemName: "Coffee Beans",
    vendor: "PFG",
    category: "Coffee",
    quantityCases: 7,
    price: 5,
  }],
};

const receipts: CogsReceiptLine[] = [{
  invoiceId: 900001,
  receivedAt: new Date("2026-08-05T12:00:00"),
  itemId: 101,
  itemName: "Coffee Beans",
  vendor: "PFG",
  category: "Coffee",
  quantityCases: 2,
  unitCost: 6,
}];

describe("calculateCogsPeriod", () => {
  it("uses real count snapshots around the period and applied invoice line cost for receipts", () => {
    const result = calculateCogsPeriod(
      new Date("2026-08-03T00:00:00"),
      new Date("2026-08-09T23:59:59"),
      [openingSnapshot, closingSnapshot],
      receipts
    );

    expect(result.openingSnapshot?.sessionId).toBe(1);
    expect(result.closingSnapshot?.sessionId).toBe(2);
    expect(result.closingSnapshot?.completedAt.getDay()).toBe(6); // Saturday
    expect(result.receiptInvoiceIds).toEqual([900001]);
    expect(result.openingCost).toBe(50);
    expect(result.receiptsCost).toBe(12);
    expect(result.closingCost).toBe(35);
    expect(result.consumptionCost).toBe(27);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      openingQty: 10,
      receiptsQty: 2,
      closingQty: 7,
      consumptionQty: 5,
      consumptionCost: 27,
    });
  });

  it("does not invent a closing balance when no physical count occurred in the period", () => {
    const result = calculateCogsPeriod(
      new Date("2026-08-10T00:00:00"),
      new Date("2026-08-16T23:59:59"),
      [openingSnapshot, closingSnapshot],
      [{ ...receipts[0], receivedAt: new Date("2026-08-12T12:00:00") }]
    );

    expect(result.openingSnapshot?.sessionId).toBe(2);
    expect(result.closingSnapshot).toBeNull();
    expect(result.receiptsCost).toBe(12);
    expect(result.openingCost).toBeNull();
    expect(result.closingCost).toBeNull();
    expect(result.consumptionCost).toBeNull();
    expect(result.items).toEqual([]);
  });

  it("does not include invoice receipts outside the selected calendar period", () => {
    const result = calculateCogsPeriod(
      new Date("2026-08-03T00:00:00"),
      new Date("2026-08-09T23:59:59"),
      [openingSnapshot, closingSnapshot],
      [{ ...receipts[0], receivedAt: new Date("2026-08-10T12:00:00") }]
    );

    expect(result.receiptInvoiceIds).toEqual([]);
    expect(result.receiptsCost).toBe(0);
    expect(result.consumptionCost).toBe(15);
  });

  it("includes receipts between weekly count snapshots even when the invoice date falls just before the calendar bucket", () => {
    const result = calculateCogsPeriod(
      new Date("2026-08-03T00:00:00"),
      new Date("2026-08-09T23:59:59"),
      [openingSnapshot, closingSnapshot],
      [{ ...receipts[0], receivedAt: new Date("2026-08-02T20:00:00") }]
    );

    expect(result.receiptsCost).toBe(12);
    expect(result.receiptInvoiceIds).toEqual([900001]);
    expect(result.consumptionCost).toBe(27);
  });
});
