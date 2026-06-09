import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { CheckCircle, Clock, ClipboardList, Download, User } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

export default function CountHistory() {
  const { data: sessions = [], isLoading } = trpc.counts.listSessions.useQuery();

  const [exportSessionId, setExportSessionId] = useState<number | null>(null);
  const { data: exportData } = trpc.counts.exportSession.useQuery(
    { id: exportSessionId! },
    { enabled: exportSessionId !== null }
  );

  useEffect(() => {
    if (!exportData) return;
    const blob = new Blob([exportData.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = exportData.filename;
    a.click();
    URL.revokeObjectURL(url);
    setExportSessionId(null);
    toast.success("Export downloaded");
  }, [exportData]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-serif text-foreground">Count History</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{sessions.length} sessions recorded</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl skeleton" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <ClipboardList size={48} className="mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">No count sessions yet</p>
          <Link href="/count">
            <button className="btn-big bg-primary text-primary-foreground mx-auto">
              Start First Count
            </button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="bg-card rounded-2xl border border-border p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground">
                      {session.name ?? "Inventory Count"}
                    </p>
                    <span className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1",
                      session.completedAt
                        ? "bg-accent/20 text-accent"
                        : "bg-secondary text-secondary-foreground"
                    )}>
                      {session.completedAt
                        ? <><CheckCircle size={10} /> Completed</>
                        : <><Clock size={10} /> In Progress</>
                      }
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Started: {new Date(session.createdAt).toLocaleString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "numeric", minute: "2-digit"
                    })}
                    {(session as any).creatorName && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground/70">
                        <User size={11} /> {(session as any).creatorName}
                      </span>
                    )}
                  </p>
                  {session.completedAt && (
                    <p className="text-sm text-muted-foreground">
                      Completed: {new Date(session.completedAt).toLocaleString("en-US", {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "numeric", minute: "2-digit"
                      })}
                    </p>
                  )}
                  {session.notes && (
                    <p className="text-sm text-muted-foreground mt-1 italic">{session.notes}</p>
                  )}
                </div>
                <button
                  onClick={() => setExportSessionId(session.id)}
                  disabled={exportSessionId === session.id}
                  title="Export count as CSV"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-foreground text-xs font-semibold hover:bg-secondary transition-colors active:scale-95 disabled:opacity-60"
                >
                  <Download size={13} />
                  {exportSessionId === session.id ? "Exporting…" : "Export CSV"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
