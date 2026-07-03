import { defineSandbox, defaultBackend } from "eve/sandbox";

// The Krafta shop project is seeded into /workspace from
// agent/sandbox/workspace/ at session start. defaultBackend picks Vercel
// Sandbox when running on Vercel and a local runtime (Docker / microsandbox /
// just-bash) in dev. bootstrap installs the shop's deps once per template build
// so each session opens a ready-to-edit, ready-to-run shop.
export default defineSandbox({
  backend: defaultBackend({
    // eve 0.18.0 dropped the Vercel-sandbox `runtime` option — hosted sandboxes
    // now always boot from the published eve image. Only `resources` remains.
    vercel: { resources: { vcpus: 2 } },
  }),
  revalidationKey: () => "krafta-shop-v1",
  async bootstrap({ use }) {
    const sandbox = await use();
    await sandbox.run({ command: "npm install --no-audit --no-fund" });
  },
});
