// Universal-search index — derived entirely from the centralized mock store
// so search results stay consistent with every page. See src/mockdata.
import {
  PRODUCTS, PCBS, COMPONENTS, BRANDS, SUPPLIERS,
  productPcbs, pcbBom, productsUsingPcb, productsUsingComponent,
  brandComponents, supplierComponents, getBrandName, getSupplierName, formatINR,
} from "@/mockdata"

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

export const SEARCH_PRODUCTS: SearchProduct[] = PRODUCTS.map((p) => ({
  id: p.id,
  name: p.name,
  code: p.code,
  description: p.description,
  estimatedCost: formatINR(p.estimatedCost, 0),
  pcbs: productPcbs(p).map((pcb) => pcb.name),
}))

export const SEARCH_PCBS: SearchPCB[] = PCBS.map((pcb) => {
  const prod = productsUsingPcb(pcb.id)[0]
  return {
    id: pcb.id,
    name: pcb.name,
    productCode: prod?.code ?? "",
    productName: prod?.name ?? "",
    components: pcbBom(pcb).map(({ component }) => ({
      name: component.name,
      genericPN: component.genericPN,
    })),
  }
})

export const SEARCH_COMPONENTS: SearchComponent[] = COMPONENTS.map((c) => ({
  id: c.id,
  name: c.name,
  genericPN: c.genericPN,
  category: c.category,
  stock: c.stock,
  brands: c.brandVariants.map((v) => ({
    brand: getBrandName(v.brandId),
    partNo: v.partNo,
    stock: v.stock,
  })),
  suppliers: c.offers.map((o) => ({
    supplier: getSupplierName(o.supplierId),
    brand: getBrandName(o.brandId),
    price: formatINR(o.price),
  })),
  usedIn: productsUsingComponent(c.id).map((p) => p.name),
}))

export const SEARCH_BRANDS: SearchBrand[] = BRANDS.map((b) => {
  const comps = brandComponents(b.id)
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

export const SEARCH_SUPPLIERS: SearchSupplier[] = SUPPLIERS.map((s) => ({
  name: s.name,
  components: supplierComponents(s.id).flatMap((c) =>
    c.offers
      .filter((o) => o.supplierId === s.id)
      .map((o) => ({
        name: c.name,
        genericPN: c.genericPN,
        brand: getBrandName(o.brandId),
        price: formatINR(o.price),
      })),
  ),
})).filter((s) => s.components.length > 0)
