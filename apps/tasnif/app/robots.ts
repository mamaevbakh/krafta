import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site"

/** Every page may be crawled; the JSON API behind the search may not (it is not a page). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
