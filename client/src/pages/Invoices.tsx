import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
  AlertCircle,
} from "lucide-react";

interface InvoiceLine {
  id: number;
  invoiceId: number;
  itemId: number | null;
  itemNumber: string | null;
  description: string | null;
  pack: string | null;
  size: string | null;
  shippedQty: string;
  unitPrice: string | null;
  extension: string | null;
  matchStatus: "matched" | "unmatched" | "skipped";
  itemName?: string | null;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "applied") return <Badge className="bg-green-100 text-green-800 border-green-200">Applied</Badge>;
  if (status === "reviewed") return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Reviewed</Badge>;
  return <Badge variant="outline" className="text-amber-700 border-amber-300 bg-amber-50">Pending</Badge>;
}

function UploadDialog({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: (id: number) => void }) {
  const [images, setImages] = useState<Array<{ file: File; preview: string; base64: string }>>([]);
  const [vendor, setVendor] = useState("PFG");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.invoices.upload.useMutation({
    onSuccess: (data) => {
      toast.success("Invoice uploaded — running AI parse…");
      onUploaded(data.invoiceId);
      setImages([]);
    },
    onError: (e) => toast.error("Upload failed: " + e.message),
  });

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const newImages: typeof images = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = (e.target?.result as string) ?? "";
          resolve(result.split(",")[1] ?? "");
        };
        reader.readAsDataURL(file);
      });
      const preview = URL.createObjectURL(file);
      newImages.push({ file, preview, base64 });
    }
    setImages((prev) => [...prev, ...newImages]);
  }

  async function handleSubmit() {
    if (images.length === 0) { toast.error("Add at least one invoice image"); return; }
    setUploading(true);
    try {
      await uploadMutation.mutateAsync({
        vendor,
        images: images.map((img) => ({
          base64: img.base64,
          mimeType: img.file.type || "image/jpeg",
          filename: img.file.name,
        })),
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !uploading) { setImages([]); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload size={18} className="text-primary" />
            Upload Invoice
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Vendor</label>
            <Select value={vendor} onValueChange={setVendor}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PFG">Performance Food Group (PFG)</SelectItem>
                <SelectItem value="Webstaurant">Webstaurant</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div
            className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          >
            <FileText size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium text-foreground">Tap or drag to add invoice pages</p>
            <p className="text-xs text-muted-foreground mt-1">One image per page — add all pages of the same invoice</p>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </div>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.preview} alt={`Page ${i + 1}`} className="w-20 h-28 object-cover rounded-lg border border-border" />
                  <div className="absolute inset-0 bg-black/40 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={(e) => { e.stopPropagation(); setImages((prev) => prev.filter((_, j) => j !== i)); }} className="p-1 bg-destructive rounded-full text-white">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] rounded px-1">Pg {i + 1}</span>
                </div>
              ))}
              <button onClick={() => fileInputRef.current?.click()} className="w-20 h-28 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                <Plus size={20} />
                <span className="text-[10px] mt-1">Add page</span>
              </button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setImages([]); onClose(); }} disabled={uploading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={uploading || images.length === 0}>
            {uploading ? <><Spinner className="mr-2 h-4 w-4" />Uploading…</> : <><Upload size={16} className="mr-2" />Upload & Parse</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({ invoiceId, open, onClose, onApplied }: { invoiceId: number | null; open: boolean; onClose: () => void; onApplied: () => void }) {
  const utils = trpc.useUtils();
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState("");

  const { data, isLoading, refetch } = trpc.invoices.getWithLines.useQuery(
    { invoiceId: invoiceId! },
    { enabled: !!invoiceId }
  );

  const parseMutation = trpc.invoices.parse.useMutation({
    onSuccess: () => { toast.success("Invoice re-parsed successfully"); refetch(); },
    onError: (e) => toast.error("Parse failed: " + e.message),
  });

  const updateLineMutation = trpc.invoices.updateLine.useMutation({
    onSuccess: () => { refetch(); setEditingLineId(null); },
    onError: (e) => toast.error("Update failed: " + e.message),
  });

  const applyMutation = trpc.invoices.applyDelivery.useMutation({
    onSuccess: (result) => {
      toast.success(`Delivery applied — ${result.count} items added to inventory`);
      utils.invoices.list.invalidate();
      onApplied();
      onClose();
    },
    onError: (e) => toast.error("Apply failed: " + e.message),
  });

  const markReviewedMutation = trpc.invoices.markReviewed.useMutation({
    onSuccess: () => { toast.success("Invoice marked as reviewed"); refetch(); utils.invoices.list.invalidate(); },
    onError: (e) => toast.error("Failed: " + e.message),
  });

  if (!invoiceId) return null;

  const invoice = data?.invoice;
  const lines = (data?.lines ?? []) as unknown as InvoiceLine[];
  const matched = lines.filter((l) => l.matchStatus === "matched").length;
  const unmatched = lines.filter((l) => l.matchStatus === "unmatched").length;
  const skipped = lines.filter((l) => l.matchStatus === "skipped").length;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText size={18} className="text-primary" />
            {invoice ? `Invoice ${invoice.invoiceNumber ?? `#${invoice.id}`} — ${invoice.vendor}` : "Loading…"}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center py-12"><Spinner className="h-8 w-8" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 min-h-0">
            {invoice && (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-0.5">Date</p>
                  <p className="font-medium">{invoice.invoiceDate ?? "—"}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-0.5">Total</p>
                  <p className="font-medium">{invoice.totalAmount ? `$${parseFloat(String(invoice.totalAmount)).toFixed(2)}` : "—"}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3">
                  <p className="text-muted-foreground text-xs mb-0.5">Status</p>
                  <StatusBadge status={invoice.status} />
                </div>
              </div>
            )}
            {lines.length > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1 text-green-700"><CheckCircle2 size={14} />{matched} matched</span>
                <span className="flex items-center gap-1 text-amber-700"><AlertCircle size={14} />{unmatched} unmatched</span>
                {skipped > 0 && <span className="flex items-center gap-1 text-muted-foreground"><XCircle size={14} />{skipped} skipped</span>}
              </div>
            )}
            {invoice && invoice.status !== "applied" && (
              <Button variant="outline" size="sm" onClick={() => parseMutation.mutate({ invoiceId: invoice.id })} disabled={parseMutation.isPending}>
                {parseMutation.isPending ? <Spinner className="mr-2 h-3 w-3" /> : <RefreshCw size={14} className="mr-2" />}
                Re-parse with AI
              </Button>
            )}
            {lines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText size={32} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No lines parsed yet. Click "Re-parse with AI" to extract line items.</p>
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Item #</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Description</th>
                      <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Pack/Size</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Shipped</th>
                      <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Ext.</th>
                      <th className="text-center px-3 py-2 font-semibold text-muted-foreground">Match</th>
                      {invoice?.status !== "applied" && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line) => (
                      <tr key={line.id} className={line.matchStatus === "skipped" ? "opacity-40" : ""}>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{line.itemNumber ?? "—"}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-foreground">{line.itemName ?? line.description ?? "—"}</div>
                          {line.itemName && line.description && line.itemName !== line.description && (
                            <div className="text-muted-foreground text-[10px]">{line.description}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{[line.pack, line.size].filter(Boolean).join(" / ") || "—"}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {editingLineId === line.id ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Input value={editQty} onChange={(e) => setEditQty(e.target.value)} className="w-16 h-6 text-xs text-right" autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") { const qty = parseFloat(editQty); if (!isNaN(qty)) updateLineMutation.mutate({ lineId: line.id, shippedQty: qty }); }
                                  if (e.key === "Escape") setEditingLineId(null);
                                }} />
                              <button onClick={() => { const qty = parseFloat(editQty); if (!isNaN(qty)) updateLineMutation.mutate({ lineId: line.id, shippedQty: qty }); }} className="text-primary"><CheckCircle2 size={14} /></button>
                            </div>
                          ) : (
                            <button onClick={() => { setEditingLineId(line.id); setEditQty(line.shippedQty); }} className="hover:text-primary transition-colors" disabled={invoice?.status === "applied"}>
                              {parseFloat(line.shippedQty)}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{line.extension ? `$${parseFloat(line.extension).toFixed(2)}` : "—"}</td>
                        <td className="px-3 py-2 text-center">
                          {line.matchStatus === "matched" && <CheckCircle2 size={14} className="text-green-600 mx-auto" />}
                          {line.matchStatus === "unmatched" && <AlertCircle size={14} className="text-amber-500 mx-auto" />}
                          {line.matchStatus === "skipped" && <XCircle size={14} className="text-muted-foreground mx-auto" />}
                        </td>
                        {invoice?.status !== "applied" && (
                          <td className="px-3 py-2 text-center">
                            {line.matchStatus !== "skipped" ? (
                              <button onClick={() => updateLineMutation.mutate({ lineId: line.id, matchStatus: "skipped" })} className="text-muted-foreground hover:text-destructive transition-colors" title="Skip this line"><XCircle size={14} /></button>
                            ) : (
                              <button onClick={() => updateLineMutation.mutate({ lineId: line.id, matchStatus: line.itemId ? "matched" : "unmatched" })} className="text-muted-foreground hover:text-primary transition-colors" title="Restore this line"><RefreshCw size={14} /></button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {invoice?.status === "pending" && lines.length > 0 && (
            <Button variant="outline" onClick={() => markReviewedMutation.mutate({ invoiceId: invoice.id })} disabled={markReviewedMutation.isPending}>Mark Reviewed</Button>
          )}
          {invoice?.status !== "applied" && matched > 0 && (
            <Button onClick={() => applyMutation.mutate({ invoiceId: invoice!.id })} disabled={applyMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white">
              {applyMutation.isPending ? <><Spinner className="mr-2 h-4 w-4" />Applying…</> : <><CheckCircle2 size={16} className="mr-2" />Apply {matched} Matched Items</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Invoices() {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewInvoiceId, setReviewInvoiceId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: invoiceList, isLoading } = trpc.invoices.list.useQuery();

  const parseMutation = trpc.invoices.parse.useMutation({
    onSuccess: (result, vars) => {
      toast.success(`Parsed ${result.lineCount} line items`);
      utils.invoices.list.invalidate();
      setReviewInvoiceId(vars.invoiceId);
    },
    onError: (e) => toast.error("Parse failed: " + e.message),
  });

  const deleteMutation = trpc.invoices.deleteInvoice.useMutation({
    onSuccess: () => { toast.success("Invoice deleted"); utils.invoices.list.invalidate(); },
    onError: (e) => toast.error("Delete failed: " + e.message),
  });

  function handleUploaded(invoiceId: number) {
    setUploadOpen(false);
    utils.invoices.list.invalidate();
    parseMutation.mutate({ invoiceId });
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Upload delivery invoices — AI extracts line items and updates inventory</p>
        </div>
        <Button onClick={() => setUploadOpen(true)}>
          <Upload size={16} className="mr-2" />
          Upload Invoice
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><Spinner className="h-8 w-8" /></div>
      ) : !invoiceList || invoiceList.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText size={40} className="mx-auto text-muted-foreground mb-3 opacity-40" />
            <p className="font-medium text-foreground">No invoices yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Upload your first PFG or vendor invoice to get started</p>
            <Button onClick={() => setUploadOpen(true)}><Upload size={16} className="mr-2" />Upload Invoice</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoiceList.map((inv) => (
            <Card key={inv.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setReviewInvoiceId(inv.id)}>
              <CardContent className="py-4 px-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <FileText size={20} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{inv.invoiceNumber ? `Invoice ${inv.invoiceNumber}` : `Invoice #${inv.id}`}</span>
                      <span className="text-muted-foreground text-sm">— {inv.vendor}</span>
                      <StatusBadge status={inv.status} />
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{inv.invoiceDate ?? new Date(inv.createdAt).toLocaleDateString()}</span>
                      {inv.totalAmount && <span>${parseFloat(String(inv.totalAmount)).toFixed(2)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {inv.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); parseMutation.mutate({ invoiceId: inv.id }); }} disabled={parseMutation.isPending && parseMutation.variables?.invoiceId === inv.id}>
                        {parseMutation.isPending && parseMutation.variables?.invoiceId === inv.id ? <Spinner className="h-3 w-3" /> : <RefreshCw size={14} className="mr-1" />}
                        Parse
                      </Button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this invoice?")) deleteMutation.mutate({ invoiceId: inv.id }); }} className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-muted">
                      <Trash2 size={16} />
                    </button>
                    <ChevronRight size={18} className="text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} />
      <ReviewDialog invoiceId={reviewInvoiceId} open={!!reviewInvoiceId} onClose={() => setReviewInvoiceId(null)} onApplied={() => utils.invoices.list.invalidate()} />
    </div>
  );
}
