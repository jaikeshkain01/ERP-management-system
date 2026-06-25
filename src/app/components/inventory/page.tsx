import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, AlertTriangle, ArrowUpRight, DollarSign, Package, Package2, ShieldAlert, CheckCircle2 } from "lucide-react"

export default function InventoryPage() {
  const stats = [
    {
      title: "Total Inventory Value",
      value: "$45,230.00",
      description: "Based on unit purchase cost",
      icon: DollarSign,
      color: "text-primary",
    },
    {
      title: "Low Stock Items",
      value: "8",
      description: "Items approaching safety limits",
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "border-amber-500/20 bg-amber-500/5 dark:bg-amber-950/10",
    },
    {
      title: "Critical Items",
      value: "3",
      description: "Immediate restocking required",
      icon: ShieldAlert,
      color: "text-orange-500",
      bg: "border-orange-500/20 bg-orange-500/5 dark:bg-orange-950/10",
    },
    {
      title: "Out of Stock Items",
      value: "1",
      description: "Depleted inventory lines",
      icon: AlertCircle,
      color: "text-destructive",
      bg: "border-destructive/20 bg-destructive/5 dark:bg-red-950/10",
    },
  ]

  const inventoryItems = [
    { name: "LED", category: "Optoelectronics", stock: 300, bin: "Bin A-12", status: "Low" },
    { name: "Resistor", category: "Passive Components", stock: 5000, bin: "Bin B-03", status: "Healthy" },
    { name: "Capacitor", category: "Passive Components", stock: 4000, bin: "Bin B-08", status: "Healthy" },
    { name: "Audio Codec", category: "Integrated Circuits", stock: 120, bin: "Bin C-01", status: "Healthy" },
    { name: "SIM Holder", category: "Connectors", stock: 250, bin: "Bin D-05", status: "Healthy" },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>Components</span>
          <span>/</span>
          <span className="text-foreground font-medium">Inventory</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">Inventory</h1>
        <p className="text-muted-foreground">
          Track storage distribution, stock valuations, and warehouse bin logistics.
        </p>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title} className={`relative overflow-hidden transition-all duration-300 hover:shadow-md ${stat.bg || "border-border"}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground">{stat.title}</CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Inventory Stock Ledger */}
      <Card className="border border-border shadow-sm overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/20 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold">Physical Stock Ledger</CardTitle>
              <CardDescription>On-hand quantities by bin allocation</CardDescription>
            </div>
            <Package className="h-5 w-5 text-muted-foreground/60" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-foreground">
              <thead className="text-xs uppercase bg-muted/40 text-muted-foreground border-b border-border">
                <tr>
                  <th scope="col" className="px-6 py-3 font-semibold">Item</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Category</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Stock</th>
                  <th scope="col" className="px-6 py-3 font-semibold">Bin Location</th>
                  <th scope="col" className="px-6 py-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventoryItems.map((item) => {
                  const isLow = item.status === "Low"
                  return (
                    <tr key={item.name} className="hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 font-semibold flex items-center gap-2">
                        <Package2 className="h-4 w-4 text-muted-foreground" />
                        <span>{item.name}</span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{item.category}</td>
                      <td className="px-6 py-4 font-mono font-bold">{item.stock.toLocaleString()}</td>
                      <td className="px-6 py-4 font-mono text-xs">{item.bin}</td>
                      <td className="px-6 py-4 text-right">
                        {isLow ? (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive-foreground">
                            <AlertCircle className="h-3 w-3" />
                            Low
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            Healthy
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
