// supabase/functions/embed/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://deno.land/x/openai@v4.69.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type Job = {
  id: string; // uuid
  schema: string;
  table: string;
  contentFunction: string;
  embeddingColumn: string;
  jobId?: number; // pgmq msg_id
};

function buildEmbeddingText(doc: any): string {
  const tags = Array.isArray(doc.tags) ? doc.tags.join(" ") : (doc.tags ?? "");
  return [
    doc.locale ?? "",
    doc.title ?? "",
    doc.subtitle ?? "",
    doc.description ?? "",
    tags ?? "",
  ]
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join("\n\n");
}

function toVectorLiteral(arr: number[]): string {
  // Postgres vector input format: '[0.1,0.2,...]'
  return "[" + arr.map((n) => Number.isFinite(n) ? n.toString() : "0").join(",") + "]";
}

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response("Missing OPENAI_API_KEY", { status: 500 });
    }

    const model = Deno.env.get("OPENAI_EMBEDDING_MODEL") ?? "text-embedding-3-small";

    // Supabase project env vars are available by default in Edge Functions runtime.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return new Response(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function secrets",
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const jobs = (await req.json()) as Job[];
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    let processed = 0;
    const errors: Array<{ id?: string; jobId?: number; error: string }> = [];

    for (const job of jobs) {
      try {
        // We currently only support catalog_search_documents in this implementation
        // (schema/table are still carried for compatibility with the job payload).
        if (job.schema !== "public" || job.table !== "catalog_search_documents") {
          throw new Error(`Unsupported target: ${job.schema}.${job.table}`);
        }

        const { data: doc, error: readErr } = await supabase
          .from("catalog_search_documents")
          .select("id, locale, title, subtitle, description, tags")
          .eq("id", job.id)
          .maybeSingle();

        if (readErr) throw readErr;
        if (!doc) throw new Error("Document not found");

        const input = buildEmbeddingText(doc);
        if (!input.trim()) {
          // Nothing to embed; still ack job to avoid infinite retries.
          if (typeof job.jobId === "number") {
            await supabase.rpc("ack_embedding_job", { p_job_id: job.jobId });
          }
          continue;
        }

        const emb = await openai.embeddings.create({
          model,
          input,
        });

        const vector = emb.data?.[0]?.embedding;
        if (!vector || !Array.isArray(vector)) {
          throw new Error("OpenAI returned empty embedding");
        }

        // Write to halfvec via RPC (casts vector -> halfvec inside DB).
        const vectorLiteral = toVectorLiteral(vector as number[]);
        const { error: writeErr } = await supabase.rpc("set_catalog_search_doc_embedding", {
          p_id: doc.id,
          p_embedding_text: vectorLiteral,
        });
        if (writeErr) throw writeErr;

        // Ack/archive queue message.
        if (typeof job.jobId === "number") {
          const { error: ackErr } = await supabase.rpc("ack_embedding_job", { p_job_id: job.jobId });
          if (ackErr) throw ackErr;
        }

        processed += 1;
      } catch (e) {
        errors.push({
          id: job?.id,
          jobId: job?.jobId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return new Response(JSON.stringify({ ok: errors.length === 0, processed, errors }), {
      headers: { "Content-Type": "application/json" },
      status: errors.length ? 207 : 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { headers: { "Content-Type": "application/json" }, status: 500 },
    );
  }
});
