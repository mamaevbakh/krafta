"use client"

import type { Item } from "@/lib/catalogs/types"
import type { CurrencySettings } from "@/lib/catalogs/settings/currency"
import { createColumns } from "./columns"
import { DataTable } from "./data-table"

type ItemsTableProps = {
  items: Item[]
  currencySettings: CurrencySettings
}

export function ItemsTable({ items, currencySettings }: ItemsTableProps) {
  return (
    <DataTable
      columns={createColumns(currencySettings)}
      data={items}
      enableStatusTabs
      searchPlaceholder="Search items..."
    />
  )
}
