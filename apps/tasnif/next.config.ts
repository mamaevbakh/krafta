import type { NextConfig } from "next"
import { HTML_LIMITED_BOT_UA_RE_STRING } from "next/dist/shared/lib/router/utils/is-bot"

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Crawlers on this list get each page whole: <title>, description and canonical in
  // <head>, and the content in the first response rather than streamed in after it.
  // Next's own list already covers Yandex, Bing and the link-preview bots (Telegram's
  // matches "TwitterBot"). Googlebot is left off it because it runs JavaScript, but
  // Google renders JavaScript later and on a budget, and with 441,000 code pages that
  // budget is the bottleneck; a complete first response gets indexed on the first visit.
  // The list is imported rather than copied so a Next upgrade keeps it current; if the
  // path ever moves, the build fails here instead of silently dropping it.
  htmlLimitedBots: new RegExp(`${HTML_LIMITED_BOT_UA_RE_STRING}|Googlebot`, "i"),
}

export default nextConfig
