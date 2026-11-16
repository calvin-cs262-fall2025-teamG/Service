// Member-role and community authorization tests against a local Supabase stack.
//
// Prerequisites: `supabase start` and `supabase db reset`.
// Run: npm run test:member-roles
//
// The tests create and delete temporary data, so they refuse to run against a
// non-local Supabase API URL.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const PASSWORD = "neighbor-demo";
const ALEX_EMAIL = "alex@example.com";
const JAMIE_EMAIL = "jamie@example.com";
const MORGAN_EMAIL = "morgan@example.com";
const SECOND_ADMIN_EMAIL = `member-roles-admin-${crypto.randomUUID()}@example.com`;
const SECOND_MEMBER_EMAIL = `member-roles-member-${crypto.randomUUID()}@example.com`;

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
    throw new Error(`Refusing to run member-role tests against non-local URL ${url}`);
  }
  return { url, anonKey, serviceKey };
}

const config = loadConfig();
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(config.url, config.serviceKey, clientOptions);

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
  return data as T;
}

describe("community member roles (local Supabase)", () => {
  let owner: SupabaseClient;
  let admin: SupabaseClient;
  let secondAdmin: SupabaseClient;
  let member: SupabaseClient;
  let secondMember: SupabaseClient;
  let ownerId: string;
  let adminId: string;
  let secondAdminId: string;
  let memberId: string;
  let secondMemberId: string;
  const communityIds: string[] = [];
  const itemIds: string[] = [];
  const testUserIds: string[] = [];

  before(async () => {
    [owner, admin, member] = await Promise.all([
      signIn(ALEX_EMAIL),
      signIn(JAMIE_EMAIL),
      signIn(MORGAN_EMAIL),
    ]);
    const secondAdminUser = await service.auth.admin.createUser({
      email: SECOND_ADMIN_EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Member Roles Second Admin" },
    });
    assert.ifError(secondAdminUser.error);
    assert.ok(secondAdminUser.data.user);
    secondAdminId = secondAdminUser.data.user.id;
    testUserIds.push(secondAdminId);

    const secondMemberUser = await service.auth.admin.createUser({
      email: SECOND_MEMBER_EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: "Member Roles Second Member" },
    });
    assert.ifError(secondMemberUser.error);
    assert.ok(secondMemberUser.data.user);
    secondMemberId = secondMemberUser.data.user.id;
    testUserIds.push(secondMemberId);

    [secondAdmin, secondMember] = await Promise.all([
      signIn(SECOND_ADMIN_EMAIL),
      signIn(SECOND_MEMBER_EMAIL),
    ]);
    ownerId = (await rpc<{ id: string }>(owner, "get_my_profile")).id;
    adminId = (await rpc<{ id: string }>(admin, "get_my_profile")).id;
    memberId = (await rpc<{ id: string }>(member, "get_my_profile")).id;
    assert.equal(secondAdminId, (await rpc<{ id: string }>(secondAdmin, "get_my_profile")).id);
    assert.equal(secondMemberId, (await rpc<{ id: string }>(secondMember, "get_my_profile")).id);
  });

  after(async () => {
    if (itemIds.length) {
      const { error } = await service.from("items").delete().in("id", itemIds);
      assert.ifError(error);
    }
    if (communityIds.length) {
      const { error } = await service.from("communities").delete().in("id", communityIds);
      assert.ifError(error);
    }
    for (const userId of testUserIds) {
      const { error } = await service.auth.admin.deleteUser(userId);
      assert.ifError(error);
    }
  });

  async function createCommunity(): Promise<string> {
    const community = await rpc<{ id: string }>(owner, "create_community", {
      p_data: { name: `Member roles ${crypto.randomUUID()}` },
    });
    communityIds.push(community.id);
    return community.id;
  }

  async function requestMembership(client: SupabaseClient, communityId: string) {
    return rpc<{ user_id: string; status: string }>(client, "request_join_community", {
      p_community_id: communityId,
    });
  }

  async function approveMembership(
    client: SupabaseClient,
    communityId: string,
    userId: string,
  ) {
    return rpc<{ role: string; status: string }>(client, "approve_community_member", {
      p_community_id: communityId,
      p_user_id: userId,
    });
  }

  async function setRole(
    client: SupabaseClient,
    communityId: string,
    userId: string,
    role: string,
  ) {
    return rpc<{ role: string; status: string }>(client, "set_community_member_role", {
      p_community_id: communityId,
      p_user_id: userId,
      p_role: role,
    });
  }

  async function addActiveMember(
    requester: SupabaseClient,
    communityId: string,
    userId: string,
    approver: SupabaseClient = owner,
  ) {
    const pending = await requestMembership(requester, communityId);
    assert.equal(pending.status, "pending");
    assert.equal(pending.user_id, userId, "membership request should belong to the requested user");
    return approveMembership(approver, communityId, userId);
  }

  async function membership(communityId: string, userId: string) {
    const { data, error } = await service
      .from("community_members")
      .select("role,status")
      .match({ community_id: communityId, user_id: userId })
      .single();
    assert.ifError(error);
    return data;
  }

  async function community(communityId: string) {
    const { data, error } = await service
      .from("communities")
      .select("id,name,owner_id,description")
      .eq("id", communityId)
      .maybeSingle();
    assert.ifError(error);
    return data;
  }

  // Good
  it("allows only the owner to delete a community", async () => {
    const communityId = await createCommunity();
    await addActiveMember(admin, communityId, adminId);
    await setRole(owner, communityId, adminId, "admin");
    await addActiveMember(member, communityId, memberId);

    const adminDenied = await admin.rpc("delete_community", { p_community_id: communityId });
    assert.ok(adminDenied.error, "expected a community admin to be unable to delete the community");
    assert.ok(await community(communityId), "the community should still exist after the denied delete");

    const memberDenied = await member.rpc("delete_community", { p_community_id: communityId });
    assert.ok(memberDenied.error, "expected a regular member to be unable to delete the community");
    assert.ok(await community(communityId), "the community should still exist after the denied delete");

    await rpc(owner, "delete_community", { p_community_id: communityId });
    assert.equal(await community(communityId), null);
  });

  // Good
  it("allows only the owner to update a community", async () => {
    const communityId = await createCommunity();
    await addActiveMember(admin, communityId, adminId);
    await setRole(owner, communityId, adminId, "admin");
    await addActiveMember(member, communityId, memberId);

    await owner.rpc("update_community", {
      p_community_id: communityId,
      p_data: { description: "Updated by the owner" },
    });
    const afterOwnerUpdate = await community(communityId);
    assert.equal(afterOwnerUpdate?.description, "Updated by the owner");

    const adminDenied = await admin.rpc("update_community", {
      p_community_id: communityId,
      p_data: { name: "Updated by an admin" },
    });
    assert.ok(adminDenied.error, "expected a community admin to be unable to update the community");
    assert.equal((await community(communityId))?.name, afterOwnerUpdate?.name);

    const memberDenied = await member.rpc("update_community", {
      p_community_id: communityId,
      p_data: { name: "Updated by a member" },
    });
    assert.ok(memberDenied.error, "expected a regular member to be unable to update the community");
    assert.equal((await community(communityId))?.name, afterOwnerUpdate?.name);
  });

  it("allows only the owner to transfer ownership to an active member or admin", async () => {
    const memberCommunityId = await createCommunity();
    await addActiveMember(admin, memberCommunityId, adminId);
    await addActiveMember(member, memberCommunityId, memberId);

    const adminDenied = await admin.rpc("transfer_community_ownership", {
      p_community_id: memberCommunityId,
      p_new_owner_id: memberId,
    });
    assert.ok(adminDenied.error, "expected an admin to be unable to transfer ownership");
    assert.equal((await community(memberCommunityId))?.owner_id, ownerId);

    const memberDenied = await member.rpc("transfer_community_ownership", {
      p_community_id: memberCommunityId,
      p_new_owner_id: adminId,
    });
    assert.ok(memberDenied.error, "expected a member to be unable to transfer ownership");
    assert.equal((await community(memberCommunityId))?.owner_id, ownerId);

    const memberTransfer = await rpc<{ owner_id: string }>(owner, "transfer_community_ownership", {
      p_community_id: memberCommunityId,
      p_new_owner_id: memberId,
    });
    assert.equal(memberTransfer.owner_id, memberId);
    assert.equal((await membership(memberCommunityId, memberId))?.role, "owner");
    assert.equal((await membership(memberCommunityId, ownerId))?.role, "admin");

    const adminCommunityId = await createCommunity();
    await addActiveMember(admin, adminCommunityId, adminId);
    await setRole(owner, adminCommunityId, adminId, "admin");
    const adminTransfer = await rpc<{ owner_id: string }>(owner, "transfer_community_ownership", {
      p_community_id: adminCommunityId,
      p_new_owner_id: adminId,
    });
    assert.equal(adminTransfer.owner_id, adminId);
    assert.equal((await membership(adminCommunityId, adminId))?.role, "owner");
    assert.equal((await membership(adminCommunityId, ownerId))?.role, "admin");
  });

  // Good
  it("allows only the owner to promote a member and demote an admin", async () => {
    const communityId = await createCommunity();
    assert.equal((await membership(communityId, ownerId))?.role, "owner");
    await addActiveMember(admin, communityId, adminId);
    await setRole(owner, communityId, adminId, "admin");
    await addActiveMember(secondAdmin, communityId, secondAdminId);
    await setRole(owner, communityId, secondAdminId, "admin");
    await addActiveMember(member, communityId, memberId);
    await addActiveMember(secondMember, communityId, secondMemberId);

    const memberPeerPromotionDenied = await member.rpc("set_community_member_role", {
      p_community_id: communityId,
      p_user_id: secondMemberId,
      p_role: "admin",
    });
    assert.ok(memberPeerPromotionDenied.error, "expected a member to be unable to promote another member");
    assert.equal((await membership(communityId, secondMemberId))?.role, "member");

    const memberDemotionDenied = await member.rpc("set_community_member_role", {
      p_community_id: communityId,
      p_user_id: adminId,
      p_role: "member",
    });
    assert.ok(memberDemotionDenied.error, "expected a member to be unable to demote an admin");
    assert.equal((await membership(communityId, adminId))?.role, "admin");

    const adminPromotionDenied = await admin.rpc("set_community_member_role", {
      p_community_id: communityId,
      p_user_id: memberId,
      p_role: "admin",
    });
    assert.ok(adminPromotionDenied.error, "expected an admin to be unable to promote another member");
    assert.equal((await membership(communityId, memberId))?.role, "member");

    const adminPeerDemotionDenied = await admin.rpc("set_community_member_role", {
      p_community_id: communityId,
      p_user_id: secondAdminId,
      p_role: "member",
    });
    assert.ok(adminPeerDemotionDenied.error, "expected an admin to be unable to demote another admin");
    assert.equal((await membership(communityId, secondAdminId))?.role, "admin");

    const promoted = await setRole(owner, communityId, memberId, "admin");
    assert.equal(promoted.role, "admin");
    assert.equal((await membership(communityId, memberId))?.role, "admin");

    const demoted = await setRole(owner, communityId, adminId, "member");
    assert.equal(demoted.role, "member");
    assert.equal((await membership(communityId, adminId))?.role, "member");
  });

  // Good
  it("allows owners and admins to delete community messages, but not regular members", async () => {
    const communityId = await createCommunity();
    await addActiveMember(admin, communityId, adminId);
    await setRole(owner, communityId, adminId, "admin");
    await addActiveMember(member, communityId, memberId);

    const ownerMessage = await rpc<{ id: string }>(owner, "create_community_message", {
      p_community_id: communityId,
      p_content: "Owner message",
    });
    await rpc(admin, "delete_community_message", { p_message_id: ownerMessage.id });

    const adminMessage = await rpc<{ id: string }>(admin, "create_community_message", {
      p_community_id: communityId,
      p_content: "Admin message",
    });
    await rpc(owner, "delete_community_message", { p_message_id: adminMessage.id });

    const protectedMessage = await rpc<{ id: string }>(admin, "create_community_message", {
      p_community_id: communityId,
      p_content: "Admin message protected from regular member",
    });
    const denied = await member.rpc("delete_community_message", {
      p_message_id: protectedMessage.id,
    });
    assert.ok(denied.error, "expected a regular member to be unable to delete a community message");
    const { data, error } = await service
      .from("community_messages")
      .select("id")
      .eq("id", protectedMessage.id)
      .single();
    assert.ifError(error);
    assert.equal(data?.id, protectedMessage.id);
  });

  // Good
  it("allows only owners and admins to accept community members", async () => {
    const ownerCommunityId = await createCommunity();
    await addActiveMember(member, ownerCommunityId, memberId);
    const ownerPending = await requestMembership(secondMember, ownerCommunityId);
    
    const memberDenied = await member.rpc("approve_community_member", {
      p_community_id: ownerCommunityId,
      p_user_id: secondMemberId,
    });
    assert.ok(memberDenied.error, "expected a regular member to be unable to accept a member");
    assert.equal((await membership(ownerCommunityId, secondMemberId))?.status, "pending");

    const ownerApproved = await approveMembership(owner, ownerCommunityId, ownerPending.user_id);
    assert.equal(ownerApproved.status, "active");

    const adminCommunityId = await createCommunity();
    await addActiveMember(admin, adminCommunityId, adminId);
    await setRole(owner, adminCommunityId, adminId, "admin");
    const pending = await requestMembership(secondMember, adminCommunityId);
    assert.equal(pending.status, "pending");
    const adminApproved = await approveMembership(admin, adminCommunityId, secondMemberId);
    assert.equal(adminApproved.status, "active");
  });

  // Need to figure out declined state
  it("allows only owners and admins to update membership status", async () => {
    const ownerCommunityId = await createCommunity();
    await addActiveMember(member, ownerCommunityId, memberId);
    const ownerPending = await requestMembership(secondMember, ownerCommunityId);
    
    const memberDenied = await member.rpc("decline_community_member", {
      p_community_id: ownerCommunityId,
      p_user_id: secondMemberId,
    });
    assert.ok(memberDenied.error, "expected a regular member to be unable to decline a member");
    assert.equal((await membership(ownerCommunityId, secondMemberId))?.status, "pending");

    const ownerDeclined = await rpc<{ status: string }>(owner, "decline_community_member", {
      p_community_id: ownerCommunityId,
      p_user_id: ownerPending.user_id,
    });
    assert.equal(ownerDeclined.status, "declined");

    const adminCommunityId = await createCommunity();
    await addActiveMember(admin, adminCommunityId, adminId);
    await setRole(owner, adminCommunityId, adminId, "admin");
    const adminPending = await requestMembership(secondMember, adminCommunityId);
    const adminDeclined = await rpc<{ status: string }>(admin, "decline_community_member", {
      p_community_id: adminCommunityId,
      p_user_id: adminPending.user_id,
    });
    assert.equal(adminDeclined.status, "declined");
  });

  it("allows only owners and admins to remove members and marks removed members declined", async () => {
    const ownerCommunityId = await createCommunity();
    await addActiveMember(admin, ownerCommunityId, adminId);
    await addActiveMember(member, ownerCommunityId, memberId);
    await addActiveMember(secondMember, ownerCommunityId, secondMemberId);
    const memberDenied = await member.rpc("remove_community_member", {
      p_community_id: ownerCommunityId,
      p_user_id: secondMemberId,
    });
    assert.ok(memberDenied.error, "expected a regular member to be unable to remove another member");
    assert.equal((await membership(ownerCommunityId, secondMemberId))?.status, "active");

    await rpc(owner, "remove_community_member", {
      p_community_id: ownerCommunityId,
      p_user_id: secondMemberId,
    });
    assert.equal((await membership(ownerCommunityId, secondMemberId))?.status, "declined");

    const adminCommunityId = await createCommunity();
    await addActiveMember(admin, adminCommunityId, adminId);
    await setRole(owner, adminCommunityId, adminId, "admin");
    await addActiveMember(member, adminCommunityId, memberId);
    await rpc(admin, "remove_community_member", {
      p_community_id: adminCommunityId,
      p_user_id: memberId,
    });
    assert.equal((await membership(adminCommunityId, memberId))?.status, "declined");
  });


  it("allows owners and admins, but not regular members, to remove community items", async () => {
    const communityId = await createCommunity();
    await addActiveMember(admin, communityId, adminId);
    await setRole(owner, communityId, adminId, "admin");
    await addActiveMember(member, communityId, memberId);

    async function createSharedItem(name: string) {
      const item = await rpc<{ id: string }>(owner, "create_item", {
        p_data: { name, community_ids: [communityId] },
      });
      itemIds.push(item.id);
      return item.id;
    }

    const ownerItemId = await createSharedItem("Owner-removed community item");
    await rpc(owner, "remove_community_item", {
      p_community_id: communityId,
      p_item_id: ownerItemId,
    });
    const { data: ownerItemLink, error: ownerItemError } = await service
      .from("community_items")
      .select("item_id")
      .match({ community_id: communityId, item_id: ownerItemId })
      .maybeSingle();
    assert.ifError(ownerItemError);
    assert.equal(ownerItemLink, null);

    const adminItemId = await createSharedItem("Admin-removed community item");
    await rpc(admin, "remove_community_item", {
      p_community_id: communityId,
      p_item_id: adminItemId,
    });
    const { data: adminItemLink, error: adminItemError } = await service
      .from("community_items")
      .select("item_id")
      .match({ community_id: communityId, item_id: adminItemId })
      .maybeSingle();
    assert.ifError(adminItemError);
    assert.equal(adminItemLink, null);

    const memberItemId = await createSharedItem("Member-protected community item");
    const memberRemoval = await member.rpc("remove_community_item", {
      p_community_id: communityId,
      p_item_id: memberItemId,
    });
    assert.ok(memberRemoval.error, "expected a regular member to be unable to remove a community item");
    const { data: memberItemLink, error: memberItemError } = await service
      .from("community_items")
      .select("item_id")
      .match({ community_id: communityId, item_id: memberItemId })
      .single();
    assert.ifError(memberItemError);
    assert.equal(memberItemLink?.item_id, memberItemId);
  });

  it("allows active members to invite, but only owners and admins to accept or decline", async () => {
    const communityId = await createCommunity();
    await addActiveMember(admin, communityId, adminId);
    await setRole(owner, communityId, adminId, "admin");
    await addActiveMember(member, communityId, memberId);

    const nonMemberInvite = await secondMember.rpc("invite_community_member", {
      p_community_id: communityId,
      p_user_id: secondAdminId,
    });
    assert.ok(nonMemberInvite.error, "expected a non-member to be unable to invite a member");
    const { data: absentMembership, error: absentMembershipError } = await service
      .from("community_members")
      .select("user_id")
      .match({ community_id: communityId, user_id: secondAdminId })
      .maybeSingle();
    assert.ifError(absentMembershipError);
    assert.equal(absentMembership, null);

    const memberInvite = await rpc<{ status: string; user_id: string }>(
      member,
      "invite_community_member",
      { p_community_id: communityId, p_user_id: secondAdminId },
    );
    assert.equal(memberInvite.user_id, secondAdminId);
    assert.equal(memberInvite.status, "pending");

    const memberApproveDenied = await member.rpc("approve_community_member", {
      p_community_id: communityId,
      p_user_id: secondAdminId,
    });
    assert.ok(memberApproveDenied.error, "expected a regular member to be unable to accept an invitation");
    const memberDeclineDenied = await member.rpc("decline_community_member", {
      p_community_id: communityId,
      p_user_id: secondAdminId,
    });
    assert.ok(memberDeclineDenied.error, "expected a regular member to be unable to decline an invitation");
    assert.equal((await membership(communityId, secondAdminId))?.status, "pending");

    const adminApproved = await approveMembership(admin, communityId, secondAdminId);
    assert.equal(adminApproved.status, "active");

    const secondMemberInvite = await rpc<{ status: string }>(member, "invite_community_member", {
      p_community_id: communityId,
      p_user_id: secondMemberId,
    });
    assert.equal(secondMemberInvite.status, "pending");

    const adminDeclined = await rpc<{ status: string }>(admin, "decline_community_member", {
      p_community_id: communityId,
      p_user_id: secondMemberId,
    });
    assert.equal(adminDeclined.status, "declined");

    const declinedInvite = await owner.rpc("invite_community_member", {
      p_community_id: communityId,
      p_user_id: secondMemberId,
    });
    assert.ok(declinedInvite.error, "expected a declined member to be unable to receive another invite");
    assert.equal((await membership(communityId, secondMemberId))?.status, "declined");
  });

  it("allows only the owner to undecline a member", async () => {
    const communityId = await createCommunity();
    await addActiveMember(admin, communityId, adminId);
    await setRole(owner, communityId, adminId, "admin");

    const pending = await requestMembership(member, communityId);
    await rpc(owner, "decline_community_member", {
      p_community_id: communityId,
      p_user_id: pending.user_id,
    });

    const memberUpdate = await member.rpc("set_community_member_status", {
      p_community_id: communityId,
      p_user_id: memberId,
      p_status: "pending",
    });
    assert.ok(memberUpdate.error, "expected a regular member to be unable to update membership status");

    const adminUndecline = await admin.rpc("set_community_member_status", {
      p_community_id: communityId,
      p_user_id: memberId,
      p_status: "pending",
    });
    assert.ok(adminUndecline.error, "expected an admin to be unable to undecline a member");
    assert.equal((await membership(communityId, memberId))?.status, "declined");

    const ownerUndecline = await rpc<{ status: string }>(owner, "set_community_member_status", {
      p_community_id: communityId,
      p_user_id: memberId,
      p_status: "pending",
    });
    assert.equal(ownerUndecline.status, "pending");

    const adminPending = await requestMembership(secondMember, communityId);
    const adminDecline = await rpc<{ status: string }>(admin, "set_community_member_status", {
      p_community_id: communityId,
      p_user_id: adminPending.user_id,
      p_status: "declined",
    });
    assert.equal(adminDecline.status, "declined");
  });
});