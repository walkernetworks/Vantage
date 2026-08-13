import { describe, expect, it } from "vitest";
import { getInvoiceUploadDimensions, isSupportedInvoiceImage, INVOICE_UPLOAD_MAX_EDGE } from "../client/src/lib/invoiceUpload";

describe("invoice upload preparation", () => {
  it("keeps normal invoice photos at their original dimensions", () => {
    expect(getInvoiceUploadDimensions(1800, 1200)).toEqual({ width: 1800, height: 1200 });
  });

  it("downscales oversized portrait photos while preserving their aspect ratio", () => {
    expect(getInvoiceUploadDimensions(3024, 4032)).toEqual({ width: 1650, height: INVOICE_UPLOAD_MAX_EDGE });
  });

  it("accepts browser-recognized and extension-recognized invoice image files", () => {
    expect(isSupportedInvoiceImage({ type: "image/heic", name: "page.heic" } as File)).toBe(true);
    expect(isSupportedInvoiceImage({ type: "", name: "page.HEIF" } as File)).toBe(true);
    expect(isSupportedInvoiceImage({ type: "application/pdf", name: "invoice.pdf" } as File)).toBe(false);
  });
});
