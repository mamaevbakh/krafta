import { notFound } from "next/navigation"
import { AppSidebar } from "./_block/app-sidebar"
import { ChartAreaInteractive } from "./_block/chart-area-interactive"
import { DataTable } from "./_block/data-table"
import { SectionCards } from "./_block/section-cards"
import { SiteHeader } from "./_block/site-header"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"

import data from "./_block/data.json"

export default function Page() {
  // Dev only. This is the shadcn block verbatim, demo data and all, kept as a
  // side-by-side reference while the dashboard is rebuilt against it. On
  // production it is a page of invented "Acme Inc." revenue sitting on a real
  // payments domain, which is worse than useless to a merchant who finds it.
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <SectionCards />
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div>
              <DataTable data={data} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
