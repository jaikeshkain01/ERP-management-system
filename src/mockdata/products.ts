import type { Product } from "./types"

// Canonical products. `pcbIds` references PCBS, which in turn reference
// COMPONENTS — giving a full product → PCB → component → brand/supplier graph.
export const PRODUCTS: Product[] = [
  {
    id: "roip-400",
    name: "ROIP 400",
    code: "ROIP400",
    version: "1.0",
    description: "Radio over IP Gateway Terminal with voice capability",
    status: "Ready",
    estimatedCost: 18450,
    buildableQty: 120,
    pcbIds: ["audio-pcb", "gsm-pcb", "display-pcb", "power-pcb"],
  },
  {
    id: "voice-logger",
    name: "Voice Logger",
    code: "VLG200",
    version: "1.2",
    description: "Multi-channel voice recording and monitoring system",
    status: "Blocked",
    estimatedCost: 12800,
    buildableQty: 0,
    pcbIds: ["main-pcb", "memory-pcb", "interface-pcb"],
  },
  {
    id: "dispatcher",
    name: "Dispatcher Console",
    code: "DISP500",
    version: "1.0",
    description: "IP Dispatcher terminal with touch-screen",
    status: "Limited",
    estimatedCost: 24500,
    buildableQty: 20,
    pcbIds: ["audio-pcb", "display-pcb", "main-pcb", "power-pcb", "gsm-pcb"],
  },
]
