export const INVOICE_UPLOAD_MAX_EDGE = 2200;
export const INVOICE_UPLOAD_TARGET_BYTES = 2_500_000;

export function isSupportedInvoiceImage(file: Pick<File, "type" | "name">): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp)$/i.test(file.name);
}

export function getInvoiceUploadDimensions(width: number, height: number): { width: number; height: number } {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= INVOICE_UPLOAD_MAX_EDGE) return { width, height };
  const scale = INVOICE_UPLOAD_MAX_EDGE / longestEdge;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The image could not be compressed for upload."));
    }, "image/jpeg", quality);
  });
}

/**
 * Phone camera originals are often 8–15 MB each. Sending them as base64 can
 * exceed gateway request limits before the tRPC procedure starts. Normalize each
 * page to a legible, OCR-friendly JPEG on the device first.
 */
export async function prepareInvoiceImageForUpload(file: File): Promise<File> {
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error(`Could not open ${file.name}. Please use a clear JPEG, PNG, or HEIC photo.`));
      element.src = sourceUrl;
    });
    const dimensions = getInvoiceUploadDimensions(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this photo for upload.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);

    let blob = await canvasToJpeg(canvas, 0.88);
    if (blob.size > INVOICE_UPLOAD_TARGET_BYTES) blob = await canvasToJpeg(canvas, 0.76);
    if (blob.size > INVOICE_UPLOAD_TARGET_BYTES) blob = await canvasToJpeg(canvas, 0.64);
    const baseName = file.name.replace(/\.[^.]+$/, "") || "invoice-page";
    return new File([blob], `${baseName}.jpeg`, { type: "image/jpeg", lastModified: file.lastModified });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
