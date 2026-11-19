# HeyNeighbor Service

The service directory contains the Supabase backend for the HeyNeighbor app. It defines the PostgreSQL schema, Supabase Auth configuration, row-level security (RLS) policies, Storage policies, database functions (RPCs), and a Storage cleanup Edge Function. The app accesses these services through Supabase; this directory does not contain a standalone Express API server.

## Hosted Supabase project

The hosted project URL is:

```
https://bhrqwrzwjcrfalqjlmrn.supabase.co
```

## Backend capabilities

- Email/password authentication with email confirmation and automatic profile creation.
- Profiles, items, borrowing requests and history, direct and community messages, communities, and community memberships.
- Database functions for application workflows, with RLS and role checks enforcing access.
- Private `profile-pictures`, `item-images`, and `community-images` Storage buckets. Each bucket accepts PNG, JPEG, and WebP files up to 5 MiB.
- A `cleanup-storage` Edge Function that removes unreferenced images from a database queue.

## Project structure

- `supabase/config.toml` — local Supabase services, Auth, Storage, and Edge Function configuration.
- `supabase/migrations/` — ordered database schema, functions, and policy changes.
- `supabase/seed.sql` — local demo users and sample app data; applied by `supabase db reset`.
- `supabase/functions/cleanup-storage/` — Storage cleanup Edge Function.
- `tests/` — local integration tests for Auth, database functions, RLS, Storage, and member roles.
- `database.types.ts` — generated TypeScript database types.
- `docs/` — additional database and authorization notes.

## Local development

Requirements: Node.js 22, npm, the Supabase CLI, and Docker (for the local Supabase stack).

From this directory:

```sh
npm ci
npx supabase start
npx supabase db reset
npm test
```

`supabase db reset` applies all migrations and the seed data. The tests obtain the local API URL and keys from the running Supabase CLI unless `SUPABASE_API_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided. The integration tests create and delete data and refuse to run against a non-local API URL; do not point them at the hosted project.

Run an individual suite with `npm run test:auth`, `npm run test:database-functions`, `npm run test:rls`, `npm run test:storage`, or `npm run test:member-roles`.

Stop the local stack when finished:

```sh
npx supabase stop
```

## Deploying database changes

Link the CLI to the intended Supabase project, then apply migrations and deploy the Edge Function:

```sh
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy cleanup-storage
```

The cleanup schedule runs every 10 minutes. Before applying the migration that creates it, configure the Supabase Vault secrets named `project_url` and `cleanup_service_key` in the hosted database. The latter must be the service-role key and must never be committed or exposed to the client.

## Related repositories

- [Project](https://github.com/calvin-cs262-fall2025-teamG/Project)
- [Client](https://github.com/calvin-cs262-fall2025-teamG/Client)
