import type { Pcb } from "./types"

// Canonical PCBs. Each `lines[]` entry is a BOM row: which component, how many
// per board, the board reference designators (R1-R20, C1-C10, U1…), and the
// preferred manufacturer brand for that placement. Products reference these by `id`;
// `usedIn` is derived from products via selectors.
export const PCBS: Pcb[] = [
  {
    id: "audio-pcb",
    name: "Audio PCB",
    description: "Voice and audio signal processing board",
    layers: 4,
    status: "Active",
    componentsCount: 58,
    stockCount: 120,
    lines: [
      { componentId: "audio-codec", qty: 1, refDes: "U1", preferredBrandId: "texas-instruments" },
      { componentId: "resistor-10k", qty: 20, refDes: "R1-R20", preferredBrandId: "yageo" },
      { componentId: "capacitor-100uf", qty: 10, refDes: "C1-C10", preferredBrandId: "nichicon" },
      { componentId: "led-green", qty: 4, refDes: "D1-D4", preferredBrandId: "everlight" },
      { componentId: "connector", qty: 3, refDes: "J1-J3", preferredBrandId: "amphenol", remarks: "Panel I/O headers" },
    ],
  },
  {
    id: "gsm-pcb",
    name: "GSM PCB",
    description: "Mobile network connectivity module board",
    layers: 6,
    status: "Active",
    componentsCount: 75,
    stockCount: 80,
    lines: [
      { componentId: "gsm-chip", qty: 1, refDes: "U1", preferredBrandId: "quectel" },
      { componentId: "sim-holder", qty: 1, refDes: "J1", preferredBrandId: "molex" },
      { componentId: "capacitor-10uf", qty: 15, refDes: "C1-C15", preferredBrandId: "murata" },
      { componentId: "antenna-connector", qty: 2, refDes: "J2-J3", preferredBrandId: "amphenol" },
    ],
  },
  {
    id: "display-pcb",
    name: "Display PCB",
    description: "LCD screen driver interface board",
    layers: 2,
    status: "Active",
    componentsCount: 40,
    stockCount: 150,
    lines: [
      { componentId: "display-ic", qty: 1, refDes: "U1", preferredBrandId: "sitronix" },
      { componentId: "led-backlight-driver", qty: 1, refDes: "U2", preferredBrandId: "texas-instruments" },
      { componentId: "leds", qty: 12, refDes: "D1-D12", preferredBrandId: "lite-on" },
      { componentId: "ribbon-connector", qty: 1, refDes: "J1", preferredBrandId: "amphenol" },
    ],
  },
  {
    id: "power-pcb",
    name: "Power PCB",
    description: "Voltage regulation and power distribution board",
    layers: 2,
    status: "Prototype",
    componentsCount: 32,
    stockCount: 200,
    lines: [
      { componentId: "power-ic", qty: 1, refDes: "U1", preferredBrandId: "texas-instruments" },
      { componentId: "inductor-4.7uh", qty: 3, refDes: "L1-L3", preferredBrandId: "tdk" },
      { componentId: "capacitors-22uf", qty: 8, refDes: "C1-C8", preferredBrandId: "murata" },
      { componentId: "fuse-2a", qty: 2, refDes: "F1-F2", preferredBrandId: "littelfuse", remarks: "Input protection" },
    ],
  },
  {
    id: "main-pcb",
    name: "Main PCB",
    description: "Primary controller and DSP board",
    layers: 8,
    status: "Active",
    componentsCount: 80,
    stockCount: 50,
    lines: [
      { componentId: "dsp-chip", qty: 1, refDes: "U1", preferredBrandId: "analog-devices" },
      { componentId: "microcontroller", qty: 1, refDes: "U2", preferredBrandId: "stmicroelectronics" },
      { componentId: "sram-512kb", qty: 2, refDes: "U3-U4", preferredBrandId: "infineon" },
      { componentId: "oscillator-24mhz", qty: 1, refDes: "Y1", preferredBrandId: "kyocera" },
    ],
  },
  {
    id: "memory-pcb",
    name: "Memory PCB",
    description: "Storage and flash memory expansion board",
    layers: 4,
    status: "Active",
    componentsCount: 45,
    stockCount: 90,
    lines: [
      { componentId: "flash-memory", qty: 2, refDes: "U1-U2", preferredBrandId: "winbond" },
      { componentId: "sd-card-slot", qty: 1, refDes: "J1", preferredBrandId: "molex" },
      { componentId: "resistor-10k", qty: 12, refDes: "R1-R12", preferredBrandId: "yageo" },
    ],
  },
  {
    id: "interface-pcb",
    name: "Interface PCB",
    description: "External I/O and USB interface board",
    layers: 4,
    status: "Active",
    componentsCount: 28,
    stockCount: 110,
    lines: [
      { componentId: "usb-controller", qty: 1, refDes: "U1", preferredBrandId: "ftdi" },
      { componentId: "led-green", qty: 3, refDes: "D1-D3", preferredBrandId: "everlight" },
    ],
  },
]
