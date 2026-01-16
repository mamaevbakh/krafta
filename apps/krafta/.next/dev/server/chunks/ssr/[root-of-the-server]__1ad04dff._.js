module.exports = [
"[externals]/next/dist/server/lib/incremental-cache/tags-manifest.external.js [external] (next/dist/server/lib/incremental-cache/tags-manifest.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/tags-manifest.external.js", () => require("next/dist/server/lib/incremental-cache/tags-manifest.external.js"));

module.exports = mod;
}),
"[project]/apps/krafta/lib/catalogs/data.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "$$RSC_SERVER_CACHE_0",
    ()=>$$RSC_SERVER_CACHE_0,
    "$$RSC_SERVER_CACHE_1",
    ()=>$$RSC_SERVER_CACHE_1,
    "getCatalogBySlug",
    ()=>getCatalogBySlug,
    "getCatalogStructure",
    ()=>getCatalogStructure
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.1.2_@babel+core@7.28.5_react-dom@19.2.3_react@19.2.3__react@19.2.3/node_modules/next/dist/build/webpack/loaders/next-flight-loader/server-reference.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$cache$2d$wrapper$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.1.2_@babel+core@7.28.5_react-dom@19.2.3_react@19.2.3__react@19.2.3/node_modules/next/dist/build/webpack/loaders/next-flight-loader/cache-wrapper.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.1.2_@babel+core@7.28.5_react-dom@19.2.3_react@19.2.3__react@19.2.3/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react.js [app-rsc] (ecmascript)");
// lib/catalogs/data.ts
/* __next_internal_action_entry_do_not_use__ [{"c0c3e5afe23eb71387252db3207eed35ea3d10697d":"$$RSC_SERVER_CACHE_1","c0fa5cab4f6f207b8c2bf0d80864298b7ce2099224":"$$RSC_SERVER_CACHE_0"},"",""] */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/.pnpm/next@16.1.2_@babel+core@7.28.5_react-dom@19.2.3_react@19.2.3__react@19.2.3/node_modules/next/cache.js [app-rsc] (ecmascript)");
;
;
;
;
const supabaseUrl = ("TURBOPACK compile-time value", "https://hlmcoirjaydrfqcmnuun.supabase.co");
const supabaseAnonKey = ("TURBOPACK compile-time value", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsbWNvaXJqYXlkcmZxY21udXVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MDk1MjIsImV4cCI6MjA3ODk4NTUyMn0.3glVrGoHeRn44RrTR1JVZ0AFuhA8nbsWZnd7pl3MDqU");
if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
;
const supabaseHeaders = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`
};
const $$RSC_SERVER_CACHE_0_INNER = async function getCatalogBySlug(slug) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cacheTag"])(`catalog:${slug}`, "catalogs");
    const url = `${supabaseUrl}/rest/v1/catalogs?slug=eq.${encodeURIComponent(slug)}&select=*`;
    const response = await fetch(url, {
        headers: supabaseHeaders,
        next: {
            tags: [
                `catalog:${slug}`,
                "catalogs"
            ]
        },
        cache: "force-cache"
    });
    if (!response.ok) return null;
    const data = await response.json();
    const catalog = data[0] ?? null;
    if (catalog?.id) {
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cacheTag"])(`catalog:${catalog.id}`);
    }
    return catalog;
};
var $$RSC_SERVER_CACHE_0 = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cache"])(function getCatalogBySlug() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$cache$2d$wrapper$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cache"])("default", "c0fa5cab4f6f207b8c2bf0d80864298b7ce2099224", 0, $$RSC_SERVER_CACHE_0_INNER, arguments);
});
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])($$RSC_SERVER_CACHE_0, "c0fa5cab4f6f207b8c2bf0d80864298b7ce2099224", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_0, "name", {
    value: "getCatalogBySlug"
});
var getCatalogBySlug = $$RSC_SERVER_CACHE_0;
const $$RSC_SERVER_CACHE_1_INNER = async function getCatalogStructure(catalogId) {
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$cache$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cacheTag"])(`catalog:${catalogId}`, `catalog-structure:${catalogId}`);
    const categoriesUrl = `${supabaseUrl}/rest/v1/catalog_categories?catalog_id=eq.${encodeURIComponent(catalogId)}&is_active=eq.true&select=*&order=position.asc`;
    const itemsUrl = `${supabaseUrl}/rest/v1/items?catalog_id=eq.${encodeURIComponent(catalogId)}&is_active=eq.true&select=*&order=position.asc`;
    const [categoriesResponse, itemsResponse] = await Promise.all([
        fetch(categoriesUrl, {
            headers: supabaseHeaders,
            next: {
                tags: [
                    `catalog:${catalogId}`,
                    `catalog-structure:${catalogId}`
                ]
            },
            cache: "force-cache"
        }),
        fetch(itemsUrl, {
            headers: supabaseHeaders,
            next: {
                tags: [
                    `catalog:${catalogId}`,
                    `catalog-structure:${catalogId}`
                ]
            },
            cache: "force-cache"
        })
    ]);
    if (!categoriesResponse.ok) return [];
    const categories = await categoriesResponse.json();
    if (!itemsResponse.ok) {
        return categories.map((category)=>({
                ...category,
                items: []
            }));
    }
    const items = await itemsResponse.json();
    const itemsByCategory = new Map();
    for (const item of items){
        const list = itemsByCategory.get(item.category_id) ?? [];
        list.push(item);
        itemsByCategory.set(item.category_id, list);
    }
    return categories.map((category)=>({
            ...category,
            items: itemsByCategory.get(category.id) ?? []
        }));
};
var $$RSC_SERVER_CACHE_1 = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cache"])(function getCatalogStructure() {
    return (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$cache$2d$wrapper$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["cache"])("default", "c0c3e5afe23eb71387252db3207eed35ea3d10697d", 0, $$RSC_SERVER_CACHE_1_INNER, arguments);
});
(0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f2e$pnpm$2f$next$40$16$2e$1$2e$2_$40$babel$2b$core$40$7$2e$28$2e$5_react$2d$dom$40$19$2e$2$2e$3_react$40$19$2e$2$2e$3_$5f$react$40$19$2e$2$2e$3$2f$node_modules$2f$next$2f$dist$2f$build$2f$webpack$2f$loaders$2f$next$2d$flight$2d$loader$2f$server$2d$reference$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerServerReference"])($$RSC_SERVER_CACHE_1, "c0c3e5afe23eb71387252db3207eed35ea3d10697d", null);
Object["defineProperty"]($$RSC_SERVER_CACHE_1, "name", {
    value: "getCatalogStructure"
});
var getCatalogStructure = $$RSC_SERVER_CACHE_1;
}),
"[project]/apps/krafta/.next-internal/server/app/preview/[...slug]/page/actions.js { ACTIONS_MODULE0 => \"[project]/apps/krafta/lib/catalogs/data.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript) <locals>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$krafta$2f$lib$2f$catalogs$2f$data$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/krafta/lib/catalogs/data.ts [app-rsc] (ecmascript)");
;
;
}),
"[project]/apps/krafta/.next-internal/server/app/preview/[...slug]/page/actions.js { ACTIONS_MODULE0 => \"[project]/apps/krafta/lib/catalogs/data.ts [app-rsc] (ecmascript)\" } [app-rsc] (server actions loader, ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "c0c3e5afe23eb71387252db3207eed35ea3d10697d",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$krafta$2f$lib$2f$catalogs$2f$data$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["$$RSC_SERVER_CACHE_1"],
    "c0fa5cab4f6f207b8c2bf0d80864298b7ce2099224",
    ()=>__TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$krafta$2f$lib$2f$catalogs$2f$data$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["$$RSC_SERVER_CACHE_0"]
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$krafta$2f2e$next$2d$internal$2f$server$2f$app$2f$preview$2f5b2e2e2e$slug$5d2f$page$2f$actions$2e$js__$7b$__ACTIONS_MODULE0__$3d3e$__$225b$project$5d2f$apps$2f$krafta$2f$lib$2f$catalogs$2f$data$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$2922$__$7d$__$5b$app$2d$rsc$5d$__$28$server__actions__loader$2c$__ecmascript$29$__$3c$locals$3e$__ = __turbopack_context__.i('[project]/apps/krafta/.next-internal/server/app/preview/[...slug]/page/actions.js { ACTIONS_MODULE0 => "[project]/apps/krafta/lib/catalogs/data.ts [app-rsc] (ecmascript)" } [app-rsc] (server actions loader, ecmascript) <locals>');
var __TURBOPACK__imported__module__$5b$project$5d2f$apps$2f$krafta$2f$lib$2f$catalogs$2f$data$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/apps/krafta/lib/catalogs/data.ts [app-rsc] (ecmascript)");
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1ad04dff._.js.map