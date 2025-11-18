import { Suspense } from "react";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

type Catalog = Tables<"catalogs">;
type CatalogPageParams = {
	catalogSlug: string;
};

async function getCatalogBySlug(slug: string) {
	const supabase = await createClient();
	const { data, error } = await supabase
		.from("catalogs")
		.select("id, name, slug, created_at")
		.eq("slug", slug)
		.single();

	if (error || !data) {
		return null;
	}

	return data satisfies Catalog;
}

export default function CatalogPage({
	params,
}: {
	params: Promise<CatalogPageParams>;
}) {
	return (
		<Suspense fallback={<CatalogPageFallback />}>
			<CatalogPageContent params={params} />
		</Suspense>
	);
}

async function CatalogPageContent({
	params,
}: {
	params: Promise<CatalogPageParams>;
}) {
	const { catalogSlug } = await params;
	const catalog = await getCatalogBySlug(catalogSlug);

	if (!catalog) {
		notFound();
	}

	return (
		<main className="min-h-screen text-foreground">
			<section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-16">
				<div className="space-y-2">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
						Catalog
					</p>
					<h1 className="text-4xl font-semibold tracking-tight">{catalog.name}</h1>
					<p className="text-base text-muted-foreground">
						This public view is the foundation for future templates, theme tokens, and
						section builders. Hook up your product data and publish when ready.
					</p>
				</div>
				<div className="grid gap-4 rounded-2xl border bg-card p-6 shadow-sm">
					<h2 className="text-xl font-semibold">Upcoming building blocks</h2>
					<ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
						<li>Hero, product grid, and CTAs selected per template</li>
						<li>Catalog-level typography, color, and radius tokens</li>
						<li>Scheduling and previewing before publishing</li>
					</ul>
				</div>
			</section>
		</main>
	);
}

function CatalogPageFallback() {
	return (
		<main className="min-h-screen text-foreground">
			<section className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-16">
				<div className="space-y-3">
					<div className="h-3 w-24 rounded-full bg-muted" />
					<div className="h-10 w-2/3 rounded-full bg-muted" />
					<div className="h-20 w-full rounded-2xl bg-muted/70" />
				</div>
				<div className="h-40 rounded-2xl border bg-card p-6 shadow-sm">
					<div className="h-5 w-40 rounded-full bg-muted" />
					<div className="mt-4 space-y-2">
						<div className="h-3 w-full rounded-full bg-muted" />
						<div className="h-3 w-3/4 rounded-full bg-muted" />
						<div className="h-3 w-1/2 rounded-full bg-muted" />
					</div>
				</div>
			</section>
		</main>
	);
}
