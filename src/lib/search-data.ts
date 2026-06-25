export interface SearchProduct {
  id: string
  name: string
  code: string
  description: string
  estimatedCost: string
  pcbs: string[]
}

export interface SearchPCB {
  id: string
  name: string
  productCode: string
  productName: string
  components: { name: string; genericPN: string }[]
}

export interface BrandVariant {
  brand: string
  partNo: string
  stock: number
}

export interface SupplierOffer {
  supplier: string
  brand: string
  price: string
}

export interface SearchComponent {
  id: string
  name: string
  genericPN: string
  category: string
  stock: number
  brands: BrandVariant[]
  suppliers: SupplierOffer[]
  usedIn: string[]
}

export interface SearchBrand {
  name: string
  componentCount: number
  components: { name: string; genericPN: string; partNo: string }[]
}

export interface SearchSupplier {
  name: string;
  components: { name: string; genericPN: string; brand: string; price: string }[]
}

export const SEARCH_PRODUCTS: SearchProduct[] = [
  {
    id: "roip-400",
    name: "ROIP 400",
    code: "ROIP400",
    description: "Radio over IP Gateway Terminal with voice capability",
    estimatedCost: "₹18,450",
    pcbs: ["Audio PCB", "GSM PCB", "Display PCB"]
  },
  {
    id: "voice-logger",
    name: "Voice Logger",
    code: "VLG200",
    description: "Multi-channel voice recording and monitoring system",
    estimatedCost: "₹12,800",
    pcbs: ["Main PCB", "Memory PCB", "Interface PCB"]
  }
];

export const SEARCH_PCBS: SearchPCB[] = [
  {
    id: "audio-pcb",
    name: "Audio PCB",
    productCode: "ROIP400",
    productName: "ROIP 400",
    components: [
      { name: "Resistor 10K", genericPN: "RES-10K" },
      { name: "Capacitor 100uF", genericPN: "CAP-100UF" },
      { name: "Audio Codec", genericPN: "AUD-CDC" }
    ]
  },
  {
    id: "gsm-pcb",
    name: "GSM PCB",
    productCode: "ROIP400",
    productName: "ROIP 400",
    components: [
      { name: "GSM Chip", genericPN: "GSM-CHP" },
      { name: "SIM Holder", genericPN: "SIM-HLD" },
      { name: "Capacitor 100uF", genericPN: "CAP-100UF" }
    ]
  },
  {
    id: "display-pcb",
    name: "Display PCB",
    productCode: "ROIP400",
    productName: "ROIP 400",
    components: [
      { name: "Display IC", genericPN: "DISP-IC" },
      { name: "LED Green", genericPN: "LED-GRN" }
    ]
  },
  {
    id: "main-pcb",
    name: "Main PCB",
    productCode: "VLG200",
    productName: "Voice Logger",
    components: [
      { name: "DSP Chip", genericPN: "DSP-CHP" },
      { name: "Microcontroller", genericPN: "MCU-STM" },
      { name: "Connectors", genericPN: "CONN-HDR" }
    ]
  },
  {
    id: "memory-pcb",
    name: "Memory PCB",
    productCode: "VLG200",
    productName: "Voice Logger",
    components: [
      { name: "Flash Memory", genericPN: "FLASH-MEM" },
      { name: "SD Card Slot", genericPN: "SD-SLOT" },
      { name: "Resistor 10K", genericPN: "RES-10K" }
    ]
  },
  {
    id: "interface-pcb",
    name: "Interface PCB",
    productCode: "VLG200",
    productName: "Voice Logger",
    components: [
      { name: "USB Controller", genericPN: "USB-CTRL" },
      { name: "LED Green", genericPN: "LED-GRN" }
    ]
  }
];

export const SEARCH_COMPONENTS: SearchComponent[] = [
  {
    id: "resistor-10k",
    name: "Resistor 10K",
    genericPN: "RES-10K",
    category: "Passive",
    stock: 15000,
    brands: [
      { brand: "Yageo", partNo: "RC0402JR", stock: 6000 },
      { brand: "Vishay", partNo: "CRCW0402", stock: 5000 },
      { brand: "Panasonic", partNo: "ERJ2RK", stock: 4000 }
    ],
    suppliers: [
      { supplier: "ABC Electronics", brand: "Yageo", price: "₹0.80" },
      { supplier: "XYZ Components", brand: "Yageo", price: "₹0.82" },
      { supplier: "Mouser", brand: "Vishay", price: "₹0.95" },
      { supplier: "Arrow", brand: "Panasonic", price: "₹1.10" }
    ],
    usedIn: ["ROIP 400", "Voice Logger"]
  },
  {
    id: "capacitor-100uf",
    name: "Capacitor 100uF",
    genericPN: "CAP-100UF",
    category: "Passive",
    stock: 8000,
    brands: [
      { brand: "Nichicon", partNo: "UVR1E101MED", stock: 4000 },
      { brand: "Rubycon", partNo: "25YXG100MEFC6.3X11", stock: 4000 }
    ],
    suppliers: [
      { supplier: "PowerTech", brand: "Nichicon", price: "₹1.50" },
      { supplier: "XYZ Components", brand: "Rubycon", price: "₹1.40" },
      { supplier: "ABC Electronics", brand: "Nichicon", price: "₹1.65" }
    ],
    usedIn: ["ROIP 400", "Voice Logger"]
  },
  {
    id: "led-green",
    name: "LED Green",
    genericPN: "LED-GRN",
    category: "Optoelectronics",
    stock: 500,
    brands: [
      { brand: "Everlight", partNo: "EL-513-GRN", stock: 300 },
      { brand: "Lite-On", partNo: "LTL-4231N", stock: 200 }
    ],
    suppliers: [
      { supplier: "LED Depot", brand: "Everlight", price: "₹2.20" },
      { supplier: "XYZ Components", brand: "Lite-On", price: "₹2.10" },
      { supplier: "ABC Electronics", brand: "Everlight", price: "₹2.40" }
    ],
    usedIn: ["ROIP 400", "Voice Logger"]
  },
  {
    id: "audio-codec",
    name: "Audio Codec",
    genericPN: "AUD-CDC",
    category: "IC",
    stock: 50,
    brands: [
      { brand: "TI", partNo: "TLV320", stock: 50 }
    ],
    suppliers: [
      { supplier: "Texas Supplier", brand: "TI", price: "₹65.00" },
      { supplier: "India Electronics", brand: "TI", price: "₹68.00" }
    ],
    usedIn: ["ROIP 400"]
  },
  {
    id: "mouse",
    name: "Mouse",
    genericPN: "MOUSE",
    category: "Peripherals",
    stock: 265,
    brands: [
      { brand: "Dell", partNo: "D-MSE-100", stock: 150 },
      { brand: "Lenovo", partNo: "LEN-MSE-22", stock: 75 },
      { brand: "HP", partNo: "HP-MSE-09", stock: 40 }
    ],
    suppliers: [
      { supplier: "ABC Electronics", brand: "Dell", price: "₹350.00" },
      { supplier: "Mouser", brand: "HP", price: "₹450.00" }
    ],
    usedIn: ["ROIP 400", "Voice Logger"]
  }
];

export const SEARCH_BRANDS: SearchBrand[] = [
  {
    name: "Yageo",
    componentCount: 1,
    components: [
      { name: "Resistor 10K", genericPN: "RES-10K", partNo: "RC0402JR" }
    ]
  },
  {
    name: "Vishay",
    componentCount: 1,
    components: [
      { name: "Resistor 10K", genericPN: "RES-10K", partNo: "CRCW0402" }
    ]
  },
  {
    name: "Panasonic",
    componentCount: 2,
    components: [
      { name: "Resistor 10K", genericPN: "RES-10K", partNo: "ERJ2RK" },
      { name: "LED Green", genericPN: "LED-GRN", partNo: "LTL-4231N" }
    ]
  },
  {
    name: "Everlight",
    componentCount: 1,
    components: [
      { name: "LED Green", genericPN: "LED-GRN", partNo: "EL-513-GRN" }
    ]
  },
  {
    name: "Nichicon",
    componentCount: 1,
    components: [
      { name: "Capacitor 100uF", genericPN: "CAP-100UF", partNo: "UVR1E101MED" }
    ]
  },
  {
    name: "Rubycon",
    componentCount: 1,
    components: [
      { name: "Capacitor 100uF", genericPN: "CAP-100UF", partNo: "25YXG100MEFC6.3X11" }
    ]
  },
  {
    name: "Dell",
    componentCount: 1,
    components: [
      { name: "Mouse", genericPN: "MOUSE", partNo: "D-MSE-100" }
    ]
  },
  {
    name: "Lenovo",
    componentCount: 1,
    components: [
      { name: "Mouse", genericPN: "MOUSE", partNo: "LEN-MSE-22" }
    ]
  },
  {
    name: "HP",
    componentCount: 1,
    components: [
      { name: "Mouse", genericPN: "MOUSE", partNo: "HP-MSE-09" }
    ]
  },
  {
    name: "TI",
    componentCount: 1,
    components: [
      { name: "Audio Codec", genericPN: "AUD-CDC", partNo: "TLV320" }
    ]
  }
];

export const SEARCH_SUPPLIERS: SearchSupplier[] = [
  {
    name: "ABC Electronics",
    components: [
      { name: "Resistor 10K", genericPN: "RES-10K", brand: "Yageo", price: "₹0.80" },
      { name: "Capacitor 100uF", genericPN: "CAP-100UF", brand: "Nichicon", price: "₹1.65" },
      { name: "LED Green", genericPN: "LED-GRN", brand: "Everlight", price: "₹2.40" },
      { name: "Mouse", genericPN: "MOUSE", brand: "Dell", price: "₹350.00" }
    ]
  },
  {
    name: "XYZ Components",
    components: [
      { name: "Resistor 10K", genericPN: "RES-10K", brand: "Yageo", price: "₹0.82" },
      { name: "Capacitor 100uF", genericPN: "CAP-100UF", brand: "Rubycon", price: "₹1.40" },
      { name: "LED Green", genericPN: "LED-GRN", brand: "Lite-On", price: "₹2.10" }
    ]
  },
  {
    name: "Mouser",
    components: [
      { name: "Resistor 10K", genericPN: "RES-10K", brand: "Vishay", price: "₹0.95" },
      { name: "Mouse", genericPN: "MOUSE", brand: "HP", price: "₹450.00" }
    ]
  },
  {
    name: "Arrow",
    components: [
      { name: "Resistor 10K", genericPN: "RES-10K", brand: "Panasonic", price: "₹1.10" }
    ]
  },
  {
    name: "PowerTech",
    components: [
      { name: "Capacitor 100uF", genericPN: "CAP-100UF", brand: "Nichicon", price: "₹1.50" }
    ]
  },
  {
    name: "LED Depot",
    components: [
      { name: "LED Green", genericPN: "LED-GRN", brand: "Everlight", price: "₹2.20" }
    ]
  }
];
