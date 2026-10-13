// Signup/login flow tests mirroring Client/services/supabaseAuth.ts and
// Client/context/AuthContext.tsx, run against a locally running Supabase stack.
//
// Prerequisites: `supabase start` is running (migrations applied).
// Run: npm run test:auth
//
// Local config uses [auth.email] enable_confirmations = true, so signup returns
// no session until the email is confirmed. The test reads the confirmation
// email from Mailpit (SUPABASE_MAILPIT_URL, default http://127.0.0.1:54324)
// and follows the link; if Mailpit is unreachable it confirms via the admin API.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

const MAILPIT_URL = process.env.SUPABASE_MAILPIT_URL ?? "http://127.0.0.1:54324";
const REDIRECT = "heynbr://auth/callback";
const RUN = Date.now();
const EMAIL = `auth-test-${RUN}@example.com`;
const PASSWORD = "correct-horse-battery";
const DISPLAY_NAME = "Auth Tester";

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
    throw new Error(`Refusing to run auth tests against non-local URL ${url}`);
  }
  return { url, anonKey, serviceKey };
}

const config = loadConfig();
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(config.url, config.serviceKey, opts);
const newClient = (): SupabaseClient =>
  createClient(config.url, config.anonKey, opts);

// Same calls the client app makes in services/supabaseAuth.ts.
const signUp = (c: SupabaseClient, email: string, password: string, displayName: string) =>
  c.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: REDIRECT },
  });
const signIn = (c: SupabaseClient, email: string, password: string) =>
  c.auth.signInWithPassword({ email, password });

async function confirmEmail(email: string, userId: string) {
  try {
    for (let i = 0; i < 20; i++) {
      const list = await fetch(
        `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      );
      const { messages } = (await list.json()) as { messages: { ID: string }[] };
      if (messages?.length) {
        const msg = await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)
        ).json();
        const link = /href="([^"]*\/auth\/v1\/verify[^"]*)"/.exec(
          msg.HTML ?? "",
        )?.[1]?.replaceAll("&amp;", "&");
        if (link) {
          const res = await fetch(link, { redirect: "manual" });
          assert.ok(res.status >= 300 && res.status < 400, `verify gave ${res.status}`);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("confirmation email not found");
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e;
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email_confirm: true,
    });
    assert.ifError(error);
  }
}

describe("client signup/login flow (local Supabase)", () => {
  let userId: string;

  after(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  describe("signup", () => {
    it("creates a user and, with confirmations on, returns no session", async () => {
      const { data, error } = await signUp(newClient(), EMAIL, PASSWORD, DISPLAY_NAME);
      assert.ifError(error);
      assert.ok(data.user);
      userId = data.user.id;
      assert.equal(data.user.email, EMAIL);
      assert.equal(data.session, null);
    });

    it("stores display_name in user metadata", async () => {
      const { data } = await admin.auth.admin.getUserById(userId);
      assert.equal(data.user?.user_metadata.display_name, DISPLAY_NAME);
    });

    it("the auth trigger creates a matching profile row", async () => {
      const { data, error } = await admin
        .from("profiles")
        .select("id, display_name")
        .eq("id", userId)
        .single();
      assert.ifError(error);
      assert.equal(data?.display_name, DISPLAY_NAME);
    });

    it("falls back to the email local part when no display name is given", async () => {
      const email = `auth-test-nodn-${RUN}@example.com`;
      const { data, error } = await newClient().auth.signUp({
        email,
        password: PASSWORD,
      });
      assert.ifError(error);
      try {
        const { data: profile } = await admin
          .from("profiles")
          .select("display_name")
          .eq("id", data.user!.id)
          .single();
        assert.equal(profile?.display_name, `auth-test-nodn-${RUN}`);
      } finally {
        await admin.auth.admin.deleteUser(data.user!.id);
      }
    });

    it("rejects a password shorter than the configured minimum", async () => {
      const { data, error } = await signUp(
        newClient(),
        `auth-test-short-${RUN}@example.com`,
        "short",
        DISPLAY_NAME,
      );
      assert.ok(error, "expected weak password error");
      assert.equal(data.user, null);
    });

    it("rejects an invalid email address", async () => {
      const { error } = await signUp(newClient(), "not-an-email", PASSWORD, DISPLAY_NAME);
      assert.ok(error);
    });

    it("does not reveal or duplicate an already-registered email", async () => {
      // Stay above [auth.email] max_frequency (1s in config.toml) for this address.
      await new Promise((r) => setTimeout(r, 1500));
      const { data, error } = await signUp(newClient(), EMAIL, PASSWORD, "Other Name");
      // GoTrue obfuscates duplicates: no error, and the original profile is untouched.
      assert.ifError(error);
      assert.equal(data.session, null);
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .single();
      assert.equal(profile?.display_name, DISPLAY_NAME);
    });
  });

  describe("login before confirmation", () => {
    it("is rejected until the email is confirmed", async () => {
      const { data, error } = await signIn(newClient(), EMAIL, PASSWORD);
      assert.ok(error);
      assert.equal(error.code, "email_not_confirmed");
      assert.equal(data.session, null);
    });
  });

  describe("login after confirmation", () => {
    before(async () => {
      await confirmEmail(EMAIL, userId);
    });

    it("returns a session for valid credentials", async () => {
      const { data, error } = await signIn(newClient(), EMAIL, PASSWORD);
      assert.ifError(error);
      assert.ok(data.session?.access_token);
      assert.equal(data.user?.id, userId);
    });

    it("rejects a wrong password", async () => {
      const { data, error } = await signIn(newClient(), EMAIL, "wrong-password-1");
      assert.ok(error);
      assert.equal(error.code, "invalid_credentials");
      assert.equal(data.session, null);
    });

    it("rejects an unknown email", async () => {
      const { error } = await signIn(newClient(), `nobody-${RUN}@example.com`, PASSWORD);
      assert.equal(error?.code, "invalid_credentials");
    });

    it("lets the signed-in user load their own profile (AuthContext.loadAppUser)", async () => {
      const client = newClient();
      const { data: auth, error: signInError } = await signIn(client, EMAIL, PASSWORD);
      assert.ifError(signInError);

      const { data: profile, error } = await client
        .from("profiles")
        .select("id, display_name, avatar_path, created_at")
        .eq("id", auth.user!.id)
        .single();
      assert.ifError(error);
      assert.equal(profile?.id, userId);
      assert.equal(profile?.display_name, DISPLAY_NAME);
      assert.equal(profile?.avatar_path, null);
      assert.ok(profile?.created_at);
    });

    it("restores the session via getSession and refreshes tokens", async () => {
      const client = newClient();
      await signIn(client, EMAIL, PASSWORD);
      const { data, error } = await client.auth.getSession();
      assert.ifError(error);
      assert.equal(data.session?.user.email, EMAIL);

      const refreshed = await client.auth.refreshSession();
      assert.ifError(refreshed.error);
      assert.ok(refreshed.data.session?.access_token);
    });

    it("logout ends the session and revokes data access", async () => {
      const client = newClient();
      await signIn(client, EMAIL, PASSWORD);
      const { error } = await client.auth.signOut();
      assert.ifError(error);

      const { data } = await client.auth.getSession();
      assert.equal(data.session, null);

      const { data: profiles } = await client.from("profiles").select("id");
      assert.deepEqual(profiles ?? [], []);
    });
  });
});
