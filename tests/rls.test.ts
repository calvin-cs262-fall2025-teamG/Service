// RLS policy tests against a locally running Supabase stack.
//
// Prerequisites: `supabase start` is running and the database has been reset
// (`supabase db reset`) so migrations and supabase/seed.sql are applied.
//
// Run: npm run test:rls
//
// Keys are read from SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (and
// SUPABASE_API_URL), falling back to `npx supabase status -o env`. The tests
// refuse to run against a non-local API URL because they create/delete data.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const PASSWORD = "neighbor-demo";

const ALEX = "10000000-0000-0000-0000-000000000001"; // community owner
const JAMIE = "10000000-0000-0000-0000-000000000002"; // member
const MORGAN = "10000000-0000-0000-0000-000000000003"; // member
const COMMUNITY = "20000000-0000-0000-0000-000000000001";
const DRILL = "30000000-0000-0000-0000-000000000001"; // Alex's
const CHAIRS = "30000000-0000-0000-0000-000000000002"; // Jamie's
const TENT = "30000000-0000-0000-0000-000000000003"; // Morgan's
const REQ_JAMIE_DRILL = "40000000-0000-0000-0000-000000000001";
const REQ_ALEX_TENT = "40000000-0000-0000-0000-000000000002";
const MSG_IDS = [
  "50000000-0000-0000-0000-000000000001",
  "50000000-0000-0000-0000-000000000002",
  "50000000-0000-0000-0000-000000000003",
];

const OUTSIDER_EMAIL = "rls-outsider@example.com";

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
    throw new Error(`Refusing to run RLS tests against non-local URL ${url}`);
  }
  return { url, anonKey, serviceKey };
}

const config = loadConfig();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

const admin = createClient(config.url, config.serviceKey, clientOptions);
const anon = createClient(config.url, config.anonKey, clientOptions);

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(config.url, config.anonKey, clientOptions);
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  assert.ifError(error);
  return client;
}

// Asserts a write was rejected by RLS/grants (error), or silently filtered
// (no rows affected) -- both mean the policy blocked it.
function assertDenied(res: { data: unknown; error: unknown }) {
  if (res.error) return;
  assert.ok(
    Array.isArray(res.data) && res.data.length === 0,
    `expected write to be blocked, got ${JSON.stringify(res.data)}`,
  );
}

function assertRlsError(res: { error: { code?: string } | null }) {
  assert.ok(res.error, "expected an error");
  assert.ok(
    ["42501", "PGRST301"].includes(res.error.code ?? ""),
    `expected permission/RLS error, got ${JSON.stringify(res.error)}`,
  );
}

async function ids(
  q: PromiseLike<{ data: { id: string }[] | null; error: unknown }>,
) {
  const { data, error } = await q;
  assert.ifError(error);
  return (data ?? []).map((r) => r.id).sort();
}

describe("RLS policies (local Supabase)", () => {
  let alex: SupabaseClient;
  let jamie: SupabaseClient;
  let morgan: SupabaseClient;
  let outsider: SupabaseClient;
  let outsiderId: string;

  const createdCommunities: string[] = [];
  const createdItems: string[] = [];
  const createdRequests: string[] = [];

  before(async () => {
    // Remove leftovers from an aborted run.
    const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const stale = users?.users.find((u) => u.email === OUTSIDER_EMAIL);
    if (stale) await admin.auth.admin.deleteUser(stale.id);

    const { data, error } = await admin.auth.admin.createUser({
      email: OUTSIDER_EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Riley Outsider" },
    });
    assert.ifError(error);
    outsiderId = data.user.id;

    [alex, jamie, morgan, outsider] = await Promise.all([
      signIn("alex@example.com"),
      signIn("jamie@example.com"),
      signIn("morgan@example.com"),
      signIn(OUTSIDER_EMAIL),
    ]);
  });

  after(async () => {
    if (createdRequests.length) {
      await admin.from("borrowing_requests").delete().in("id", createdRequests);
    }
    if (createdItems.length) {
      await admin.from("items").delete().in("id", createdItems);
    }
    if (createdCommunities.length) {
      await admin.from("communities").delete().in("id", createdCommunities);
    }
    // Cascades to profile and memberships.
    if (outsiderId) await admin.auth.admin.deleteUser(outsiderId);
  });

  describe("anonymous role", () => {
    for (const table of [
      "profiles",
      "items",
      "borrowing_requests",
      "borrowing_history",
      "messages",
      "communities",
      "community_members",
    ]) {
      it(`cannot read ${table}`, async () => {
        const res = await anon.from(table).select("*");
        if (!res.error) assert.equal(res.data.length, 0);
      });
    }

    it("cannot insert items", async () => {
      const res = await anon
        .from("items")
        .insert({ owner_id: ALEX, community_id: COMMUNITY, name: "x" });
      assert.ok(res.error);
    });
  });

  describe("profiles", () => {
    it("authenticated users can view all profiles", async () => {
      const found = await ids(jamie.from("profiles").select("id"));
      for (const id of [ALEX, JAMIE, MORGAN]) assert.ok(found.includes(id));
    });

    it("a user can update their own profile", async () => {
      const { data, error } = await jamie
        .from("profiles")
        .update({ display_name: "Jamie Chen" })
        .eq("id", JAMIE)
        .select();
      assert.ifError(error);
      assert.equal(data?.length, 1);
    });

    it("a user cannot update someone else's profile", async () => {
      const res = await jamie
        .from("profiles")
        .update({ display_name: "Hacked" })
        .eq("id", ALEX)
        .select();
      assertDenied(res);
      const { data } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", ALEX)
        .single();
      assert.equal(data?.display_name, "Alex Rivera");
    });

    it("a user cannot insert a profile for another user", async () => {
      const res = await jamie
        .from("profiles")
        .insert({ id: crypto.randomUUID(), display_name: "Fake" });
      assertRlsError(res);
    });

    it("profiles cannot be deleted by clients", async () => {
      const res = await jamie.from("profiles").delete().eq("id", JAMIE).select();
      assertDenied(res);
      const { data } = await admin.from("profiles").select("id").eq("id", JAMIE);
      assert.equal(data?.length, 1);
    });
  });

  describe("items", () => {
    it("community members see all items in their community", async () => {
      for (const client of [alex, jamie, morgan]) {
        assert.deepEqual(
          await ids(client.from("items").select("id")),
          [DRILL, CHAIRS, TENT].sort(),
        );
      }
    });

    it("non-members cannot see community items", async () => {
      assert.deepEqual(await ids(outsider.from("items").select("id")), []);
    });

    it("pending members cannot see community items", async () => {
      const { error } = await outsider
        .from("community_members")
        .insert({ community_id: COMMUNITY, user_id: outsiderId });
      assert.ifError(error);
      try {
        assert.deepEqual(await ids(outsider.from("items").select("id")), []);
      } finally {
        await admin
          .from("community_members")
          .delete()
          .eq("community_id", COMMUNITY)
          .eq("user_id", outsiderId);
      }
    });

    it("a user can create, update and delete their own item", async () => {
      const ins = await jamie
        .from("items")
        .insert({ owner_id: JAMIE, community_id: COMMUNITY, name: "RLS ladder" })
        .select()
        .single();
      assert.ifError(ins.error);
      const id = ins.data!.id as string;
      createdItems.push(id);

      const upd = await jamie
        .from("items")
        .update({ description: "tall" })
        .eq("id", id)
        .select();
      assert.ifError(upd.error);
      assert.equal(upd.data?.length, 1);

      const del = await jamie.from("items").delete().eq("id", id).select();
      assert.ifError(del.error);
      assert.equal(del.data?.length, 1);
    });

    it("a user cannot create an item owned by someone else", async () => {
      const res = await jamie
        .from("items")
        .insert({ owner_id: ALEX, community_id: COMMUNITY, name: "Spoof" });
      assertRlsError(res);
    });

    it("a user cannot reassign their item to another owner", async () => {
      const res = await jamie
        .from("items")
        .update({ owner_id: ALEX })
        .eq("id", CHAIRS)
        .select();
      assertRlsError(res);
    });

    it("a user cannot update or delete another user's item", async () => {
      assertDenied(
        await jamie.from("items").update({ name: "Mine" }).eq("id", DRILL).select(),
      );
      assertDenied(await jamie.from("items").delete().eq("id", DRILL).select());
      const { data } = await admin.from("items").select("name").eq("id", DRILL);
      assert.equal(data?.[0]?.name, "Cordless drill");
    });
  });

  describe("borrowing_requests", () => {
    it("requesters and item owners can view requests; others cannot", async () => {
      // Jamie requested the drill; Alex owns the drill and requested the tent.
      assert.deepEqual(
        await ids(jamie.from("borrowing_requests").select("id")),
        [REQ_JAMIE_DRILL],
      );
      assert.deepEqual(
        await ids(alex.from("borrowing_requests").select("id")),
        [REQ_JAMIE_DRILL, REQ_ALEX_TENT].sort(),
      );
      assert.deepEqual(
        await ids(morgan.from("borrowing_requests").select("id")),
        [REQ_ALEX_TENT],
      );
      assert.deepEqual(
        await ids(outsider.from("borrowing_requests").select("id")),
        [],
      );
    });

    it("users can create requests only as themselves", async () => {
      const bad = await jamie
        .from("borrowing_requests")
        .insert({ item_id: TENT, requester_id: ALEX });
      assertRlsError(bad);

      const ok = await jamie
        .from("borrowing_requests")
        .insert({ item_id: TENT, requester_id: JAMIE })
        .select()
        .single();
      assert.ifError(ok.error);
      createdRequests.push(ok.data!.id as string);
    });

    it("item owner can approve; requester cannot approve their own request", async () => {
      const created = await morgan
        .from("borrowing_requests")
        .insert({ item_id: CHAIRS, requester_id: MORGAN })
        .select()
        .single();
      assert.ifError(created.error);
      const id = created.data!.id as string;
      createdRequests.push(id);

      assertRlsError(
        await morgan
          .from("borrowing_requests")
          .update({ status: "approved" })
          .eq("id", id)
          .select(),
      );

      // Unrelated user cannot touch it.
      assertDenied(
        await alex
          .from("borrowing_requests")
          .update({ status: "approved" })
          .eq("id", id)
          .select(),
      );

      const approve = await jamie // Jamie owns the chairs
        .from("borrowing_requests")
        .update({ status: "approved" })
        .eq("id", id)
        .select();
      assert.ifError(approve.error);
      assert.equal(approve.data?.[0]?.status, "approved");
    });

    it("requester can cancel their own request", async () => {
      const created = await morgan
        .from("borrowing_requests")
        .insert({ item_id: DRILL, requester_id: MORGAN })
        .select()
        .single();
      assert.ifError(created.error);
      const id = created.data!.id as string;
      createdRequests.push(id);

      const cancel = await morgan
        .from("borrowing_requests")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select();
      assert.ifError(cancel.error);
      assert.equal(cancel.data?.[0]?.status, "cancelled");
    });

    it("requests cannot be deleted by clients", async () => {
      const res = await jamie
        .from("borrowing_requests")
        .delete()
        .eq("id", REQ_JAMIE_DRILL)
        .select();
      assertDenied(res);
    });
  });

  describe("borrowing_history", () => {
    it("requester and item owner can view history; others cannot", async () => {
      // History belongs to REQ_ALEX_TENT (Alex requester, Morgan owner).
      for (const client of [alex, morgan]) {
        const { data, error } = await client
          .from("borrowing_history")
          .select("request_id");
        assert.ifError(error);
        assert.deepEqual(
          data?.map((r) => r.request_id),
          [REQ_ALEX_TENT],
        );
      }
      for (const client of [jamie, outsider]) {
        const { data, error } = await client
          .from("borrowing_history")
          .select("request_id");
        assert.ifError(error);
        assert.equal(data?.length, 0);
      }
    });

    it("clients cannot write history", async () => {
      assertRlsError(
        await alex
          .from("borrowing_history")
          .insert({ request_id: REQ_JAMIE_DRILL }),
      );
      assertRlsError(
        await alex
          .from("borrowing_history")
          .update({ returned_at: new Date().toISOString() })
          .eq("request_id", REQ_ALEX_TENT),
      );
      assertRlsError(
        await alex
          .from("borrowing_history")
          .delete()
          .eq("request_id", REQ_ALEX_TENT),
      );
    });
  });

  describe("messages", () => {
    it("only sender and receiver can view a message", async () => {
      assert.deepEqual(await ids(alex.from("messages").select("id")), [...MSG_IDS].sort());
      assert.deepEqual(
        await ids(jamie.from("messages").select("id")),
        [MSG_IDS[0], MSG_IDS[1]].sort(),
      );
      assert.deepEqual(await ids(morgan.from("messages").select("id")), [MSG_IDS[2]]);
      assert.deepEqual(await ids(outsider.from("messages").select("id")), []);
    });

    it("users can send messages only as themselves", async () => {
      assertRlsError(
        await jamie
          .from("messages")
          .insert({ sender_id: ALEX, receiver_id: JAMIE, content: "spoof" }),
      );

      const ok = await jamie
        .from("messages")
        .insert({ sender_id: JAMIE, receiver_id: MORGAN, content: "rls hello" })
        .select()
        .single();
      assert.ifError(ok.error);
      await admin.from("messages").delete().eq("id", ok.data!.id);
    });

    it("messages cannot be edited or deleted by clients", async () => {
      assertRlsError(
        await jamie
          .from("messages")
          .update({ content: "edited" })
          .eq("id", MSG_IDS[0]),
      );
      assertRlsError(await jamie.from("messages").delete().eq("id", MSG_IDS[0]));
    });
  });

  describe("communities", () => {
    it("authenticated users can view communities", async () => {
      assert.ok((await ids(outsider.from("communities").select("id"))).includes(COMMUNITY));
    });

    it("users can create communities only as owner, and get an owner membership", async () => {
      assertRlsError(
        await jamie
          .from("communities")
          .insert({ name: "RLS spoof community", owner_id: ALEX }),
      );

      const ok = await jamie
        .from("communities")
        .insert({ name: "RLS test community", owner_id: JAMIE })
        .select()
        .single();
      assert.ifError(ok.error);
      const id = ok.data!.id as string;
      createdCommunities.push(id);

      const { data } = await jamie
        .from("community_members")
        .select("role,status")
        .eq("community_id", id)
        .eq("user_id", JAMIE)
        .single();
      assert.deepEqual(data, { role: "owner", status: "active" });
    });

    it("only the owner can update or delete a community", async () => {
      assertDenied(
        await jamie.from("communities").update({ name: "Taken" }).eq("id", COMMUNITY).select(),
      );
      assertDenied(await jamie.from("communities").delete().eq("id", COMMUNITY).select());
      const { data } = await admin.from("communities").select("name").eq("id", COMMUNITY);
      assert.equal(data?.[0]?.name, "Maple Street Neighbors");

      const id = createdCommunities[0];
      assert.ok(id, "depends on the community created above");
      const upd = await jamie
        .from("communities")
        .update({ name: "RLS renamed community" })
        .eq("id", id)
        .select();
      assert.ifError(upd.error);
      assert.equal(upd.data?.length, 1);
    });

    it("owner cannot transfer ownership to another user via update", async () => {
      const id = createdCommunities[0];
      assertRlsError(
        await jamie.from("communities").update({ owner_id: ALEX }).eq("id", id),
      );
    });
  });

  describe("community_members", () => {
    it("members see memberships of their community; outsiders do not", async () => {
      for (const client of [alex, jamie, morgan]) {
        const { data, error } = await client
          .from("community_members")
          .select("user_id")
          .eq("community_id", COMMUNITY);
        assert.ifError(error);
        assert.equal(data?.length, 3);
      }
      const { data } = await outsider
        .from("community_members")
        .select("user_id")
        .eq("community_id", COMMUNITY);
      assert.equal(data?.length, 0);
    });

    it("users may only request membership as pending members, as themselves", async () => {
      const base = { community_id: COMMUNITY };
      assertRlsError(
        await outsider
          .from("community_members")
          .insert({ ...base, user_id: outsiderId, status: "active" }),
      );
      assertRlsError(
        await outsider
          .from("community_members")
          .insert({ ...base, user_id: outsiderId, role: "admin" }),
      );
      assertRlsError(
        await outsider
          .from("community_members")
          .insert({ ...base, user_id: JAMIE, role: "member", status: "pending" }),
      );
    });

    it("join request lifecycle: pending -> approved by owner, regular members cannot approve", async () => {
      const join = await outsider
        .from("community_members")
        .insert({ community_id: COMMUNITY, user_id: outsiderId });
      assert.ifError(join.error);

      const match = { community_id: COMMUNITY, user_id: outsiderId };

      // Requester cannot self-approve.
      assertDenied(
        await outsider
          .from("community_members")
          .update({ status: "active" })
          .match(match)
          .select(),
      );
      // A regular member cannot approve.
      assertDenied(
        await jamie
          .from("community_members")
          .update({ status: "active" })
          .match(match)
          .select(),
      );
      // The owner can.
      const approve = await alex
        .from("community_members")
        .update({ status: "active" })
        .match(match)
        .select();
      assert.ifError(approve.error);
      assert.equal(approve.data?.[0]?.status, "active");

      // Now an active member: sees items.
      assert.deepEqual(
        await ids(outsider.from("items").select("id")),
        [DRILL, CHAIRS, TENT].sort(),
      );

      // Members can leave on their own.
      const leave = await outsider
        .from("community_members")
        .delete()
        .match(match)
        .select();
      assert.ifError(leave.error);
      assert.equal(leave.data?.length, 1);
    });

    it("regular members cannot remove other members; owner can", async () => {
      assertDenied(
        await jamie
          .from("community_members")
          .delete()
          .match({ community_id: COMMUNITY, user_id: MORGAN })
          .select(),
      );
      const { data } = await admin
        .from("community_members")
        .select("user_id")
        .match({ community_id: COMMUNITY, user_id: MORGAN });
      assert.equal(data?.length, 1);

      // Owner removal verified on a temporary membership.
      await admin
        .from("community_members")
        .insert({ community_id: COMMUNITY, user_id: outsiderId, status: "active" });
      const removed = await alex
        .from("community_members")
        .delete()
        .match({ community_id: COMMUNITY, user_id: outsiderId })
        .select();
      assert.ifError(removed.error);
      assert.equal(removed.data?.length, 1);
    });
  });
});
