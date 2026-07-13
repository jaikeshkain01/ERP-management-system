import type { Product } from "./types"

// Canonical products. `pcbs[]` references PCBS with a per-unit board quantity
// (a product may need >1 of the same board), plus assembly sequence. PCBs in turn
// reference COMPONENTS — giving a full product → PCB → component → brand/supplier graph.
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
    pcbs: [
      { pcbId: "audio-pcb", qty: 1, sequence: 1 },
      { pcbId: "gsm-pcb", qty: 1, sequence: 2 },
      { pcbId: "display-pcb", qty: 1, sequence: 3 },
      { pcbId: "power-pcb", qty: 1, sequence: 4 },
    ],
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
    pcbs: [
      { pcbId: "main-pcb", qty: 1, sequence: 1 },
      { pcbId: "memory-pcb", qty: 1, sequence: 2 },
      { pcbId: "interface-pcb", qty: 1, sequence: 3 },
    ],
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
    pcbs: [
      { pcbId: "audio-pcb", qty: 1, sequence: 1 },
      { pcbId: "display-pcb", qty: 2, sequence: 2, remarks: "Dual-screen console" },
      { pcbId: "main-pcb", qty: 1, sequence: 3 },
      { pcbId: "power-pcb", qty: 1, sequence: 4 },
      { pcbId: "gsm-pcb", qty: 1, sequence: 5 },
    ],
  },
]
