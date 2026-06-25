import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Cpu, Filter, Nut, Plus, Search, Layers, ArrowRight } from "lucide-react"

export default function PCBListPage() {
  const pcbs = [
    {
      id: "audio-pcb",
      name: "Audio PCB",
      description: "Voice and audio signal processing board",
      componentsCount: 58,
      usedIn: ["ROIP400", "Voice Logger"],
    },
    {
      id: "gsm-pcb",
      name: "GSM PCB",
      description: "Mobile network connectivity module board",
      componentsCount: 75,
      usedIn: ["ROIP400"],
    },
    {
      id: "display-pcb",
      name: "Display PCB",
      description: "LCD screen driver interface board",
      componentsCount: 40,
      usedIn: ["ROIP400"],
    },
    {
      id: "power-pcb",
      name: "Power PCB",
      description: "Voltage regulation and power distribution board",
      componentsCount: 32,
      usedIn: ["ROIP400"],
    },
    {
      id: "main-pcb",
      name: "Main PCB",
      description: "Primary controller and DSP board",
      componentsCount: 80,
      usedIn: ["Voice Logger"],
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="text-sm text-muted-foreground flex items-center gap-2">
          <span>PCB Management</span>
          <span>/</span>
          <span className="text-foreground font-medium">PCB List</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight">PCB List</h1>
        <p className="text-muted-foreground">
          Manage circuit board schematics, layer designs, and fabrication properties.
        </p>
      </div>

      {/* Top Controls: Search, Filter, Add */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-muted/20 border border-border p-4 rounded-xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            placeholder="Search PCBs..." 
            className="pl-9 bg-background border-border"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2 border-border">
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </Button>
          <Button className="gap-2 font-semibold">
            <Plus className="h-4 w-4" />
            <span>Add PCB</span>
          </Button>
        </div>
      </div>

      {/* PCB Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {pcbs.map((pcb) => (
          <Card key={pcb.id} className="flex flex-col transition-all duration-300 hover:shadow-lg hover:border-primary/20 group">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg font-bold group-hover:text-primary transition-colors">
                    {pcb.name}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5 line-clamp-1">
                    {pcb.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex-1 py-4 border-t border-b border-border/50 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Nut className="h-4 w-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground leading-none">Components</span>
                  <span className="text-sm font-semibold mt-0.5">{pcb.componentsCount}</span>
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Used In:</span>
                <div className="flex flex-wrap gap-1.5">
                  {pcb.usedIn.map((product) => (
                    <span 
                      key={product} 
                      className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground border border-border"
                    >
                      <Layers className="mr-1 h-3 w-3 text-muted-foreground" />
                      {product}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-4">
              <Button
                render={<Link href={`/pcb-management/structure?pcb=${pcb.id}`} />}
                className="w-full font-semibold group/btn"
                variant="secondary"
              >
                <span>View Components</span>
                <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
