// Reporting time-series datasets.
export interface MonthlyYield {
  month: string
  yield: number
}

export const PRODUCTION_YIELD: MonthlyYield[] = [
  { month: "Jan", yield: 65 },
  { month: "Feb", yield: 80 },
  { month: "Mar", yield: 95 },
  { month: "Apr", yield: 110 },
  { month: "May", yield: 125 },
  { month: "Jun", yield: 140 },
]
