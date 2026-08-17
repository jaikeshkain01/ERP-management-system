"use client"

import { ArrowDownToLine, ArrowUpFromLine, History } from "lucide-react"
import { DragScrollArea } from "@/components/ui/drag-scroll-area"
import { useData } from "@/lib/data-provider"
import type { StockTransaction } from "@/lib/catalog"
import { componentTxns } from "@/lib/stock-ledger"

function formatDate(iso: string): string {
  // Accepts both "2026-06-15" seeds and full ISO timestamps.
  const d = iso.length <= 10 ? iso : iso.slice(0, 10)
  return d
}

export function TransactionHistoryTable({
  componentId,
  transactions,
}: {
  componentId: string
  transactions: StockTransaction[]
}) {
  const { getBrandName, getSupplierName } = useData()
  const rows = componentTxns(componentId, transactions).reverse() // newest first

  return (
    <div className="space-y-3">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <History className="h-3.5 w-3.5" /> Transaction History
      </h4>
      <div className="rounded-lg border border-border overflow-hidden bg-background">
        <DragScrollArea className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Date</th>
                <th className="px-3 py-2 text-left font-semibold">Type</th>
                <th className="px-3 py-2 text-left font-semibold">Manufacturer</th>
                <th className="px-3 py-2 text-left font-semibold">Lot</th>
                <th className="px-3 py-2 text-left font-semibold">Supplier</th>
                <th className="px-3 py-2 text-right font-semibold">Qty</th>
                <th className="px-3 py-2 text-right font-semibold">Balance</th>
                <th className="px-3 py-2 text-left font-semibold">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const isIn = r.direction === "in"
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{formatDate(r.date)}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isIn
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {isIn ? <ArrowDownToLine className="h-3 w-3" /> : <ArrowUpFromLine className="h-3 w-3" />}
                        {isIn ? "In" : "Out"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-semibold">{getBrandName(r.brandId)}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{r.lotNo ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.supplierId ? getSupplierName(r.supplierId) : "—"}</td>
                    <td className={`px-3 py-2 text-right font-mono font-semibold ${isIn ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {isIn ? "+" : "−"}{r.qty.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{r.balance.toLocaleString()}</td>
                    <td className="px-3 py-2 text-muted-foreground">{r.note ?? "—"}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    No movements recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </DragScrollArea>
      </div>
    </div>
  )
}
