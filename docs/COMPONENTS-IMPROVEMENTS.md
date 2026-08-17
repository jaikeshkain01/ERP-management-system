# Components → Item Master — Improvement & Redesign Spec

> **Status:** Design / analysis only — nothing implemented yet.
> **Owner:** StackIOT Technologies Pvt Ltd (electronics / IoT contract manufacturer — ROIP, ESL, PTT hardware).
> **Date:** 2026-08-13
> **Scope:** The `components` module (data model, master form, list, details, usage) and its planned
> generalization into a company-wide **Item Master** with a hierarchical category tree and **lot-number tracking**.

This document has two parts:

1. **Part 1 — Fixes to the current Components module** (what's broken/weak today).
2. **Part 2 — The Item Master redesign** (generalize to any inventory item, category tree, lot numbers).

---

# Part 1 — Current Components module: problems & improvements

## A. Dead foundations 🔴 (render fine, but the value is silently always 0/empty)

These all trace to the master form not writing fields the DB model already has.

| # | Problem | Root cause | Downstream effect |
|---|---|---|---|
| A1 | **`min_stock` cannot be set anywhere** | Add/Edit form has no field for it (`component-form.tsx`); create defaults to 0 (`components.ts:147`) | Every component `min_stock = 0` → status can only be **"Healthy"** → Low/Critical status, the "Low/Critical" KPI, and the whole reorder-point concept are **dead** |
| A2 | **`annual_consumption` hardcoded 0, never recomputed** | Set to 0 on create (`components.ts:163`); no update path | Usage & Coverage page shows 0 usage, **"0 Days" coverage (always red)**, all-zero trend chart |
| A3 | **`description` cannot be set** | No form field | Blank on usage page + details header |
| A4 | **`unit` (UOM) cannot be set** | No form field → always `"PCS"` (`components.ts:211`) | No reels / trays / meters / boxes |
| A5 | **"Export CSV" button is inert** | No `onClick` (`list/page.tsx`) | Dead control |

## B. Data-model gaps for an electronics / RF manufacturer

| Gap | Why it matters for StackIOT |
|---|---|
| **Lifecycle status** (Active / NRND / Obsolete / EOL) | RF & comm ICs go end-of-life mid-production |
| **MSL** (Moisture Sensitivity Level) | Bake/handling rules for SMD reflow parts |
| **RoHS / REACH flag** | Make-in-India content + export compliance |
| **Datasheet URL + image** | Basic engineering reference |
| **Structured/parametric specs** | Specs are free key/value JSON — no per-category attributes → weak parametric search |
| **Barcode / QR** | Prerequisite for scan-based inventory |
| **Manufacturer vs Brand** | "Brand" currently doubles as manufacturer; MPN sits on `variant.part_no` |

## C. Data-quality & integrity

| # | Problem | Location |
|---|---|---|
| C1 | **Hardcoded demo defaults** — every new component pre-fills a Yageo/Vishay 10 kΩ resistor + fake specs | `component-form.tsx:48` |
| C2 | **Category is free text** stored raw; typos spawn phantom categories & filter entries; no reference table | `component-form.tsx:221`, `list/page.tsx:148` |
| C3 | **Naïve Generic-PN autosuggest** (`RES-`/`COMP-` by "passive" substring) | `component-form.tsx:107` |
| C4 | **Schema/client drift** — `preferred_supplier_id` not in generated Prisma client, set via raw SQL | `components.ts:298` |

## D. Status logic duplicated in 4 places and inconsistent 🟠

| Location | Rule |
|---|---|
| Server `statusOf` (`components.ts:53`) | Critical `≤ min×0.5`, Low `< min`, else Healthy. No "Out of Stock". |
| Inventory `getStatus` (`inventory/page.tsx:110`) | Adds **"Out of Stock"** at 0; Critical `< min×0.5` |
| List `getStatusInfo` (`list/page.tsx:104`) | Folds **"Single Supplier Risk"** (a *sourcing* signal) into the *stock* status axis |
| Usage coverage color (`usage/page.tsx:96`) | Different axis (coverage days) |

**Fix:** one shared status helper; keep sourcing-risk on its own axis.

## E. UX / functional gaps

- **No reorder-point input** anywhere (root of A1).
- **No bulk item import** — BOM import exists for *products*, but the master has no CSV/Excel import for parts.
- **Variants are add-only in Edit** — existing ones locked; can't fix a wrong `part_no` or remove a variant.
- **No image / datasheet** on the record.

## F. Already solid — do not touch

- Server layer: `guarded` + RLS + permission gates, duplicate-code 409s, soft-delete cascading to variants + price book.
- Stock is correctly **derived** from `inventory_balances`, never stored on the item.
- List advanced search (scoped fields), filter panel, and slide-out drawer are well-built.

---

# Part 2 — Item Master redesign (generalize Components → Items)

## 2.1 Vision

A real manufacturer's inventory is **not just electronic components**. It also holds laptops & mice (IT assets),
jumper wires & enclosures (raw materials), boxes & labels (packaging), solder & flux (consumables), and the
company's own output in every state: **raw → semi-assembled → assembled/finished**.

**Goal:** turn the Components page into a generic **Item** page where any inventory item can be registered,
classified under a **hierarchical category tree**, and (where needed) tracked by **lot number**. Electronics
components become *one item type among many*, not the only citizen.

The good news: the current `components` table is already ~80% generic (`generic_pn`, `name`, `category`,
`description`, `unit`, `min_stock`, `reorder_qty`, `specs`). Only a few fields are electronics-specific
(`solder_type`, `footprint`, `spq`) — those become **category-conditional**, shown only for relevant items.

## 2.2 Item type (state) — a first-class field

Introduce an `item_type` (a.k.a. lifecycle stage) so the system knows how an item behaves:

| item_type | Meaning | Behaves like |
|---|---|---|
| `raw` | Purchased raw component / material | Bought (PR→PO→receive), consumed by production |
| `semi_assembled` | Sub-assembly / WIP (e.g. populated PCBA, cable assembly) | Produced *and* consumed |
| `assembled` / `finished_good` | Shippable end product (ROIP-400, ESL unit) | Produced, stocked, shipped |
| `consumable` | Solder, flux, cleaning agents | Bought, consumed, not in BOM output |
| `asset` | IT / office / tools (laptop, mouse, meter) | Tracked, assigned, not consumed |
| `packaging` | Boxes, labels, foam | Bought, consumed on dispatch |

> **Design note:** you framed raw/semi/assembled as *sub-categories* of Components. They can be modelled
> **either** as a proper `item_type` enum (recommended — it drives behaviour) **or** as branches in the
> category tree. Recommendation: keep `item_type` as its own field for behaviour, and *also* let the category
> tree mirror it for browsing/filtering. The two are complementary, not redundant.

## 2.3 Hierarchical category tree

Replace the free-text `category` string with a proper **self-referential category table** (arbitrary depth),
tenant-scoped, soft-deletable. This mirrors ERPNext's "Item Group" tree.

**New table `item_categories`:**

| column | notes |
|---|---|
| `id` (uuid, PK) | |
| `company_id` (uuid) | RLS tenant scope |
| `parent_id` (uuid, nullable) | self-reference → tree of any depth |
| `name` | e.g. "Resistors" |
| `slug` / `code` | stable key |
| `path` (optional, materialized) | e.g. `components/raw/passive/resistors` for fast descendant filtering |
| `default_item_type` (nullable) | pre-fills item_type when adding under this node |
| `lot_tracked` (bool, default false) | children inherit unless overridden (see §2.4) |
| audit + `deleted_at` | |

- `items.category_id` → FK to `item_categories` (replaces the raw string).
- **Filtering by a node includes all descendants** (via `path` prefix or recursive CTE).
- **Category-conditional fields:** solder_type/footprint/MSL show only under electronics branches; laptops show
  serial/asset-tag fields instead. Driven by the category (or item_type) of the selected node.

### Proposed seed taxonomy (starter tree — extend freely)

```
Electronic Components            (item_type: raw)
├── Passive
│   ├── Resistors
│   ├── Capacitors
│   └── Inductors / Ferrites
├── Semiconductors (Active)
│   ├── ICs
│   ├── Transistors / MOSFETs
│   └── Diodes / Rectifiers
├── Optoelectronics
│   ├── LEDs
│   └── Displays
├── Electromechanical
│   ├── Connectors / Headers
│   ├── Relays / Switches
│   └── Crystals / Oscillators
└── RF & Wireless               (StackIOT-specific: modules, antennas, SIM holders)

Sub-Assemblies                   (item_type: semi_assembled)
├── Bare PCBs
├── Populated PCBA
└── Cable / Wire Assemblies

Finished Goods                   (item_type: assembled / finished_good)
├── ROIP Gateways
├── Electronic Shelf Labels (ESL)
└── PTT / Walkie-Talkie Devices

Raw Materials                    (item_type: raw)
├── Wires & Jumper Wires
├── Enclosures / Chassis
└── Hardware (screws, standoffs)

Consumables                      (item_type: consumable)
├── Solder / Paste / Flux
├── Adhesives / Cleaning
└── Stencils

Packaging                        (item_type: packaging)
├── Boxes / Cartons
├── Labels
└── Foam / Anti-static

IT & Office Equipment            (item_type: asset)
├── Laptops / Desktops
├── Peripherals (Mouse, Keyboard, Monitor)
└── Networking

Tools & Test Equipment           (item_type: asset)
├── Soldering Stations
├── Test & Measurement (DMM, Oscilloscope)
└── Hand Tools
```

## 2.4 Lot-number tracking (the headline feature)

**Why:** For RF/comm hardware, Make-in-India content, RoHS and failure analysis you must be able to answer
*"which lot of which item went into which build / shipment?"* — and run a recall when a supplier lot is bad.
The existing **append-only ledger is the ideal foundation** — adding lots is an *additive dimension*, not a rewrite.

### Model

**New table `item_lots` (batches):**

| column | notes |
|---|---|
| `id` (uuid, PK) | |
| `company_id` | RLS |
| `variant_id` (→ `component_brand_variants`) | the item+brand the lot belongs to |
| `lot_no` | supplier lot / internal batch number |
| `supplier_id` (nullable) | where it came from |
| `mfg_date` / `received_date` / `expiry_date` (nullable) | FEFO + shelf-life |
| `unit_cost` (nullable) | **enables real FIFO/weighted-avg valuation** (fixes the "value = live supplier price" gap) |
| `date_code`, `msl`, `coc_url` (nullable) | electronics traceability (date code, moisture level, cert of conformance) |
| audit + `deleted_at` | |
| **unique** `(company_id, variant_id, lot_no)` | one lot number per item |

**Ledger + balance become lot-aware:**

- Add `lot_id` **(NOT NULL)** to `inventory_transactions` and to `inventory_balances` — every movement carries a lot.
- `inventory_balances` unique key becomes **`(variant_id, location_id, lot_id)`** → on-hand is now *per lot per bin*.
- The `apply_inventory_txn()` trigger carries `lot_id` through unchanged in spirit (just another grouping column).

### Behaviour

- **On receipt / opening stock (IN):** capture or auto-create the lot; the IN row records `lot_id` + `unit_cost`.
- **On consumption / OUT:** pick a lot — **FEFO** (expiry first) or **FIFO** by default, or manual override.
  The production consumption records *which lot* fed *which production order* → full genealogy.
- **Traceability / recall:** "where-used by lot" and "which shipments contain lot X".
- **Valuation:** value = Σ(on_hand × lot.unit_cost) — proper cost, not a live quote.

### Every item is lot-tracked (DECIDED)

**Policy:** *every* item carries a lot number on every movement — no opt-out. Chosen for maximum traceability
(RF/comm, RoHS, Make-in-India). This is the stricter of the two options; the friction is removed by
**auto-generating lots**, not by exempting items:

- **User supplies a real lot** (e.g. supplier lot on an IC reel) → use it.
- **User supplies nothing** (a box of mice, a spool of wire) → the system **auto-generates an internal lot**
  from the goods-receipt, e.g. `LOT-GRN000123` or `LOT-20260813-01`. The operator never has to invent one.
- `lot_id` is therefore **NOT NULL** everywhere — there is no "no lot" state.
- **Migration:** backfill a synthetic `LOT-LEGACY` (opening lot) for every existing balance/ledger row, since
  historical stock has no real lot. One-time data step, done with the lot migration.

> Trade-off accepted: more rows in `item_lots` and `inventory_balances` (one balance per lot per bin, not just
> per bin). Auto-lot generation + FEFO/FIFO auto-selection keep the operator burden low despite the strict policy.

### Serial numbers (sibling, note for later)

Finished units (each ROIP-400) often need **per-unit serials**, which are effectively lots of quantity 1 plus a
`serials` table. Same mechanism; call it out as a Phase-2 extension of lot tracking, not part of the first cut.

---

# Part 3 — Schema change summary

| Change | Type | Risk |
|---|---|---|
| Add form fields: `min_stock`, `description`, `unit` | UI only (fields already exist) | none |
| One shared stock-status helper | Refactor | low |
| Remove demo defaults; category = managed list | UI + data | low |
| Rename concept **Components → Items**; add `item_type` enum column | Migration (additive) | medium |
| Rename **Brands → Manufacturers** (`brands`→`manufacturers`, `*_brand_variants`→`*_manufacturer_variants`, `brand_id`→`manufacturer_id`, `/brands`→`/manufacturers`, `brand.*`→`manufacturer.*`) | Migration + code sweep | medium |
| New `item_categories` tree table; `items.category_id` FK; backfill from existing strings | Migration + data backfill | medium |
| Make `solder_type`/`footprint`/`spq`/`msl` category-conditional | UI + nullable columns | low |
| New `item_lots` table; add `lot_id` **NOT NULL** (+ `unit_cost` via lot) to `inventory_transactions` & `inventory_balances`; rework balance unique key + trigger | Migration (ledger-touching) | **high — do as its own phase** |
| Auto-lot generation on receipt (internal lot when none supplied) | New logic | low |
| Backfill `LOT-LEGACY` for all existing balances (no NULL lot allowed) | Data migration | medium |

---

# Part 4 — Recommended roadmap

**Phase 1 — Revive the base (no migration).** Fix A1–A4 + one shared status helper (D); drop demo defaults (C1).
Tiny effort, revives 3 dead features, makes stock status correct before anything else.

**Phase 2 — Category tree + Item generalization.** `item_categories` table, `item_type`, rename Components→Items,
category-conditional fields, managed category picker, seed the taxonomy above, bulk import.

**Phase 3 — Lot numbers.** `item_lots` + lot-aware ledger/balances + FEFO/FIFO consumption + traceability +
lot-cost valuation. Its own phase because it touches the append-only ledger.

**Phase 4 — Electronics/compliance polish + serials.** Lifecycle status, RoHS, datasheet/image, per-unit serials.

---

# Decisions & open questions

### Decided
1. **Rename scope — DECIDED:** rename **`components` → `items` everywhere** (routes `/components/*` → `/items/*`,
   API, server data, types, UI). "Item" is the real concept; electronic components are one item type among many.
   This is a larger diff but the correct long-term foundation and should be done *before* the category/lot work
   so we don't rename twice. Table `components` → `items`, `component_brand_variants` → `item_variants`,
   `pcb_lines.component_id` → `item_id`, etc. (a rename migration + code sweep).

2. **raw/semi/assembled modeling — DECIDED:** **both** — a first-class `item_type` field on the item (so the
   system can *behave* by stage: raw → purchasing, finished → sales/shipping, semi → made-and-consumed) **and**
   the category tree mirrors those stages for browsing/filtering. Adding an item should place it in a folder
   consistent with its `item_type`.
3. **Lot tracking scope — DECIDED:** **every item is lot-tracked** (no opt-out). `lot_id` is NOT NULL; friction
   handled by auto-generating internal lots when the user doesn't supply a real one; existing stock backfilled
   with `LOT-LEGACY`.
4. **Brand → Manufacturer rename — DECIDED:** the "brand" concept is renamed to **manufacturer** everywhere:
   table `brands` → `manufacturers`, `component_brand_variants` → `item_manufacturer_variants`,
   `brand_id` → `manufacturer_id`, routes `/brands/*` → `/manufacturers/*`, selector `getBrandName` →
   `getManufacturerName`, permissions `brand.*` → `manufacturer.*`. Executed **together with the
   components→items rename** in Phase 2 (one migration pass, done once). Component-form *labels* are relabelled
   immediately as an interim; the rest of the UI (list, details, drawer, Manufacturers module) follows in Phase 2.
5. **Two part numbers — DECIDED (option a):**
   - **Generic Part No** — internal, on the item header (`items.generic_pn`); entered by us.
   - **Manufacturer Part No (MPN)** — from the manufacturer, on the **manufacturer variant only**
     (`item_manufacturer_variants.part_no`). No header-level MPN — a single-source item simply has one variant.
   - The field currently labelled "Brand Part Number" is relabelled **"Manufacturer Part No (MPN)"**.
   - Rationale: one generic part can be sourced from several manufacturers, each with its own MPN
     (e.g. `RES-10K` → Yageo `RC0603JR-0710KL`, Vishay `CRCW060310K0FKEA`); MPN therefore belongs per-manufacturer.

### Still open
_None — all core decisions made. Spec is build-ready._
4. **Valuation method** once lots carry cost: FIFO, weighted-average, or FEFO-driven? (Affects the valuation query.)
5. **Assets (laptops/mice):** treat as normal stock items, or a lightweight asset register (assignee, location)
   that reuses the item master but not the production/BOM machinery?
