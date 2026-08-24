/**
 * Seed a starter item-category taxonomy into every active company.
 *
 *   npx tsx scripts/seed-default-categories.ts
 *
 * Idempotent: skips any category whose (company_id, path) already exists, so
 * running it again after a partial edit does not clobber anything the user
 * added or renamed. Uses DIRECT_URL (owner role) so we can iterate every tenant
 * without setting app.current_company_id.
 *
 * The taxonomy pairs each leaf with the item_type that best fits so the
 * add-item form can auto-set the type when the user picks a category.
 */
import "dotenv/config";
import { Client } from "pg";

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) { console.error("DIRECT_URL / DATABASE_URL not set"); process.exit(2); }

type ItemType = "raw" | "semi_assembled" | "assembled" | "consumable" | "asset" | "packaging";

// Tree literal — each node may have children. `defaultItemType` is the type
// suggested when this category is picked in the add form.
interface Node { name: string; defaultItemType?: ItemType; children?: Node[] }

const TAXONOMY: Node[] = [
  {
    name: "Electronics", defaultItemType: "raw", children: [
      { name: "Resistors",              defaultItemType: "raw" },
      { name: "Capacitors",             defaultItemType: "raw" },
      { name: "Inductors & Magnetics",  defaultItemType: "raw" },
      { name: "Diodes",                 defaultItemType: "raw" },
      { name: "Transistors",            defaultItemType: "raw" },
      { name: "Integrated Circuits",    defaultItemType: "raw" },
      { name: "Connectors",             defaultItemType: "raw" },
      { name: "Sensors",                defaultItemType: "raw" },
      { name: "Crystals & Oscillators", defaultItemType: "raw" },
      { name: "LEDs & Displays",        defaultItemType: "raw" },
      { name: "Switches & Relays",      defaultItemType: "raw" },
    ],
  },
  {
    name: "Cables & Wires", defaultItemType: "raw", children: [
      { name: "Jumper Wires",  defaultItemType: "raw" },
      { name: "Ribbon Cables", defaultItemType: "raw" },
      { name: "Power Cables",  defaultItemType: "raw" },
    ],
  },
  {
    name: "Mechanical", defaultItemType: "raw", children: [
      { name: "Fasteners",   defaultItemType: "raw" },
      { name: "Enclosures",  defaultItemType: "raw" },
      { name: "Standoffs",   defaultItemType: "raw" },
      { name: "Heatsinks",   defaultItemType: "raw" },
    ],
  },
  { name: "PCBs (blank)",     defaultItemType: "raw" },
  { name: "Sub-assemblies",   defaultItemType: "semi_assembled" },
  { name: "Finished Goods",   defaultItemType: "assembled" },
  {
    name: "Consumables", defaultItemType: "consumable", children: [
      { name: "Solder & Flux",       defaultItemType: "consumable" },
      { name: "Cleaners & Solvents", defaultItemType: "consumable" },
      { name: "Tapes & Adhesives",   defaultItemType: "consumable" },
    ],
  },
  {
    name: "Packaging", defaultItemType: "packaging", children: [
      { name: "Boxes",         defaultItemType: "packaging" },
      { name: "Bags & Bubble", defaultItemType: "packaging" },
      { name: "Labels",        defaultItemType: "packaging" },
    ],
  },
  {
    name: "IT Assets", defaultItemType: "asset", children: [
      { name: "Laptops",     defaultItemType: "asset" },
      { name: "Monitors",    defaultItemType: "asset" },
      { name: "Peripherals", defaultItemType: "asset" },
    ],
  },
  {
    name: "Tools & Equipment", defaultItemType: "asset", children: [
      { name: "Hand Tools",              defaultItemType: "asset" },
      { name: "Measuring & Calibration", defaultItemType: "asset" },
      { name: "Soldering Stations",      defaultItemType: "asset" },
    ],
  },
];

// Matches the `slugify` used by src/lib/server/data/item-categories.ts so paths
// computed here collide with any created via the API (no dupes).
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

async function insertNode(
  client: Client,
  companyId: string,
  node: Node,
  parentId: string | null,
  parentPath: string | null,
  sortOrder: number,
): Promise<{ id: string; created: boolean }> {
  const slug = slugify(node.name);
  const path = parentPath ? `${parentPath}/${slug}` : slug;

  // Idempotent skip: any existing row at this (company, path) wins.
  const existing = await client.query(
    `SELECT id FROM item_categories WHERE company_id = $1::uuid AND path = $2 AND deleted_at IS NULL`,
    [companyId, path],
  );
  if (existing.rows[0]) return { id: existing.rows[0].id, created: false };

  const inserted = await client.query(
    `INSERT INTO item_categories
       (company_id, parent_id, name, slug, path, default_item_type, sort_order)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::item_type, $7)
     RETURNING id`,
    [companyId, parentId, node.name, slug, path, node.defaultItemType ?? null, sortOrder],
  );
  return { id: inserted.rows[0].id, created: true };
}

async function seedForCompany(client: Client, companyId: string, companyName: string) {
  let created = 0, skipped = 0;
  let root = 0;
  for (const top of TAXONOMY) {
    const t = await insertNode(client, companyId, top, null, null, root++);
    t.created ? created++ : skipped++;
    let child = 0;
    for (const kid of top.children ?? []) {
      const c = await insertNode(client, companyId, kid, t.id, slugify(top.name), child++);
      c.created ? created++ : skipped++;
    }
  }
  console.log(`  ${companyName.padEnd(36)}  created=${created}  skipped=${skipped}`);
}

async function main() {
  const client = new Client({ connectionString: url });
  await client.connect();
  const companies = (await client.query(`SELECT id, name FROM companies ORDER BY name`)).rows as { id: string; name: string }[];
  console.log(`\nSeeding starter categories into ${companies.length} companies…\n`);
  for (const co of companies) await seedForCompany(client, co.id, co.name);
  await client.end();
  console.log(`\nDone.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
