// Storage policy, image-path validation, and cleanup-queue tests against a
// locally running Supabase stack.
//
// Prerequisites: `supabase start` and `supabase db reset` (applies migrations
// and the seed, which creates the private image buckets).
//
// Run: npm run test:storage
//
// The tests refuse to run against a non-local API URL because they upload and
// delete data.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const PASSWORD = "neighbor-demo";
const ALEX = "10000000-0000-0000-0000-000000000001"; // community owner
const JAMIE = "10000000-0000-0000-0000-000000000002"; // member
const COMMUNITY = "20000000-0000-0000-0000-000000000001";
const DRILL = "30000000-0000-0000-0000-000000000001"; // Alex's
const OUTSIDER_EMAIL = "storage-outsider@example.com";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const upload = { contentType: "image/png", upsert: false };

function loadConfig() {
  let url = process.env.SUPABASE_API_URL ?? "http://127.0.0.1:54321";
  let anonKey = process.env.SUPABASE_ANON_KEY;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!anonKey || !serviceKey) {
    const out = execSync("npx supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const env = Object.fromEntries(
      out
        .split(/\r?\n/)
        .map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => [m[1], m[2]]),
    );
    url = process.env.SUPABASE_API_URL ?? env.API_URL ?? url;
    anonKey ??= env.ANON_KEY ?? env.PUBLISHABLE_KEY;
    serviceKey ??= env.SERVICE_ROLE_KEY ?? env.SECRET_KEY;
  }
  if (!anonKey || !serviceKey) {
    throw new Error("Could not determine local Supabase anon/service keys.");
  }
  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(host)) {
    throw new Error(`Refusing to run storage tests against non-local URL ${url}`);
  }
  return { url, anonKey, serviceKey };
}

const config = loadConfig();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(config.url, config.serviceKey, clientOptions);

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(config.url, config.anonKey, clientOptions);
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  assert.ifError(error);
  return client;
}

async function put(client: SupabaseClient, bucket: string, path: string) {
  return client.storage.from(bucket).upload(path, PNG, upload);
}

async function pendingQueue(bucket: string, path: string) {
  const { data, error } = await admin
    .from("storage_cleanup_queue")
    .select("id, reason, processed_at")
    .eq("bucket", bucket)
    .eq("path", path);
  assert.ifError(error);
  return data ?? [];
}

describe("storage policies and image consistency (local Supabase)", () => {
  let alex: SupabaseClient;
  let jamie: SupabaseClient;
  let outsider: SupabaseClient;
  let outsiderId: string;

  const stored: { bucket: string; path: string }[] = [];
  const createdItems: string[] = [];
  const createdCommunities: string[] = [];
  const track = (bucket: string, path: string) => stored.push({ bucket, path });

  before(async () => {
    [alex, jamie] = await Promise.all([signIn("alex@example.com"), signIn("jamie@example.com")]);

    const { data, error } = await admin.auth.admin.createUser({
      email: OUTSIDER_EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((u) => u.email === OUTSIDER_EMAIL);
      assert.ok(existing, `could not create outsider: ${error.message}`);
      outsiderId = existing.id;
    } else {
      outsiderId = data.user.id;
    }
    outsider = await signIn(OUTSIDER_EMAIL);
  });

  after(async () => {
    for (const id of createdItems) await admin.from("items").delete().eq("id", id);
    for (const id of createdCommunities) await admin.from("communities").delete().eq("id", id);
    for (const { bucket, path } of stored) {
      await admin.storage.from(bucket).remove([path]);
    }
    await admin.from("storage_cleanup_queue").delete().like("reason", "%");
    await admin.auth.admin.deleteUser(outsiderId);
  });

  describe("buckets", () => {
    it("the three image buckets exist and are private", async () => {
      const { data, error } = await admin.storage.listBuckets();
      assert.ifError(error);
      for (const name of ["profile-pictures", "item-images", "community-images"]) {
        const bucket = data.find((b) => b.id === name);
        assert.ok(bucket, `missing bucket ${name}`);
        assert.equal(bucket.public, false);
      }
    });
  });

  describe("profile-pictures policies", () => {
    it("users can upload only into their own folder", async () => {
      const own = `${ALEX}/policy-${Date.now()}.png`;
      assert.ifError((await put(alex, "profile-pictures", own)).error);
      track("profile-pictures", own);

      const other = `${ALEX}/other-${Date.now()}.png`;
      assert.ok((await put(jamie, "profile-pictures", other)).error);
    });

    it("authenticated members can read any profile picture; anonymous users cannot", async () => {
      const path = `${ALEX}/read-${Date.now()}.png`;
      assert.ifError((await put(alex, "profile-pictures", path)).error);
      track("profile-pictures", path);

      assert.ifError((await jamie.storage.from("profile-pictures").download(path)).error);

      const anon = createClient(config.url, config.anonKey, clientOptions);
      assert.ok((await anon.storage.from("profile-pictures").download(path)).error);
    });

    it("users cannot delete another user's picture", async () => {
      const path = `${ALEX}/delete-${Date.now()}.png`;
      assert.ifError((await put(alex, "profile-pictures", path)).error);
      track("profile-pictures", path);

      await jamie.storage.from("profile-pictures").remove([path]);
      const { data } = await admin.storage.from("profile-pictures").list(ALEX);
      assert.ok(data?.some((f) => `${ALEX}/${f.name}` === path), "file was deleted by another user");
    });
  });

  describe("item-images policies", () => {
    it("owners can upload into {owner}/{item}/; others cannot", async () => {
      const path = `${ALEX}/${DRILL}/policy-${Date.now()}.png`;
      assert.ifError((await put(alex, "item-images", path)).error);
      track("item-images", path);

      assert.ok((await put(jamie, "item-images", `${ALEX}/${DRILL}/nope-${Date.now()}.png`)).error);
    });

    it("rejects uploads that are not inside an item folder", async () => {
      assert.ok((await put(alex, "item-images", `${ALEX}/loose-${Date.now()}.png`)).error);
    });

    it("community members can view item images; outsiders cannot", async () => {
      const path = `${ALEX}/${DRILL}/view-${Date.now()}.png`;
      assert.ifError((await put(alex, "item-images", path)).error);
      track("item-images", path);

      assert.ifError((await jamie.storage.from("item-images").download(path)).error);
      assert.ok((await outsider.storage.from("item-images").download(path)).error);
    });
  });

  describe("community-images policies", () => {
    it("owner can upload to an existing community folder; members cannot", async () => {
      const path = `${COMMUNITY}/policy-${Date.now()}.png`;
      assert.ifError((await put(alex, "community-images", path)).error);
      track("community-images", path);

      assert.ok((await put(jamie, "community-images", `${COMMUNITY}/nope-${Date.now()}.png`)).error);
    });

    it("a folder for a not-yet-created community id can be uploaded to", async () => {
      const path = `${crypto.randomUUID()}/pre-${Date.now()}.png`;
      assert.ifError((await put(jamie, "community-images", path)).error);
      track("community-images", path);
    });
  });

  describe("image path validation in RPCs", () => {
    it("update_my_profile accepts an uploaded avatar and rejects bad paths", async () => {
      const path = `${JAMIE}/avatar-${Date.now()}.png`;
      assert.ifError((await put(jamie, "profile-pictures", path)).error);
      track("profile-pictures", path);

      const ok = await jamie.rpc("update_my_profile", { p_data: { avatar_path: path } });
      assert.ifError(ok.error);
      assert.equal(ok.data.avatar_path, path);

      const otherFolder = await jamie.rpc("update_my_profile", {
        p_data: { avatar_path: `${ALEX}/whatever.png` },
      });
      assert.ok(otherFolder.error);

      const missing = await jamie.rpc("update_my_profile", {
        p_data: { avatar_path: `${JAMIE}/does-not-exist.png` },
      });
      assert.ok(missing.error);

      const traversal = await jamie.rpc("update_my_profile", {
        p_data: { avatar_path: `${JAMIE}/../${ALEX}/x.png` },
      });
      assert.ok(traversal.error);
    });

    it("update_my_profile rejects a file uploaded by someone else", async () => {
      const path = `${ALEX}/theirs-${Date.now()}.png`;
      assert.ifError((await put(alex, "profile-pictures", path)).error);
      track("profile-pictures", path);

      const res = await jamie.rpc("update_my_profile", { p_data: { avatar_path: path } });
      assert.ok(res.error);
    });

    it("create_item with a client id and a pre-uploaded image", async () => {
      const id = crypto.randomUUID();
      const path = `${ALEX}/${id}/main-${Date.now()}.png`;
      assert.ifError((await put(alex, "item-images", path)).error);
      track("item-images", path);

      const created = await alex.rpc("create_item", {
        p_data: { id, community_id: COMMUNITY, name: "Storage test item", image_path: path },
      });
      assert.ifError(created.error);
      createdItems.push(created.data.id);
      assert.equal(created.data.id, id);
      assert.equal(created.data.image_path, path);
    });

    it("create_item rejects an image from another item's folder or a missing file", async () => {
      const id = crypto.randomUUID();
      const wrongFolder = `${ALEX}/${DRILL}/steal-${Date.now()}.png`;
      assert.ifError((await put(alex, "item-images", wrongFolder)).error);
      track("item-images", wrongFolder);

      const wrong = await alex.rpc("create_item", {
        p_data: { id, community_id: COMMUNITY, name: "Bad", image_path: wrongFolder },
      });
      assert.ok(wrong.error);

      const missing = await alex.rpc("create_item", {
        p_data: { id, community_id: COMMUNITY, name: "Bad", image_path: `${ALEX}/${id}/none.png` },
      });
      assert.ok(missing.error);
    });

    it("create_item without an id still works", async () => {
      const created = await alex.rpc("create_item", {
        p_data: { community_id: COMMUNITY, name: "No id item" },
      });
      assert.ifError(created.error);
      createdItems.push(created.data.id);
      assert.ok(created.data.id);
      assert.equal(created.data.image_path, null);
    });

    it("update_item validates the image path against the item folder", async () => {
      const created = await alex.rpc("create_item", {
        p_data: { community_id: COMMUNITY, name: "Update image item" },
      });
      assert.ifError(created.error);
      const itemId = created.data.id as string;
      createdItems.push(itemId);

      const path = `${ALEX}/${itemId}/new-${Date.now()}.png`;
      assert.ifError((await put(alex, "item-images", path)).error);
      track("item-images", path);

      const ok = await alex.rpc("update_item", { p_item_id: itemId, p_data: { image_path: path } });
      assert.ifError(ok.error);
      assert.equal(ok.data.image_path, path);

      const bad = await alex.rpc("update_item", {
        p_item_id: itemId,
        p_data: { image_path: `${ALEX}/${DRILL}/other.png` },
      });
      assert.ok(bad.error);
    });

    it("create_community with a client id and pre-uploaded avatar; update validates the folder", async () => {
      const id = crypto.randomUUID();
      const path = `${id}/avatar-${Date.now()}.png`;
      assert.ifError((await put(alex, "community-images", path)).error);
      track("community-images", path);

      const created = await alex.rpc("create_community", {
        p_data: { id, name: `Storage community ${id}`, avatar_path: path },
      });
      assert.ifError(created.error);
      createdCommunities.push(id);
      assert.equal(created.data.id, id);
      assert.equal(created.data.avatar_path, path);

      const bad = await alex.rpc("update_community", {
        p_community_id: id,
        p_data: { avatar_path: `${COMMUNITY}/other.png` },
      });
      assert.ok(bad.error);
    });

    it("an image path can be cleared with null", async () => {
      const created = await alex.rpc("create_item", {
        p_data: { community_id: COMMUNITY, name: "Clear image item" },
      });
      assert.ifError(created.error);
      createdItems.push(created.data.id);

      const cleared = await alex.rpc("update_item", {
        p_item_id: created.data.id,
        p_data: { image_path: null },
      });
      assert.ifError(cleared.error);
      assert.equal(cleared.data.image_path, null);
    });
  });

  describe("cleanup queue", () => {
    it("clients cannot read or write the queue", async () => {
      const read = await alex.from("storage_cleanup_queue").select("id");
      assert.ok(read.error || (read.data ?? []).length === 0);

      const write = await alex
        .from("storage_cleanup_queue")
        .insert({ bucket: "item-images", path: "x", reason: "test" });
      assert.ok(write.error);
    });

    it("clients cannot call the unreferenced-object sweep", async () => {
      const res = await alex.rpc("enqueue_unreferenced_storage_objects");
      assert.ok(res.error);
    });

    it("replacing an image queues the old path", async () => {
      const created = await alex.rpc("create_item", {
        p_data: { community_id: COMMUNITY, name: "Replace image item" },
      });
      assert.ifError(created.error);
      const itemId = created.data.id as string;
      createdItems.push(itemId);

      const first = `${ALEX}/${itemId}/first-${Date.now()}.png`;
      const second = `${ALEX}/${itemId}/second-${Date.now()}.png`;
      for (const p of [first, second]) {
        assert.ifError((await put(alex, "item-images", p)).error);
        track("item-images", p);
      }

      assert.ifError((await alex.rpc("update_item", { p_item_id: itemId, p_data: { image_path: first } })).error);
      assert.equal((await pendingQueue("item-images", first)).length, 0);

      assert.ifError((await alex.rpc("update_item", { p_item_id: itemId, p_data: { image_path: second } })).error);
      const queued = await pendingQueue("item-images", first);
      assert.equal(queued.length, 1);
      assert.equal(queued[0].reason, "image_replaced");
      assert.equal((await pendingQueue("item-images", second)).length, 0);
    });

    it("updating without changing the image queues nothing", async () => {
      const created = await alex.rpc("create_item", {
        p_data: { community_id: COMMUNITY, name: "Stable image item" },
      });
      assert.ifError(created.error);
      const itemId = created.data.id as string;
      createdItems.push(itemId);

      const path = `${ALEX}/${itemId}/stable-${Date.now()}.png`;
      assert.ifError((await put(alex, "item-images", path)).error);
      track("item-images", path);
      assert.ifError((await alex.rpc("update_item", { p_item_id: itemId, p_data: { image_path: path } })).error);
      assert.ifError((await alex.rpc("update_item", { p_item_id: itemId, p_data: { name: "Renamed" } })).error);

      assert.equal((await pendingQueue("item-images", path)).length, 0);
    });

    it("deleting an item queues its image", async () => {
      const id = crypto.randomUUID();
      const path = `${ALEX}/${id}/delete-${Date.now()}.png`;
      assert.ifError((await put(alex, "item-images", path)).error);
      track("item-images", path);
      const created = await alex.rpc("create_item", {
        p_data: { id, community_id: COMMUNITY, name: "Delete image item", image_path: path },
      });
      assert.ifError(created.error);

      assert.ifError((await alex.rpc("delete_item", { p_item_id: id })).error);
      const queued = await pendingQueue("item-images", path);
      assert.equal(queued.length, 1);
      assert.equal(queued[0].reason, "row_deleted");
    });

    it("deleting a community queues its avatar", async () => {
      const id = crypto.randomUUID();
      const path = `${id}/avatar-${Date.now()}.png`;
      assert.ifError((await put(alex, "community-images", path)).error);
      track("community-images", path);
      assert.ifError(
        (await alex.rpc("create_community", {
          p_data: { id, name: `Delete community ${id}`, avatar_path: path },
        })).error,
      );

      assert.ifError((await alex.rpc("delete_community", { p_community_id: id })).error);
      assert.equal((await pendingQueue("community-images", path)).length, 1);
    });

    it("the sweep queues unreferenced files but not referenced ones", async () => {
      const orphan = `${ALEX}/orphan-${Date.now()}.png`;
      const referenced = `${JAMIE}/referenced-${Date.now()}.png`;
      assert.ifError((await put(alex, "profile-pictures", orphan)).error);
      assert.ifError((await put(jamie, "profile-pictures", referenced)).error);
      track("profile-pictures", orphan);
      track("profile-pictures", referenced);
      assert.ifError(
        (await jamie.rpc("update_my_profile", { p_data: { avatar_path: referenced } })).error,
      );

      // A zero grace period makes the freshly uploaded files eligible.
      const swept = await admin.rpc("enqueue_unreferenced_storage_objects", {
        grace_period: "0 seconds",
      });
      assert.ifError(swept.error);

      const queuedOrphan = await pendingQueue("profile-pictures", orphan);
      assert.equal(queuedOrphan.length, 1);
      assert.equal(queuedOrphan[0].reason, "unreferenced");
      assert.equal((await pendingQueue("profile-pictures", referenced)).length, 0);

      // Running the sweep again must not duplicate pending entries.
      assert.ifError(
        (await admin.rpc("enqueue_unreferenced_storage_objects", { grace_period: "0 seconds" })).error,
      );
      assert.equal((await pendingQueue("profile-pictures", orphan)).length, 1);
    });
  });
});
