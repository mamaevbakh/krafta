<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Krafta AI

Read [CLAUDE.md](CLAUDE.md) before proposing architecture. In particular:

**Krafta AI is the interface; an agent builder writes the customer's agent as
CODE.** eve is infrastructure — evals, sandboxes, durable sessions, channels —
and a generated agent inherits all of it. This has been re-argued more than
once; the reasoning, and the real constraints, are in CLAUDE.md.

What is built today is still the row-configured shared runtime. That is the
starting point, not the destination. Do not describe either one as the whole
picture.

CLAUDE.md also carries the runtime traps that have each cost hours — every one
of them a case of something reporting success while doing nothing.
