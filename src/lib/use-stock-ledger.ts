"use client"

import * as React from "react"
import type { StockTransaction } from "@/mockdata/types"
import { buildSeedTransactions, STOCK_TX_STORAGE_KEY } from "@/mockdata/transactions"
import { makeTransaction, type NewTransactionInput } from "@/lib/stock-ledger"

type StockLedger = {
  transactions: StockTransaction[]
  addTransaction: (input: NewTransactionInput) => void
  hydrated: boolean
}

/**
 * Client hook backing the inventory ledger. SSR/first render use the
 * deterministic seed (no hydration mismatch); localStorage is applied on mount,
 * and every add is written through immediately.
 */
export function useStockLedger(): StockLedger {
  const [transactions, setTransactions] = React.useState<StockTransaction[]>(() =>
    buildSeedTransactions(),
  )
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    if (typeof window === "undefined") return
    const saved = localStorage.getItem(STOCK_TX_STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as StockTransaction[]
        if (Array.isArray(parsed)) setTransactions(parsed)
      } catch {
        // ignore corrupt state, keep seed
      }
    } else {
      localStorage.setItem(STOCK_TX_STORAGE_KEY, JSON.stringify(buildSeedTransactions()))
    }
    setHydrated(true)
  }, [])

  const addTransaction = React.useCallback((input: NewTransactionInput) => {
    setTransactions((prev) => {
      const next = [...prev, makeTransaction(input)]
      if (typeof window !== "undefined") {
        localStorage.setItem(STOCK_TX_STORAGE_KEY, JSON.stringify(next))
      }
      return next
    })
  }, [])

  return { transactions, addTransaction, hydrated }
}
