/** Shapes the API returns and the page renders. Shared by server and client. */

export type Kind = "goods" | "service" | "catering"
export type Match = "text" | "ikpu" | "barcode" | "package" | "prefix" | "same_category"

export type LocalizedName = {
  ru: string
  uzLatn: string | null
}

export type SearchResult = {
  ikpu: string
  status: "active" | "inactive"
  match: Match
  kind: Kind
  isBranded: boolean
  name: LocalizedName
  category: (LocalizedName & { code: string }) | null
}

export type SearchResponse = {
  query: string
  results: SearchResult[]
}

export type PackageCode = {
  code: number
  name: string
  origin: "fixed" | "user" | null
}

export type CodeDetails = {
  ikpu: string
  status: "active" | "inactive"
  kind: Kind
  name: LocalizedName & { uzCyrl: string | null }
  brand: string | null
  barcode: string | null
  units: string | null
  benefit: string | null
  path: (LocalizedName & { code: string })[]
  packages: PackageCode[]
}
