// Universal-search index — derived from the active data store (mockdata or DB)
// via the shared selector factory, so results stay consistent with every page.
import type { Selectors } from "@/lib/catalog"

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
  name: string
  components: { name: string; genericPN: string; brand: string; price: string }[]
}

export interface SearchIndex {
  products: SearchProduct[]
  pcbs: SearchPCB[]
  components: SearchComponent[]
  brands: SearchBrand[]
  suppliers: SearchSupplier[]
}

/** Build the universal-search index from a bound selector suite (from useData()). */
export function buildSearchData(d: Selectors): SearchIndex {
  const products: SearchProduct[] = d.PRODUCTS.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    description: p.description,
    estimatedCost: d.formatINR(p.estimatedCost, 0),
    pcbs: d.productPcbs(p).map((pcb) => pcb.name),
  }))

  const pcbs: SearchPCB[] = d.PCBS.map((pcb) => {
    const prod = d.productsUsingPcb(pcb.id)[0]
    return {
      id: pcb.id,
      name: pcb.name,
      productCode: prod?.code ?? "",
      productName: prod?.name ?? "",
      components: d.pcbBom(pcb).map(({ component }) => ({
        name: component.name,
        genericPN: component.genericPN,
      })),
    }
  })

  const components: SearchComponent[] = d.COMPONENTS.map((c) => ({
    id: c.id,
    name: c.name,
    genericPN: c.genericPN,
    category: c.category,
    stock: c.stock,
    brands: c.brandVariants.map((v) => ({
      brand: d.getBrandName(v.brandId),
      partNo: v.partNo,
      stock: v.stock,
    })),
    suppliers: c.offers.map((o) => ({
      supplier: d.getSupplierName(o.supplierId),
      brand: d.getBrandName(o.brandId),
      price: d.formatINR(o.price),
    })),
    usedIn: d.productsUsingComponent(c.id).map((p) => p.name),
  }))

  const brands: SearchBrand[] = d.BRANDS.map((b) => {
    const comps = d.brandComponents(b.id)
    return {
      name: b.name,
      componentCount: comps.length,
      components: comps.flatMap((c) =>
        c.brandVariants
          .filter((v) => v.brandId === b.id)
          .map((v) => ({ name: c.name, genericPN: c.genericPN, partNo: v.partNo })),
      ),
    }
  }).filter((b) => b.componentCount > 0)

  const suppliers: SearchSupplier[] = d.SUPPLIERS.map((s) => ({
    name: s.name,
    components: d.supplierComponents(s.id).flatMap((c) =>
      c.offers
        .filter((o) => o.supplierId === s.id)
        .map((o) => ({
          name: c.name,
          genericPN: c.genericPN,
          brand: d.getBrandName(o.brandId),
          price: d.formatINR(o.price),
        })),
    ),
  })).filter((s) => s.components.length > 0)

  return { products, pcbs, components, brands, suppliers }
}
