import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Auth: replaces verify_jwt at the gateway. The new sb_secret_ key isn't a
  // JWT, so JWT verification rejects it. Accept either the new secret key or
  // the legacy service_role JWT (whichever the caller sends).
  const expectedNewKey = Deno.env.get("SUPABASE_SECRET_KEY");
  const expectedLegacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
                ?? req.headers.get("apikey");
  const matches = !!provided
    && ((expectedNewKey && provided === expectedNewKey)
        || (expectedLegacyKey && provided === expectedLegacyKey));
  if (!matches) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { query } = await req.json();

  if (!query || typeof query !== "string") {
    return new Response("Missing query", { status: 400 });
  }

  // Short queries -> no embedding (keyword mode).
  if (query.trim().length < 3) {
    return new Response(
      JSON.stringify({ embedding: null, skipped: true }),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
  });

  const model =
    Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";

  const res = await openai.embeddings.create({
    model,
    input: query,
  });

  const vector = res.data[0].embedding;

  // Convert to Postgres vector literal.
  const vectorLiteral =
    "[" + vector.map((v) => v.toString()).join(",") + "]";

  return new Response(
    JSON.stringify({
      embedding: vectorLiteral,
      skipped: false,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
