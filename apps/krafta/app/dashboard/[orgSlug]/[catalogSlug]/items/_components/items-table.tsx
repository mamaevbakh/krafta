"use client"

import type { Item } from "@/lib/catalogs/types"
import type { CurrencySettings } from "@/lib/catalogs/settings/currency"
import { useT } from "@/lib/locales/dashboard/context"
import { createColumns } from "./columns"
import { DataTable } from "./data-table"

type ItemsTableProps = {
  items: Item[]
  currencySettings: CurrencySettings
}

export function ItemsTable({ items, currencySettings }: ItemsTableProps) {
  const t = useT()
  return (
    <DataTable
      columns={createColumns(t, currencySettings)}
      data={items}
      enableStatusTabs
      searchPlaceholder={t("items.search_placeholder")}
    />
  )
}
