import { createClient } from "npm:@supabase/supabase-js@2";

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 5;

type QueueRow = { id: number; bucket: string; path: string; attempts: number };

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Only trusted callers (the scheduler) may run the cleanup.
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const sweep = await supabase.rpc("enqueue_unreferenced_storage_objects");
  if (sweep.error) {
    console.error("Unreferenced object sweep failed:", sweep.error.message);
  }

  const { data, error } = await supabase
    .from("storage_cleanup_queue")
    .select("id, bucket, path, attempts")
    .is("processed_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const byBucket = new Map<string, QueueRow[]>();
  for (const row of (data ?? []) as QueueRow[]) {
    byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row]);
  }

  let processed = 0;
  let failed = 0;

  for (const [bucket, rows] of byBucket) {
    // Removing a missing object succeeds, so retries are safe.
    const { error: removeError } = await supabase.storage
      .from(bucket)
      .remove(rows.map((row) => row.path));

    for (const row of rows) {
      const { error: updateError } = await supabase
        .from("storage_cleanup_queue")
        .update(
          removeError
            ? { attempts: row.attempts + 1, last_error: removeError.message }
            : { processed_at: new Date().toISOString(), last_error: null },
        )
        .eq("id", row.id);

      if (removeError || updateError) {
        failed++;
      } else {
        processed++;
      }
    }
  }

  return Response.json({
    processed,
    failed,
    queuedBySweep: sweep.error ? null : sweep.data,
  });
});
