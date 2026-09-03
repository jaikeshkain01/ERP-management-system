"use client"

/**
 * /items/merger — Manual duplicate cleanup for raw items.
 *
 * BOM imports keep duplicate-creation on for rows without a Part Number.
 * That's intentional (auto-merging by name would collapse distinct mechanical
 * / packaging parts). This page surfaces likely-duplicate clusters so the
 * user can review and merge them by hand.
 *
 * A cluster is a set of raw items whose (trimmed, lower-cased) name matches.
 * The chip strip on each cluster tells you WHY the algorithm grouped them —
 * name is always there; footprint / solder / category / description show up
 * only when every member of the cluster agrees on that dimension. That way
 * a cluster tagged "Name · Footprint · Solder" is a very high-confidence
 * match, while "Name" alone is a suggestion the user should look at hard.
 */

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { extractError } from "@/lib/api-error"
import {
  ArrowLeft, Layers, AlertTriangle, CheckCircle2, Loader2, RefreshCw,
  Info, Merge, ExternalLink,
} from "lucide-react"

interface Item {
  id: string
  code: string
  name: string
  description: string | null
  categoryId: string | null
  categoryName: string | null
  footprint: string | null
  solderType: "SMD" | "DIP" | null
  createdAt: string
  variantCount: number
  bomLineCount: number
  onHand: number
}

interface Cluster {
  clusterKey: string
  items: Item[]
  sharedReasons: Array<"name" | "footprint" | "solderType" | "category" | "description">
}

interface MergeResult {
  keptId: string
  discardedId: string
  variantsMoved: number
  variantsCollapsed: number
  bomLinesRelinked: number
  bomLinesConsolidated: number
  lotsMoved: number
}

const REASON_LABEL: Record<Cluster["sharedReasons"][number], string> = {
  name: "Name",
  footprint: "Footprint",
  solderType: "Solder",
  category: "Category",
  description: "Description",
}

export default function MergerPage() {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [clusters, setClusters] = React.useState<Cluster[]>([])
  const [totalItemsScanned, setTotalItemsScanned] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" | "info" } | null>(null)
  const [busyClusterKey, setBusyClusterKey] = React.useState<string | null>(null)
  // Bulk-merge state. Non-null while a "Merge all clusters" run is in
  // flight; the report lists everything the run touched, failure lines first
  // so the operator can act on them.
  const [bulkRunning, setBulkRunning] = React.useState(false)
  const [bulkReport, setBulkReport] = React.useState<{
    processedClusters: number
    totalClusters: number
    mergedItems: number
    failedItems: Array<{ clusterKey: string; keepCode: string; discardCode: string; reason: string }>
  } | null>(null)
  // Per-cluster "keep this one" selection. Defaults to the first (oldest)
  // member when the cluster is rendered; the user can override before
  // committing.
  const [keepSelection, setKeepSelection] = React.useState<Record<string, string>>({})

  const showToast = React.useCallback((info: { message: string; type: "success" | "error" | "info" }) => {
    setToast(info)
    window.setTimeout(() => setToast(null), info.type === "error" ? 6000 : 3000)
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/items/duplicates", { cache: "no-store" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        setError(extractError(body, "Failed to load duplicate clusters").message)
        setClusters([])
        return
      }
      const data = body?.data as { clusters: Cluster[]; totalItemsScanned: number } | undefined
      setClusters(data?.clusters ?? [])
      setTotalItemsScanned(data?.totalItemsScanned ?? 0)
      // Default: keep the oldest (first) member of each cluster.
      const defaults: Record<string, string> = {}
      for (const c of data?.clusters ?? []) {
        if (c.items[0]) defaults[c.clusterKey] = c.items[0].id
      }
      setKeepSelection(defaults)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { void load() }, [load])

  // Merge one target into a kept item. Returns null on success, an error
  // message on failure — the caller decides how to surface it.
  const runOneMerge = async (keepId: string, discardId: string): Promise<string | null> => {
    try {
      const res = await fetch("/api/items/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId, discardId }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) return extractError(body, "merge failed").message
      return null
    } catch (e) {
      return e instanceof Error ? e.message : "network error"
    }
  }

  const mergeCluster = async (cluster: Cluster) => {
    const keepId = keepSelection[cluster.clusterKey]
    if (!keepId) {
      showToast({ message: "Pick which item to keep before merging.", type: "error" })
      return
    }
    const targets = cluster.items.filter((it) => it.id !== keepId)
    if (targets.length === 0) return

    setBusyClusterKey(cluster.clusterKey)
    let failed = 0
    // Serial merges. Sequential is intentional — each merge relinks BOM lines
    // and re-points variants, and two parallel merges into the same kept item
    // could race on the "does this brand already exist on keep?" check.
    for (const t of targets) {
      const err = await runOneMerge(keepId, t.id)
      if (err) failed++
    }
    setBusyClusterKey(null)
    showToast({
      message: failed === 0
        ? `Merged ${targets.length} item${targets.length === 1 ? "" : "s"} into ${cluster.items.find((it) => it.id === keepId)?.code ?? "kept"}`
        : `${targets.length - failed} merged, ${failed} failed`,
      type: failed === 0 ? "success" : "error",
    })
    void load()
  }

  // Bulk merger — walks every cluster, picking the row the user radio-selected
  // (default: oldest). Each cluster is processed in turn; failures are
  // collected into a report shown at the top of the page so the operator can
  // fix them by hand. Serial across clusters too, same rationale as single-
  // cluster merges — writes touch overlapping tables.
  const mergeAllClusters = async () => {
    if (bulkRunning || clusters.length === 0) return
    if (!confirm(`Merge every cluster automatically? ${clusters.length} clusters will be processed; the row you selected as "Keep" in each cluster stays, everything else in it will be soft-deleted and re-linked.`)) return
    setBulkRunning(true)
    setBulkReport(null)
    const failedItems: Array<{ clusterKey: string; keepCode: string; discardCode: string; reason: string }> = []
    let mergedItems = 0
    let processedClusters = 0
    for (const cluster of clusters) {
      const keepId = keepSelection[cluster.clusterKey] ?? cluster.items[0]?.id
      if (!keepId) { processedClusters++; continue }
      const keepCode = cluster.items.find((it) => it.id === keepId)?.code ?? "?"
      const targets = cluster.items.filter((it) => it.id !== keepId)
      for (const t of targets) {
        const err = await runOneMerge(keepId, t.id)
        if (err) {
          failedItems.push({ clusterKey: cluster.clusterKey, keepCode, discardCode: t.code, reason: err })
        } else {
          mergedItems++
        }
      }
      processedClusters++
    }
    setBulkRunning(false)
    setBulkReport({ processedClusters, totalClusters: clusters.length, mergedItems, failedItems })
    showToast({
      message: failedItems.length === 0
        ? `Bulk merge done — ${mergedItems} items collapsed across ${processedClusters} clusters`
        : `Bulk merge done — ${mergedItems} merged, ${failedItems.length} failed (see report below)`,
      type: failedItems.length === 0 ? "success" : "error",
    })
    void load()
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-[70] max-w-md flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg bg-background animate-in fade-in slide-in-from-bottom-5 ${
          toast.type === "success" ? "border-emerald-500/35 text-emerald-600 dark:text-emerald-400"
          : toast.type === "error" ? "border-destructive/35 text-destructive"
          : "border-primary/35 text-primary"
        }`}>
          {toast.type === "success" ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
            : toast.type === "error" ? <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
            : <Info className="h-4 w-4 mt-0.5 shrink-0 text-primary" />}
          <div className="text-sm font-semibold">{toast.message}</div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-1.5">
        <div className="text-xs text-muted-foreground font-medium">
          <Link href="/items/list" className="hover:text-foreground">Items</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground font-semibold">Merger</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Duplicate Items — Merger</h1>
        <p className="text-sm text-muted-foreground">
          BOM imports don&apos;t dedup rows without a Part Number automatically — that would collapse genuinely distinct mechanical parts. Review the clusters below and merge items you&apos;re sure are the same.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading || bulkRunning}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
        {clusters.length > 0 && (
          <Button
            size="sm"
            className="gap-1.5 font-bold"
            onClick={() => void mergeAllClusters()}
            disabled={bulkRunning || loading || busyClusterKey !== null}
          >
            {bulkRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />}
            {bulkRunning ? "Merging all…" : `Merge all ${clusters.length} clusters`}
          </Button>
        )}
        <div className="ml-auto text-xs text-muted-foreground">
          Scanned {totalItemsScanned} raw item{totalItemsScanned === 1 ? "" : "s"} · {clusters.length} cluster{clusters.length === 1 ? "" : "s"} flagged
        </div>
      </div>

      {/* Bulk-run report — shows counts and every failed pair with the reason
          the server gave, so the operator can fix them by hand. */}
      {bulkReport && (
        <Card className={`border ${bulkReport.failedItems.length > 0 ? "border-destructive/40" : "border-emerald-500/40"}`}>
          <CardHeader className={`border-b px-5 py-3 ${bulkReport.failedItems.length > 0 ? "border-destructive/40 bg-destructive/5" : "border-emerald-500/40 bg-emerald-500/5"}`}>
            <CardTitle className={`text-sm font-bold flex items-center gap-2 ${bulkReport.failedItems.length > 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
              {bulkReport.failedItems.length > 0
                ? <><AlertTriangle className="h-4 w-4" /> Bulk merge finished with {bulkReport.failedItems.length} failure{bulkReport.failedItems.length === 1 ? "" : "s"}</>
                : <><CheckCircle2 className="h-4 w-4" /> Bulk merge done cleanly</>}
              <span className="ml-auto text-xs font-medium text-muted-foreground">
                {bulkReport.processedClusters} of {bulkReport.totalClusters} clusters · {bulkReport.mergedItems} items collapsed
              </span>
              <button
                type="button"
                onClick={() => setBulkReport(null)}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                dismiss
              </button>
            </CardTitle>
          </CardHeader>
          {bulkReport.failedItems.length > 0 && (
            <CardContent className="p-0">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left font-bold">Cluster</th>
                      <th className="px-4 py-2 text-left font-bold">Kept</th>
                      <th className="px-4 py-2 text-left font-bold">Couldn&apos;t merge</th>
                      <th className="px-4 py-2 text-left font-bold">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bulkReport.failedItems.map((f, i) => (
                      <tr key={i}>
                        <td className="px-4 py-1.5 truncate max-w-[220px]">{f.clusterKey}</td>
                        <td className="px-4 py-1.5 font-mono font-bold">{f.keepCode}</td>
                        <td className="px-4 py-1.5 font-mono">{f.discardCode}</td>
                        <td className="px-4 py-1.5 text-destructive">{f.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-border bg-muted/10 px-4 py-2 text-[11px] text-muted-foreground">
                Failed pairs stay in the clusters below — resolve the reason (e.g. move stock, delete a colliding variant), then Refresh and try again.
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Body */}
      {loading ? (
        <Card><CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Scanning items…</CardContent></Card>
      ) : error ? (
        <Card>
          <CardContent className="p-6 flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>{error}</div>
          </CardContent>
        </Card>
      ) : clusters.length === 0 ? (
        <Card>
          <CardContent className="p-10 flex flex-col items-center justify-center gap-2 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            <div className="text-lg font-bold">No duplicate clusters found</div>
            <div className="text-sm text-muted-foreground max-w-md">
              Every raw item in this tenant has a unique name after trimming and lower-casing. If you&apos;re expecting duplicates, try importing your BOM first, then come back.
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {clusters.map((cluster) => {
            const isBusy = busyClusterKey === cluster.clusterKey || bulkRunning
            const keepId = keepSelection[cluster.clusterKey] ?? cluster.items[0]?.id
            const targets = cluster.items.filter((it) => it.id !== keepId)
            const totalBomLines = cluster.items.reduce((n, it) => n + it.bomLineCount, 0)
            const totalStock = cluster.items.reduce((n, it) => n + it.onHand, 0)
            return (
              <Card key={cluster.clusterKey} className="border border-border overflow-hidden">
                <CardHeader className="border-b border-border bg-muted/20 px-5 py-3">
                  <CardTitle className="text-sm font-bold flex flex-wrap items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <span className="truncate max-w-md">{cluster.items[0]?.name ?? cluster.clusterKey}</span>
                    <span className="text-muted-foreground font-normal">— {cluster.items.length} items</span>
                    <div className="flex flex-wrap gap-1">
                      {cluster.sharedReasons.map((r) => (
                        <span key={r} className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-bold">
                          {REASON_LABEL[r]}
                        </span>
                      ))}
                    </div>
                    <div className="ml-auto flex gap-2 text-[11px] font-medium text-muted-foreground">
                      {totalBomLines > 0 && <span>{totalBomLines} BOM references</span>}
                      {totalStock > 0 && <span>· {totalStock} on-hand</span>}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground uppercase text-[10px] border-b border-border">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold w-14">Keep</th>
                        <th className="px-3 py-2 text-left font-bold">Code</th>
                        <th className="px-3 py-2 text-left font-bold">Category</th>
                        <th className="px-3 py-2 text-left font-bold">Footprint · Solder</th>
                        <th className="px-3 py-2 text-left font-bold">Variants</th>
                        <th className="px-3 py-2 text-left font-bold">BOM refs</th>
                        <th className="px-3 py-2 text-left font-bold">On-hand</th>
                        <th className="px-3 py-2 text-left font-bold">Created</th>
                        <th className="px-3 py-2 text-left font-bold w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {cluster.items.map((it) => (
                        <tr key={it.id} className={it.id === keepId ? "bg-emerald-500/5" : ""}>
                          <td className="px-3 py-2">
                            <input
                              type="radio"
                              name={`keep-${cluster.clusterKey}`}
                              checked={it.id === keepId}
                              onChange={() => setKeepSelection((prev) => ({ ...prev, [cluster.clusterKey]: it.id }))}
                              className="h-4 w-4 cursor-pointer accent-emerald-500"
                              disabled={isBusy}
                              aria-label={`Keep ${it.code}`}
                            />
                          </td>
                          <td className="px-3 py-2 font-mono font-bold">{it.code}</td>
                          <td className="px-3 py-2 text-muted-foreground truncate max-w-[180px]">{it.categoryName ?? "—"}</td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">
                            {(it.footprint ?? "—") + " · " + (it.solderType ?? "—")}
                          </td>
                          <td className="px-3 py-2 font-mono">{it.variantCount}</td>
                          <td className="px-3 py-2 font-mono">{it.bomLineCount}</td>
                          <td className="px-3 py-2 font-mono">{it.onHand}</td>
                          <td className="px-3 py-2 text-muted-foreground">{it.createdAt.slice(0, 10)}</td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/items/details/${encodeURIComponent(it.id)}`}
                              className="inline-flex items-center gap-1 text-primary hover:underline font-semibold"
                              target="_blank"
                            >
                              open <ExternalLink className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-t border-border px-4 py-3 flex flex-wrap items-center gap-3 bg-muted/10">
                    <div className="text-xs text-muted-foreground">
                      {targets.length === 0
                        ? "Select an item to keep — the others will merge into it."
                        : `Merging will move BOM lines, variants, inventory and lots from ${targets.length} item${targets.length === 1 ? "" : "s"} onto the kept row, then soft-delete the merged rows.`}
                    </div>
                    <Button
                      size="sm"
                      className="ml-auto gap-1.5"
                      onClick={() => void mergeCluster(cluster)}
                      disabled={isBusy || targets.length === 0}
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Merge className="h-3.5 w-3.5" />}
                      {isBusy ? "Merging…" : `Merge ${targets.length} into kept`}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
