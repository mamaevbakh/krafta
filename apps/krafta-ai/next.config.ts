import type { NextConfig } from "next"
import { withEve } from "eve/next"

const nextConfig: NextConfig = {}

/**
 * Console and both agents ship as ONE Vercel project.
 *
 * Named agents mount at `/eve/agents/<name>/eve/v1/*`, so React reaches them
 * same-origin via `useEveAgent({ agent: "runtime" })` — no CORS, no URL env
 * vars to keep in sync between environments.
 *
 * Verified live on eve 0.32.0 before committing to this shape: `next build`
 * emits Build Output service routes per agent, Vercel provisions them, and
 * both `/eve/agents/{onboarding,runtime}/eve/v1/health` answer `ok` on a real
 * deployment. This did NOT work on eve 0.19.0 — which is why the main Krafta
 * repo still guards eve out of its Vercel build. Do not copy that guard here
 * without re-testing; it describes an older version.
 *
 * Use `agents` or `eveRoot`, never both.
 */
export default withEve(nextConfig, {
  agents: {
    onboarding: "./agents/onboarding",
    runtime: "./agents/runtime",
  },
})
