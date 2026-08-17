import type { Component } from "./types"

// Canonical component catalog — the hub entity. PCBs, products, brands,
// suppliers, purchase and production records all reference these by `id`.
//
// NOTE: the `stock` written on each record below is authored per brand variant
// only. Component-level `stock` is DERIVED (see COMPONENTS export at the bottom)
// as the sum of `brandVariants[].stock` — a single source of truth, mirroring the
// backend Inventory design (docs/ARCHITECTURE.md §7a). Never edit a component's
// top-level stock directly; adjust the brand variants.
const COMPONENT_CATALOG: Omit<Component, "categoryId" | "categoryPath" | "itemType">[] = [
  {
    id: "resistor-10k",
    genericPN: "RES-10K",
    name: "Resistor 10K",
    category: "Passive",
    description: "10k Ohm thick-film chip resistor, 1/10W, 1% tolerance, 0603 package.",
    stock: 15000, minStock: 5000, reorderQty: 10000, unit: "PCS", bin: "A-12", lastCount: "2026-06-15",
    solderType: "SMD", footprint: "R0603", spq: 5000, annualConsumption: 52000,
    specs: [
      { key: "Tolerance", value: "±1%" },
      { key: "Power Rating", value: "0.10W" },
      { key: "Voltage", value: "50V" },
    ],
    brandVariants: [
      { brandId: "yageo", partNo: "RC0603JR-0710KL", stock: 6000 },
      { brandId: "vishay", partNo: "CRCW060310K0", stock: 5000 },
      { brandId: "panasonic", partNo: "ERJ-3EKF1002V", stock: 4000 },
    ],
    offers: [
      { supplierId: "abc-electronics", brandId: "yageo", price: 0.8, leadTimeDays: 3 },
      { supplierId: "xyz-components", brandId: "yageo", price: 0.82, leadTimeDays: 2 },
      { supplierId: "mouser", brandId: "vishay", price: 0.95, leadTimeDays: 2 },
      { supplierId: "arrow", brandId: "panasonic", price: 1.1, leadTimeDays: 4 },
    ],
  },
  {
    id: "capacitor-100uf",
    genericPN: "CAP-100UF",
    name: "Capacitor 100uF",
    category: "Passive",
    description: "100uF aluminum electrolytic capacitor, 25V, radial lead, 20% tolerance.",
    stock: 8000, minStock: 1000, reorderQty: 5000, unit: "PCS", bin: "A-14", lastCount: "2026-06-15",
    solderType: "DIP", footprint: "Radial 6.3x11mm", spq: 500, annualConsumption: 21000,
    specs: [
      { key: "Tolerance", value: "±20%" },
      { key: "Voltage", value: "25V" },
      { key: "Temp Range", value: "-40~105°C" },
    ],
    brandVariants: [
      { brandId: "nichicon", partNo: "UVR1E101MED", stock: 4000 },
      { brandId: "rubycon", partNo: "25YXG100M", stock: 2500 },
      { brandId: "panasonic", partNo: "EEU-FR1E101", stock: 1500 },
    ],
    offers: [
      { supplierId: "powertech", brandId: "nichicon", price: 1.5, leadTimeDays: 2 },
      { supplierId: "xyz-components", brandId: "rubycon", price: 1.4, leadTimeDays: 4 },
      { supplierId: "abc-electronics", brandId: "nichicon", price: 1.65, leadTimeDays: 3 },
    ],
  },
  {
    id: "capacitor-10uf",
    genericPN: "CAP-10UF",
    name: "Capacitor 10uF",
    category: "Passive",
    description: "10uF ceramic multilayer capacitor, 50V, X7R dielectric, 0805 SMD.",
    stock: 12000, minStock: 2000, reorderQty: 5000, unit: "PCS", bin: "A-15", lastCount: "2026-06-14",
    solderType: "SMD", footprint: "C0805", spq: 4000, annualConsumption: 33000,
    specs: [
      { key: "Tolerance", value: "±10%" },
      { key: "Voltage", value: "50V" },
      { key: "Dielectric", value: "X7R" },
    ],
    brandVariants: [
      { brandId: "murata", partNo: "GRM21BR61H106KE43L", stock: 7000 },
      { brandId: "panasonic", partNo: "ECA-1HM100", stock: 5000 },
    ],
    offers: [
      { supplierId: "abc-electronics", brandId: "murata", price: 0.6, leadTimeDays: 2 },
      { supplierId: "powertech", brandId: "murata", price: 0.65, leadTimeDays: 1 },
    ],
  },
  {
    id: "capacitors-22uf",
    genericPN: "CAP-22UF",
    name: "Capacitors 22uF",
    category: "Passive",
    description: "22uF ceramic capacitor, 16V, X5R dielectric, 1206 package.",
    stock: 9500, minStock: 2000, reorderQty: 5000, unit: "PCS", bin: "A-16", lastCount: "2026-06-14",
    solderType: "SMD", footprint: "C1206", spq: 3000, annualConsumption: 18000,
    specs: [
      { key: "Tolerance", value: "±20%" },
      { key: "Voltage", value: "16V" },
      { key: "Dielectric", value: "X5R" },
    ],
    brandVariants: [
      { brandId: "murata", partNo: "GRM31CR61C226ME15L", stock: 5500 },
      { brandId: "panasonic", partNo: "ECJ-3YB1C226M", stock: 4000 },
    ],
    offers: [
      { supplierId: "powertech", brandId: "murata", price: 1.1, leadTimeDays: 2 },
      { supplierId: "abc-electronics", brandId: "murata", price: 1.15, leadTimeDays: 3 },
    ],
  },
  {
    id: "led-green",
    genericPN: "LED-GRN",
    name: "LED Green",
    category: "Optoelectronics",
    description: "5mm green LED light emitting diode, through-hole, 2.1V forward voltage.",
    stock: 500, minStock: 1000, reorderQty: 2000, unit: "PCS", bin: "B-02", lastCount: "2026-06-12",
    solderType: "DIP", footprint: "5mm Radial", spq: 1000, annualConsumption: 14000,
    specs: [
      { key: "Color", value: "Green" },
      { key: "Forward Voltage", value: "2.1V" },
      { key: "Luminous Intensity", value: "120mcd" },
    ],
    brandVariants: [
      { brandId: "everlight", partNo: "EL-513GD", stock: 300 },
      { brandId: "lite-on", partNo: "LTL-4231N", stock: 200 },
    ],
    offers: [
      { supplierId: "led-depot", brandId: "everlight", price: 2.2, leadTimeDays: 2 },
      { supplierId: "xyz-components", brandId: "lite-on", price: 2.1, leadTimeDays: 4 },
      { supplierId: "abc-electronics", brandId: "everlight", price: 2.4, leadTimeDays: 3 },
    ],
  },
  {
    id: "leds",
    genericPN: "LED-SMD",
    name: "LEDs",
    category: "Optoelectronics",
    description: "Surface-mount white LED for LCD backlight array, 3528 package.",
    stock: 6000, minStock: 1500, reorderQty: 3000, unit: "PCS", bin: "B-03", lastCount: "2026-06-12",
    solderType: "SMD", footprint: "3528", spq: 2000, annualConsumption: 26000,
    specs: [
      { key: "Color", value: "White" },
      { key: "Forward Voltage", value: "3.0V" },
      { key: "Package", value: "3528" },
    ],
    brandVariants: [
      { brandId: "lite-on", partNo: "LTW-3528", stock: 3500 },
      { brandId: "everlight", partNo: "45-21UWC", stock: 2500 },
    ],
    offers: [
      { supplierId: "led-depot", brandId: "lite-on", price: 1.8, leadTimeDays: 2 },
      { supplierId: "xyz-components", brandId: "everlight", price: 1.95, leadTimeDays: 3 },
    ],
  },
  {
    id: "audio-codec",
    genericPN: "AUD-CDC",
    name: "Audio Codec",
    category: "IC",
    description: "Low-power stereo audio codec with integrated headphone amplifier and programmable PGA.",
    stock: 120, minStock: 50, reorderQty: 200, unit: "PCS", bin: "C-01", lastCount: "2026-06-10",
    solderType: "SMD", footprint: "QFN-32", spq: 1000, annualConsumption: 1800,
    specs: [
      { key: "Type", value: "Stereo Audio Codec" },
      { key: "Interface", value: "I2C, I2S" },
      { key: "Resolution", value: "24-bit" },
    ],
    brandVariants: [
      { brandId: "texas-instruments", partNo: "TLV320AIC3104IRHBR", stock: 120 },
    ],
    offers: [
      { supplierId: "abc-electronics", brandId: "texas-instruments", price: 125.0, leadTimeDays: 3 },
      { supplierId: "semiconductors-corp", brandId: "texas-instruments", price: 130.0, leadTimeDays: 5 },
    ],
  },
  {
    id: "gsm-chip",
    genericPN: "GSM-CHP",
    name: "GSM Chip",
    category: "IC",
    description: "Quad-band GSM/GPRS engine module supporting cellular connectivity.",
    stock: 85, minStock: 20, reorderQty: 100, unit: "PCS", bin: "C-02", lastCount: "2026-06-10",
    solderType: "SMD", footprint: "LGA-68", spq: 250, annualConsumption: 900,
    specs: [
      { key: "Technology", value: "Quad-band GSM/GPRS" },
      { key: "Voltage Range", value: "3.3V - 4.6V" },
      { key: "Dimension", value: "18.7 x 16.0 mm" },
    ],
    brandVariants: [
      { brandId: "quectel", partNo: "MC60", stock: 85 },
    ],
    offers: [
      { supplierId: "xyz-components", brandId: "quectel", price: 375.0, leadTimeDays: 4 },
    ],
  },
  {
    id: "sim-holder",
    genericPN: "SIM-HLD",
    name: "SIM Holder",
    category: "Connector",
    description: "6-pin push-push micro SIM card holder connector.",
    stock: 300, minStock: 100, reorderQty: 250, unit: "PCS", bin: "D-01", lastCount: "2026-06-11",
    solderType: "SMD", footprint: "SIM-6P", spq: 500, annualConsumption: 1100,
    specs: [
      { key: "Type", value: "Push-Push" },
      { key: "Pins", value: "6" },
      { key: "Card", value: "Micro SIM" },
    ],
    brandVariants: [
      { brandId: "molex", partNo: "78646-0001", stock: 300 },
    ],
    offers: [
      { supplierId: "xyz-components", brandId: "molex", price: 15.0, leadTimeDays: 4 },
    ],
  },
  {
    id: "antenna-connector",
    genericPN: "ANT-SMA",
    name: "Antenna Connector",
    category: "RF",
    description: "SMA female bulkhead antenna connector, 50 ohm impedance, gold-plated.",
    stock: 450, minStock: 100, reorderQty: 250, unit: "PCS", bin: "D-02", lastCount: "2026-06-11",
    solderType: "DIP", footprint: "SMA-TH", spq: 200, annualConsumption: 1600,
    specs: [
      { key: "Impedance", value: "50 Ohm" },
      { key: "Plating", value: "Gold" },
      { key: "Mount", value: "Bulkhead" },
    ],
    brandVariants: [
      { brandId: "amphenol", partNo: "SMA-J-P-H-ST-EM1", stock: 450 },
    ],
    offers: [
      { supplierId: "xyz-components", brandId: "amphenol", price: 22.0, leadTimeDays: 3 },
    ],
  },
  {
    id: "connector",
    genericPN: "CON-HDR",
    name: "Connector",
    category: "Connector",
    description: "PCB-mount multi-pin I/O header connector, gold-plated contacts, 2.54mm pitch.",
    stock: 3200, minStock: 500, reorderQty: 1000, unit: "PCS", bin: "D-03", lastCount: "2026-06-11",
    solderType: "DIP", footprint: "Header 2.54mm", spq: 250, annualConsumption: 5400,
    specs: [
      { key: "Pitch", value: "2.54mm" },
      { key: "Plating", value: "Gold" },
      { key: "Rows", value: "Dual" },
    ],
    brandVariants: [
      { brandId: "amphenol", partNo: "10118192-0001LF", stock: 1800 },
      { brandId: "molex", partNo: "22-28-4360", stock: 1400 },
    ],
    offers: [
      { supplierId: "xyz-components", brandId: "amphenol", price: 18.0, leadTimeDays: 3 },
      { supplierId: "delta-components", brandId: "amphenol", price: 19.5, leadTimeDays: 4 },
    ],
  },
  {
    id: "display-ic",
    genericPN: "DISP-IC",
    name: "Display IC",
    category: "IC",
    description: "TFT-LCD graphic driver IC with integrated RAM and power circuits.",
    stock: 250, minStock: 50, reorderQty: 200, unit: "PCS", bin: "C-03", lastCount: "2026-06-10",
    solderType: "SMD", footprint: "QFN-48", spq: 1000, annualConsumption: 1400,
    specs: [
      { key: "Type", value: "TFT-LCD Driver" },
      { key: "Interface", value: "SPI / RGB" },
      { key: "Resolution", value: "240x320" },
    ],
    brandVariants: [
      { brandId: "sitronix", partNo: "ST7789V", stock: 250 },
    ],
    offers: [
      { supplierId: "semiconductors-corp", brandId: "sitronix", price: 85.0, leadTimeDays: 5 },
    ],
  },
  {
    id: "led-backlight-driver",
    genericPN: "LED-DRV",
    name: "LED Backlight Driver",
    category: "IC",
    description: "High-efficiency LED backlight driver IC with dimming control capability.",
    stock: 200, minStock: 40, reorderQty: 150, unit: "PCS", bin: "C-04", lastCount: "2026-06-10",
    solderType: "SMD", footprint: "SOT-23-6", spq: 1000, annualConsumption: 1300,
    specs: [
      { key: "Type", value: "Boost LED Driver" },
      { key: "Dimming", value: "PWM" },
      { key: "Channels", value: "1" },
    ],
    brandVariants: [
      { brandId: "texas-instruments", partNo: "TPS61165DRVR", stock: 200 },
    ],
    offers: [
      { supplierId: "abc-electronics", brandId: "texas-instruments", price: 42.0, leadTimeDays: 3 },
    ],
  },
  {
    id: "ribbon-connector",
    genericPN: "CON-FPC",
    name: "Ribbon Connector",
    category: "Connector",
    description: "40-pin ZIF FPC/FFC ribbon cable connector for LCD display interface.",
    stock: 800, minStock: 200, reorderQty: 500, unit: "PCS", bin: "D-04", lastCount: "2026-06-11",
    solderType: "SMD", footprint: "FPC-40P", spq: 500, annualConsumption: 1500,
    specs: [
      { key: "Pins", value: "40" },
      { key: "Pitch", value: "0.5mm" },
      { key: "Type", value: "ZIF" },
    ],
    brandVariants: [
      { brandId: "amphenol", partNo: "FH12-40S-0.5SH", stock: 800 },
    ],
    offers: [
      { supplierId: "delta-components", brandId: "amphenol", price: 12.0, leadTimeDays: 4 },
    ],
  },
  {
    id: "power-ic",
    genericPN: "PWR-IC",
    name: "Power IC",
    category: "IC",
    description: "Multi-output DC-DC switching regulator with integrated MOSFETs.",
    stock: 180, minStock: 40, reorderQty: 150, unit: "PCS", bin: "C-05", lastCount: "2026-06-10",
    solderType: "SMD", footprint: "HSOP-8", spq: 1000, annualConsumption: 1200,
    specs: [
      { key: "Topology", value: "Buck" },
      { key: "Output", value: "Adjustable" },
      { key: "Current", value: "3.5A" },
    ],
    brandVariants: [
      { brandId: "texas-instruments", partNo: "TPS54360DDAR", stock: 180 },
    ],
    offers: [
      { supplierId: "abc-electronics", brandId: "texas-instruments", price: 95.0, leadTimeDays: 3 },
      { supplierId: "semiconductors-corp", brandId: "texas-instruments", price: 98.0, leadTimeDays: 5 },
    ],
  },
  {
    id: "inductor-4.7uh",
    genericPN: "IND-4U7",
    name: "Inductor 4.7uH",
    category: "Passive",
    description: "4.7uH shielded power inductor, 3A saturation current, SMD 6x6mm.",
    stock: 4500, minStock: 1000, reorderQty: 2000, unit: "PCS", bin: "A-20", lastCount: "2026-06-14",
    solderType: "SMD", footprint: "6x6mm", spq: 1000, annualConsumption: 9000,
    specs: [
      { key: "Inductance", value: "4.7uH" },
      { key: "Saturation", value: "3A" },
      { key: "DCR", value: "6.8mOhm" },
    ],
    brandVariants: [
      { brandId: "tdk", partNo: "SPM6530T-4R7M", stock: 4500 },
    ],
    offers: [
      { supplierId: "abc-electronics", brandId: "tdk", price: 3.2, leadTimeDays: 3 },
    ],
  },
  {
    id: "fuse-2a",
    genericPN: "FUSE-2A",
    name: "Fuse 2A",
    category: "Protection",
    description: "2A fast-blow SMD fuse, 32V rating, 1206 package size.",
    stock: 2200, minStock: 500, reorderQty: 2000, unit: "PCS", bin: "E-01", lastCount: "2026-06-13",
    solderType: "SMD", footprint: "C1206", spq: 2000, annualConsumption: 4200,
    specs: [
      { key: "Current", value: "2A" },
      { key: "Voltage", value: "32V" },
      { key: "Type", value: "Fast-blow" },
    ],
    brandVariants: [
      { brandId: "littelfuse", partNo: "0467002.NR", stock: 2200 },
    ],
    offers: [
      { supplierId: "xyz-components", brandId: "littelfuse", price: 5.5, leadTimeDays: 3 },
    ],
  },
  {
    id: "dsp-chip",
    genericPN: "DSP-CHP",
    name: "DSP Chip",
    category: "IC",
    description: "High-performance floating-point DSP with dual MAC units and on-chip memory.",
    stock: 60, minStock: 15, reorderQty: 100, unit: "PCS", bin: "C-06", lastCount: "2026-06-09",
    solderType: "SMD", footprint: "LQFP-176", spq: 500, annualConsumption: 700,
    specs: [
      { key: "Core", value: "SHARC" },
      { key: "Frequency", value: "400MHz" },
      { key: "Memory", value: "5Mb on-chip" },
    ],
    brandVariants: [
      { brandId: "analog-devices", partNo: "ADSP-21489KSWZ-4B", stock: 60 },
    ],
    offers: [
      { supplierId: "semiconductors-corp", brandId: "analog-devices", price: 450.0, leadTimeDays: 7 },
      { supplierId: "mouser", brandId: "analog-devices", price: 455.0, leadTimeDays: 5 },
    ],
  },
  {
    id: "microcontroller",
    genericPN: "MCU-STM32",
    name: "Microcontroller",
    category: "MCU",
    description: "ARM Cortex-M4 MCU with 1MB flash, 192KB SRAM, hardware FPU, 100MHz.",
    stock: 95, minStock: 20, reorderQty: 100, unit: "PCS", bin: "C-07", lastCount: "2026-06-09",
    solderType: "SMD", footprint: "LQFP-100", spq: 250, annualConsumption: 1400,
    specs: [
      { key: "Core", value: "ARM Cortex-M4" },
      { key: "Frequency", value: "100MHz" },
      { key: "Flash Memory", value: "1MB" },
    ],
    brandVariants: [
      { brandId: "stmicroelectronics", partNo: "STM32F407VGT6", stock: 60 },
      { brandId: "gigadevice", partNo: "GD32F407VGT6", stock: 35 },
    ],
    offers: [
      { supplierId: "semiconductors-corp", brandId: "stmicroelectronics", price: 280.0, leadTimeDays: 5 },
      { supplierId: "abc-electronics", brandId: "stmicroelectronics", price: 285.0, leadTimeDays: 4 },
      { supplierId: "xyz-components", brandId: "gigadevice", price: 250.0, leadTimeDays: 4 },
    ],
  },
  {
    id: "sram-512kb",
    genericPN: "SRAM-512K",
    name: "SRAM 512KB",
    category: "Memory",
    description: "512KB asynchronous SRAM, 10ns access time, 3.3V, 44-pin TSOP.",
    stock: 140, minStock: 30, reorderQty: 100, unit: "PCS", bin: "C-08", lastCount: "2026-06-09",
    solderType: "SMD", footprint: "TSOP-44", spq: 500, annualConsumption: 900,
    specs: [
      { key: "Capacity", value: "512KB" },
      { key: "Access Time", value: "10ns" },
      { key: "Voltage", value: "3.3V" },
    ],
    brandVariants: [
      { brandId: "infineon", partNo: "CY62157EV30LL-45ZSXI", stock: 140 },
    ],
    offers: [
      { supplierId: "semiconductors-corp", brandId: "infineon", price: 75.0, leadTimeDays: 5 },
    ],
  },
  {
    id: "oscillator-24mhz",
    genericPN: "OSC-24M",
    name: "Oscillator 24MHz",
    category: "Frequency",
    description: "24MHz crystal oscillator, ±20ppm stability, 3.3V, 4-pin SMD.",
    stock: 320, minStock: 50, reorderQty: 250, unit: "PCS", bin: "E-02", lastCount: "2026-06-13",
    solderType: "SMD", footprint: "3225", spq: 1000, annualConsumption: 2100,
    specs: [
      { key: "Frequency", value: "24MHz" },
      { key: "Stability", value: "±20ppm" },
      { key: "Voltage", value: "3.3V" },
    ],
    brandVariants: [
      { brandId: "kyocera", partNo: "CX3225SB24000D0FFJCC", stock: 320 },
    ],
    offers: [
      { supplierId: "abc-electronics", brandId: "kyocera", price: 18.0, leadTimeDays: 3 },
    ],
  },
  {
    id: "flash-memory",
    genericPN: "MEM-FLSH",
    name: "Flash Memory",
    category: "Memory",
    description: "64M-bit serial NOR flash memory with dual and quad SPI, SOIC-8.",
    stock: 340, minStock: 80, reorderQty: 200, unit: "PCS", bin: "C-09", lastCount: "2026-06-09",
    solderType: "SMD", footprint: "SOIC-8", spq: 1000, annualConsumption: 1600,
    specs: [
      { key: "Capacity", value: "64Mbit" },
      { key: "Interface", value: "Quad SPI" },
      { key: "Voltage", value: "3.3V" },
    ],
    brandVariants: [
      { brandId: "winbond", partNo: "W25Q64JVSSIQ", stock: 200 },
      { brandId: "micron", partNo: "MT25QL64ABA", stock: 140 },
    ],
    offers: [
      { supplierId: "mouser", brandId: "winbond", price: 45.0, leadTimeDays: 4 },
      { supplierId: "semiconductors-corp", brandId: "micron", price: 47.0, leadTimeDays: 5 },
    ],
  },
  {
    id: "sd-card-slot",
    genericPN: "CON-SD",
    name: "SD Card Slot",
    category: "Connector",
    description: "Micro SD card connector, hinge type, 8-pin SMT.",
    stock: 180, minStock: 50, reorderQty: 150, unit: "PCS", bin: "D-05", lastCount: "2026-06-11",
    solderType: "SMD", footprint: "MicroSD-8P", spq: 500, annualConsumption: 1000,
    specs: [
      { key: "Card", value: "Micro SD" },
      { key: "Pins", value: "8" },
      { key: "Type", value: "Hinge" },
    ],
    brandVariants: [
      { brandId: "molex", partNo: "5031821852", stock: 180 },
    ],
    offers: [
      { supplierId: "xyz-components", brandId: "molex", price: 18.0, leadTimeDays: 3 },
    ],
  },
  {
    id: "usb-controller",
    genericPN: "IC-USB",
    name: "USB Controller",
    category: "IC",
    description: "USB 2.0 to UART bridge controller, integrated clock and voltage regulator.",
    stock: 290, minStock: 60, reorderQty: 150, unit: "PCS", bin: "C-10", lastCount: "2026-06-09",
    solderType: "SMD", footprint: "SSOP-28", spq: 1000, annualConsumption: 1500,
    specs: [
      { key: "Interface", value: "USB 2.0 / UART" },
      { key: "Speed", value: "Full Speed" },
      { key: "Voltage", value: "3.3V / 5V" },
    ],
    brandVariants: [
      { brandId: "ftdi", partNo: "FT232RL", stock: 160 },
      { brandId: "silicon-labs", partNo: "CP2102-GMR", stock: 130 },
    ],
    offers: [
      { supplierId: "abc-electronics", brandId: "ftdi", price: 65.0, leadTimeDays: 3 },
      { supplierId: "semiconductors-corp", brandId: "silicon-labs", price: 60.0, leadTimeDays: 5 },
    ],
  },
  {
    id: "mouse",
    genericPN: "MOUSE",
    name: "Mouse",
    category: "Peripherals",
    description: "Standard USB optical mouse, 1000 DPI, three-button with scroll wheel.",
    stock: 265, minStock: 100, reorderQty: 200, unit: "PCS", bin: "F-01", lastCount: "2026-06-08",
    solderType: "DIP", footprint: "N/A", spq: 50, annualConsumption: 600,
    specs: [
      { key: "Interface", value: "USB" },
      { key: "Resolution", value: "1000 DPI" },
      { key: "Buttons", value: "3" },
    ],
    brandVariants: [
      { brandId: "dell", partNo: "D-MSE-100", stock: 150 },
      { brandId: "lenovo", partNo: "LEN-MSE-22", stock: 75 },
      { brandId: "hp", partNo: "HP-MSE-09", stock: 40 },
    ],
    offers: [
      { supplierId: "abc-electronics", brandId: "dell", price: 350.0, leadTimeDays: 3 },
      { supplierId: "mouser", brandId: "hp", price: 450.0, leadTimeDays: 4 },
    ],
  },
]

// Single source of truth for quantity: a component's stock is the sum of its
// brand-variant stocks — it is never authored independently. This prevents the
// component/variant drift that the backend Inventory module also guards against.
export const COMPONENTS: Component[] = COMPONENT_CATALOG.map((c) => ({
  ...c,
  stock: c.brandVariants.reduce((sum, v) => sum + v.stock, 0),
  categoryId: null,
  categoryPath: null,
  itemType: "raw",
}))
