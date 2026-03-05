import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { getDocsIndex } from "@/lib/markdoc";

export default async function DocsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const docs = await getDocsIndex();
  const sidebarDocs = docs.map((doc) => ({
    group: doc.group,
    title: doc.title,
    href: doc.href,
    order: doc.order,
  }));

  return (
    <SidebarProvider>
      <AppSidebar docs={sidebarDocs} />
      <SidebarInset>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur-sm">
          <SidebarTrigger />
          <Separator
            orientation="vertical"
            className="mx-1 data-vertical:h-4 data-vertical:self-auto"
          />
          <p className="text-sm font-medium tracking-tight">Documentation</p>
        </header>
        <div className="p-5 md:p-8">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
