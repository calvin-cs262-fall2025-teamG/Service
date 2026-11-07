// Tests the public RPC functions against a locally running Supabase stack.
//
// Prerequisites: `supabase start` and `supabase db reset`.
// Run: npm run test:database-functions
//
// Keys are read from SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (and
// SUPABASE_API_URL), falling back to `npx supabase status -o env`. This test
// refuses to run against a non-local URL because it creates and deletes data.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const PASSWORD = "neighbor-demo";
const ALEX_EMAIL = "alex@example.com";
const JAMIE_EMAIL = "jamie@example.com";
const MORGAN_EMAIL = "morgan@example.com";

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
        .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => [match[1], match[2]]),
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
    throw new Error(`Refusing to run database function tests against non-local URL ${url}`);
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

async function rpc<T>(
  client: SupabaseClient,
  functionName: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(functionName, args);
  assert.ifError(error);
  return data;
}

describe("database RPC functions (local Supabase)", () => {
  let alex: SupabaseClient;
  let jamie: SupabaseClient;
  let morgan: SupabaseClient;
  let communityId: string | undefined;
  let directMessageId: string | undefined;
  const createdItems: string[] = [];
  const createdCommunities: string[] = [];

  before(async () => {
    [alex, jamie, morgan] = await Promise.all([
      signIn(ALEX_EMAIL),
      signIn(JAMIE_EMAIL),
      signIn(MORGAN_EMAIL),
    ]);
  });

  after(async () => {
    if (createdItems.length) {
      const { error } = await admin.from("items").delete().in("id", createdItems);
      assert.ifError(error);
    }
    if (createdCommunities.length) {
      const { error } = await admin.from("communities").delete().in("id", createdCommunities);
      assert.ifError(error);
    }
    if (communityId) {
      // Use the service client for cleanup so a failed assertion does not leave
      // test-created memberships and messages behind.
      const { error } = await admin.from("communities").delete().eq("id", communityId);
      assert.ifError(error);
    }
    if (directMessageId) {
      const { error } = await admin.from("direct_messages").delete().eq("id", directMessageId);
      assert.ifError(error);
    }
  });

  it("supports profile, community, messaging, item, and borrowing workflows", async () => {
    const alexProfile = await rpc<{ id: string; display_name: string }>(
      alex,
      "get_my_profile",
    );
    assert.ok(alexProfile.id);
    assert.ok(alexProfile.display_name);
    assert.equal(
      (await rpc<{ id: string }>(jamie, "get_profile", { p_id: alexProfile.id })).id,
      alexProfile.id,
    );

    const renamedProfile = await rpc<{ display_name: string }>(alex, "update_my_profile", {
      p_data: { display_name: `${alexProfile.display_name} RPC test` },
    });
    assert.equal(renamedProfile.display_name, `${alexProfile.display_name} RPC test`);
    await rpc(alex, "update_my_profile", { p_data: { display_name: alexProfile.display_name } });

    const suffix = crypto.randomUUID();
    const community = await rpc<{ id: string }>(alex, "create_community", {
      p_data: { name: `RPC function test ${suffix}`, description: "Temporary test community" },
    });
    communityId = community.id;
    assert.ok(communityId);
    assert.equal((await rpc<{ id: string }>(alex, "get_community", { p_community_id: communityId })).id, communityId);
    assert.ok((await rpc<Array<{ id: string }>>(alex, "get_communities")).some((row) => row.id === communityId));
    assert.ok((await rpc<Array<{ id: string }>>(alex, "get_my_communities")).some((row) => row.id === communityId));

    await rpc(alex, "update_community", {
      p_community_id: communityId,
      p_data: { description: "Updated through RPC" },
    });

    const jamieMembership = await rpc<{ user_id: string; status: string }>(
      jamie,
      "request_join_community",
      { p_community_id: communityId },
    );
    assert.equal(jamieMembership.status, "pending");
    await rpc(morgan, "request_join_community", { p_community_id: communityId });

    const pending = await rpc<Array<{ user_id: string }>>(
      alex,
      "get_pending_community_members",
      { p_community_id: communityId },
    );
    assert.equal(pending.length, 2);
    const morganMembership = pending.find((row) => row.user_id !== jamieMembership.user_id);
    if (!morganMembership) {
      throw new Error("Morgan's pending community membership was not returned");
    }
    const declinedMembership = await rpc<{ status: string }>(alex, "decline_community_member", {
      p_community_id: communityId,
      p_user_id: morganMembership.user_id,
    });
    assert.equal(declinedMembership.status, "declined");
    await rpc(morgan, "request_join_community", { p_community_id: communityId });
    await rpc(alex, "approve_community_member", {
      p_community_id: communityId,
      p_user_id: jamieMembership.user_id,
    });
    await rpc(alex, "set_community_member_role", {
      p_community_id: communityId,
      p_user_id: jamieMembership.user_id,
      p_role: "admin",
    });
    assert.equal(await rpc<boolean>(jamie, "is_community_member", { target_community_id: communityId }), true);
    assert.equal(await rpc<boolean>(jamie, "is_community_admin", { target_community_id: communityId }), true);

    await rpc(jamie, "approve_community_member", {
      p_community_id: communityId,
      p_user_id: morganMembership.user_id,
    });
    assert.equal((await rpc<Array<{ user_id: string }>>(alex, "get_community_members", {
      p_community_id: communityId,
    })).length, 3);

    const item = await rpc<{ id: string; status: string }>(alex, "create_item", {
      p_data: {
        community_ids: [communityId],
        name: `RPC test item ${suffix}`,
        description: "Original description",
        category: "tools",
      },
    });
    createdItems.push(item.id);
    assert.equal(item.status, "available");
    assert.equal((await rpc<{ id: string }>(alex, "get_item", { p_item_id: item.id })).id, item.id);
    assert.ok((await rpc<Array<{ id: string }>>(alex, "get_items")).some((row) => row.id === item.id));
    assert.ok((await rpc<Array<{ id: string }>>(alex, "get_my_items")).some((row) => row.id === item.id));
    assert.ok((await rpc<Array<{ id: string }>>(jamie, "get_community_items", {
      p_community_id: communityId,
    })).some((row) => row.id === item.id));
    await rpc(alex, "update_item", {
      p_item_id: item.id,
      p_data: { description: "Updated description" },
    });

    const communityMessage = await rpc<{ id: string }>(alex, "create_community_message", {
      p_community_id: communityId,
      p_content: "Hello from RPC test",
      p_item_id: item.id,
    });
    const communityMessages = await rpc<Array<{ id: string }>>(jamie, "get_community_messages", {
      p_community_id: communityId,
      p_limit: 20,
    });
    assert.ok(communityMessages.some((message) => message.id === communityMessage.id));
    await rpc(alex, "delete_community_message", { p_message_id: communityMessage.id });

    const directMessage = await rpc<{ id: string }>(jamie, "create_direct_message", {
      p_receiver_id: alexProfile.id,
      p_content: "Hello from direct-message RPC test",
      p_item_id: item.id,
    });
    directMessageId = directMessage.id;
    assert.ok((await rpc<Array<{ id: string }>>(alex, "get_my_direct_messages"))
      .some((message) => message.id === directMessage.id));
    assert.ok((await rpc<Array<{ id: string }>>(alex, "get_direct_conversation", {
      p_other_user_id: jamieMembership.user_id,
    })).some((message) => message.id === directMessage.id));
    assert.ok((await rpc<Array<{ id: string }>>(jamie, "get_my_conversations"))
      .some((message) => message.id === directMessage.id));

    const borrowRequest = await rpc<{ id: string; status: string }>(
      jamie,
      "create_borrowing_request",
      { p_item_id: item.id },
    );
    assert.equal(borrowRequest.status, "pending");
    assert.equal((await rpc<{ id: string }>(jamie, "get_borrowing_request", {
      p_request_id: borrowRequest.id,
    })).id, borrowRequest.id);
    assert.ok((await rpc<Array<{ id: string }>>(jamie, "get_my_borrowing_requests"))
      .some((row) => row.id === borrowRequest.id));
    assert.ok((await rpc<Array<{ id: string }>>(alex, "get_incoming_borrowing_requests"))
      .some((row) => row.id === borrowRequest.id));
    assert.ok((await rpc<Array<{ id: string }>>(alex, "get_item_borrowing_requests", {
      p_item_id: item.id,
    })).some((row) => row.id === borrowRequest.id));

    await rpc(alex, "approve_borrowing_request", { p_request_id: borrowRequest.id });
    const history = await rpc<{ id: string; request_id: string; returned_at: string | null }>(
      jamie,
      "get_borrowing_history_by_request",
      { p_request_id: borrowRequest.id },
    );
    assert.equal(history.request_id, borrowRequest.id);
    assert.equal(history.returned_at, null);
    assert.ok((await rpc<Array<{ id: string }>>(jamie, "get_my_borrowing_history"))
      .some((row) => row.id === history.id));
    assert.ok((await rpc<Array<{ id: string }>>(alex, "get_item_borrowing_history", {
      p_item_id: item.id,
    })).some((row) => row.id === history.id));
    const returned = await rpc<{ returned_at: string | null }>(
      alex,
      "mark_item_returned",
      { p_request_id: borrowRequest.id },
    );
    assert.ok(returned.returned_at);

    const jamieItem = await rpc<{ id: string }>(jamie, "create_item", {
      p_data: { community_ids: [communityId], name: `RPC decline item ${suffix}` },
    });
    createdItems.push(jamieItem.id);
    const declineRequest = await rpc<{ id: string }>(alex, "create_borrowing_request", {
      p_item_id: jamieItem.id,
    });
    await rpc(jamie, "decline_borrowing_request", { p_request_id: declineRequest.id });

    const cancelRequest = await rpc<{ id: string }>(morgan, "create_borrowing_request", {
      p_item_id: jamieItem.id,
    });
    await rpc(morgan, "cancel_borrowing_request", { p_request_id: cancelRequest.id });

    await rpc(jamie, "remove_community_member", {
      p_community_id: communityId,
      p_user_id: morganMembership.user_id,
    });
    await rpc(jamie, "delete_item", { p_item_id: jamieItem.id });
    await rpc(jamie, "leave_community", { p_community_id: communityId });

    await rpc(alex, "delete_community", { p_community_id: communityId });
    communityId = undefined;
  });

  it("shares items across communities and removes listings when membership ends", async () => {
    const jamieId = (await rpc<{ id: string }>(jamie, "get_my_profile")).id;
    const morganId = (await rpc<{ id: string }>(morgan, "get_my_profile")).id;
    const first = await rpc<{ id: string }>(alex, "create_community", {
      p_data: { name: `Item sharing first ${crypto.randomUUID()}` },
    });
    createdCommunities.push(first.id);
    const second = await rpc<{ id: string }>(alex, "create_community", {
      p_data: { name: `Item sharing second ${crypto.randomUUID()}` },
    });
    createdCommunities.push(second.id);
    const unrelated = await rpc<{ id: string }>(morgan, "create_community", {
      p_data: { name: `Item sharing unrelated ${crypto.randomUUID()}` },
    });
    createdCommunities.push(unrelated.id);

    for (const id of [first.id, second.id]) {
      await rpc(jamie, "request_join_community", { p_community_id: id });
      await rpc(alex, "approve_community_member", { p_community_id: id, p_user_id: jamieId });
    }
    await rpc(morgan, "request_join_community", { p_community_id: first.id });
    await rpc(alex, "approve_community_member", {
      p_community_id: first.id,
      p_user_id: morganId,
    });
    await rpc(morgan, "request_join_community", { p_community_id: second.id });

    const item = await rpc<{ id: string }>(alex, "create_item", {
      p_data: { name: "Shared item", community_ids: [first.id, second.id] },
    });
    createdItems.push(item.id);
    const communityIds = async (client: SupabaseClient, itemId: string) =>
      (await rpc<string[]>(client, "get_item_community_ids", { p_item_id: itemId })).sort();
    assert.deepEqual(await communityIds(alex, item.id), [first.id, second.id].sort());
    assert.deepEqual(await communityIds(morgan, item.id), [first.id]);
    for (const id of [first.id, second.id]) {
      const items = await rpc<Array<{ id: string }>>(jamie, "get_community_items", {
        p_community_id: id,
      });
      assert.ok(items.some((row) => row.id === item.id));
    }

    const rejectedId = crypto.randomUUID();
    createdItems.push(rejectedId);
    const rejectedCreate = await alex.rpc("create_item", {
      p_data: { id: rejectedId, name: "Not shared", community_ids: [first.id, unrelated.id] },
    });
    assert.ok(rejectedCreate.error);
    assert.match(rejectedCreate.error.message, /Not a member of this community/);
    const rejectedUpdate = await alex.rpc("update_item", {
      p_item_id: item.id,
      p_data: { name: "Should not change", community_ids: [first.id, unrelated.id] },
    });
    assert.ok(rejectedUpdate.error);
    assert.match(rejectedUpdate.error.message, /Not a member of this community/);
    assert.equal((await rpc<{ name: string }>(alex, "get_item", { p_item_id: item.id })).name, "Shared item");
    assert.deepEqual(await communityIds(alex, item.id), [first.id, second.id].sort());
    const pendingId = crypto.randomUUID();
    createdItems.push(pendingId);
    const pendingCreate = await morgan.rpc("create_item", {
      p_data: { id: pendingId, name: "Pending membership", community_ids: [second.id] },
    });
    assert.ok(pendingCreate.error);
    assert.match(pendingCreate.error.message, /Not a member of this community/);

    await rpc(alex, "update_item", { p_item_id: item.id, p_data: { community_ids: [second.id] } });
    assert.deepEqual(await communityIds(alex, item.id), [second.id]);
    assert.equal((await rpc<Array<{ id: string }>>(morgan, "get_community_items", {
      p_community_id: first.id,
    })).some((row) => row.id === item.id), false);
    assert.ok((await morgan.rpc("create_borrowing_request", { p_item_id: item.id })).error);
    await rpc(alex, "update_item", { p_item_id: item.id, p_data: { community_ids: [] } });
    assert.deepEqual(await communityIds(alex, item.id), []);
    assert.equal((await rpc<{ id: string }>(alex, "get_item", { p_item_id: item.id })).id, item.id);
    await rpc(alex, "update_item", {
      p_item_id: item.id,
      p_data: { community_ids: [first.id, second.id] },
    });
    const request = await rpc<{ id: string }>(morgan, "create_borrowing_request", {
      p_item_id: item.id,
    });
    await rpc(morgan, "cancel_borrowing_request", { p_request_id: request.id });

    const jamieItem = await rpc<{ id: string }>(jamie, "create_item", {
      p_data: { name: "Member item", community_ids: [first.id, second.id] },
    });
    createdItems.push(jamieItem.id);
    await rpc(jamie, "leave_community", { p_community_id: first.id });
    assert.deepEqual(await communityIds(jamie, jamieItem.id), [second.id]);
    assert.equal((await rpc<{ id: string }>(jamie, "get_item", { p_item_id: jamieItem.id })).id, jamieItem.id);
    await rpc(alex, "remove_community_member", { p_community_id: second.id, p_user_id: jamieId });
    assert.deepEqual(await communityIds(jamie, jamieItem.id), []);

    const morganItem = await rpc<{ id: string }>(morgan, "create_item", {
      p_data: { name: "Deactivated member item", community_ids: [first.id] },
    });
    createdItems.push(morganItem.id);
    const deactivated = await admin.from("community_members")
      .update({ status: "declined" })
      .match({ community_id: first.id, user_id: morganId });
    assert.ifError(deactivated.error);
    assert.deepEqual(await communityIds(morgan, morganItem.id), []);

    await rpc(alex, "delete_community", { p_community_id: first.id });
    assert.deepEqual(await communityIds(alex, item.id), [second.id]);
    assert.equal((await rpc<{ id: string }>(alex, "get_item", { p_item_id: item.id })).id, item.id);
    await rpc(alex, "delete_item", { p_item_id: item.id });
    const links = await admin.from("community_items").select("community_id").eq("item_id", item.id);
    assert.ifError(links.error);
    assert.deepEqual(links.data, []);
  });
});
