# HeyNeighbor Data Service

This project implements the backend data service for the **HeyNeighbor** app. It is a Node.js + TypeScript service that connects to an Azure-hosted PostgreSQL database with authentication, file uploads, and email verification.

## Live deployment

A shared, always-on instance is deployed to Azure App Service:

```
https://bryn-monopoly-service-bpcuabdzg8bkdycb.westus3-01.azurewebsites.net
```

The Client can point at this directly (see the `USE_DEPLOYED_BACKEND` flag in `Client/services/api.ts`) without anyone needing to run the Service locally. Local setup below is only needed if you're developing/testing backend changes before deploying them.

## Project Structure

```
Service/
├── sql/
│ ├── heyneighbor_schema.sql   # Database schema (documentation / disaster recovery — do NOT run against the live DB, it drops all tables)
│ ├── heyneighbor_queries.sql  # SQL select queries for debugging
│
├── src/
│ ├── types/                   # Type definitions for all DB entities
│ │ ├── borrowingrequest.ts
│ │ ├── item.ts
│ │ ├── messages.ts
│ │ └── user.ts
│ │
│ └── heyNeighborService.ts    # Main Express service
│
├── uploads/          # Locally-saved uploaded images (see "Known limitations" below)
├── package.json
├── package-lock.json
├── .env.example       # Template — copy to .env and fill in real values
├── .env                # Your real credentials (gitignored, never commit this)
└── README.md
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

Copy the template and fill in real values:

```bash
cp .env.example .env
```

```
DB_SERVER=your-server.postgres.database.azure.com
DB_PORT=5432
DB_DATABASE=heyneighbor
DB_USER=your-username
DB_PASSWORD=your-password

EMAIL_USER=your-gmail@gmail.com
EMAIL_PASSWORD=your-app-password

PORT=3001
NODE_ENV=production
```

> Use a Gmail App Password (not your regular password) for `EMAIL_PASSWORD`.
> `DB_DATABASE` must be `heyneighbor`, not `postgres` — `postgres` is just the server's default admin database and has none of the app's tables.

Ask a teammate for real credentials rather than inventing your own — the app connects to one shared production database.

### 3. Database setup (only if you need to rebuild from scratch)

Most contributors will never need this — the shared database already exists and has data in it. If you genuinely need to recreate it (new environment, disaster recovery):

```bash
PGSSLMODE=require psql -h $DB_SERVER -U $DB_USER -d $DB_DATABASE -f sql/heyneighbor_schema.sql
```

**Warning:** this script starts with `DROP TABLE`. Never run it against the live/shared database unless you specifically intend to wipe it.

You can use `heyneighbor_queries.sql` for quick manual SELECT queries while debugging.

### Running the service locally

```bash
npm start
```

By default, the service runs on `http://0.0.0.0:3001` (or whatever you set in `PORT`).

### Deploying to Azure

```bash
npm install
zip -r ../service-deploy.zip . -x ".git/*" -x "uploads/*" -x ".env"
az webapp deploy --resource-group CS262-Group --name bryn-monopoly-service --src-path ../service-deploy.zip --type zip
```

Requires `az login` first, with access to the "Azure for Students" subscription. `node_modules` is intentionally included in the zip rather than excluded — Azure's automatic build step hasn't reliably run `npm install` on its own, so we ship pre-built dependencies instead.

> **Note:** the GitHub Actions auto-deploy workflow (`.github/workflows/main_heyneighborurl.yml`) has been broken since mid-December 2025 (OIDC federated credential issue — needs Azure AD admin access to fix). Pushing to `main` does **not** currently deploy automatically. Use the manual steps above until that's resolved.

---

## API Endpoints

### Health check

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/` | Basic service check (`"Hello from HeyNeighbor API!"`) |

### Authentication (Calvin.edu only)

All authentication endpoints enforce `@calvin.edu` email addresses and email verification with a 6‑digit code that expires after 15 minutes. Passwords are required (8+ characters) and hashed with bcrypt before storage.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST | `/auth/signup` | Sign up with Calvin email, name, and password (8+ chars). Creates user, sends verification code. |
| POST | `/auth/login` | Log in with email and password. Requires a verified account. |
| POST | `/auth/verify-code` | Verify a user's email using the 6‑digit code |
| POST | `/auth/resend-verification` | Resend a new verification code |
| GET  | `/test-email?email=...` | Sends a test email to the given address. **Debug-only — should be removed or gated behind `NODE_ENV !== "production"` before any real deployment; currently public and abusable.** |

### 👤 Users

Users are stored in the `app_user` table, including optional profile pictures and a verification status flag.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/users` | Get all users (password hash and verification token stripped from response) |
| GET | `/users/:id` | Get a single user by ID (profile picture URL normalized, password hash and verification token stripped) |
| POST | `/users` | Create a new user (non-auth flow helper — no email/password validation, not meant for public signup) |
| PUT | `/users/:id` | Update user fields (name, email, profile picture) |
| POST | `/users/:id/profile-picture` | Upload a profile picture image for a user |

### Items

Items represent sharable objects that belong to users and may have borrow requests associated with them.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/items` | Get all items (image URLs normalized to full URLs) |
| GET | `/items/:id` | Get a single item by ID, including owner info and avatar |
| POST | `/items` | Create a new item |
| POST | `/items/upload` | Upload an item image (returns stored filename) |
| PUT | `/items/:id` | Update item fields (name, description, status, dates, etc.) |
| DELETE | `/items/:id` | Delete an item and related borrow/history/messages records |

### Borrowing requests

Borrowing requests link a user to an item they want to borrow.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/borrow/active` | Get active borrowing requests for items with `pending` status |
| POST | `/borrow` | Create a new borrowing request |

**Known gap:** there is currently no way to approve, decline, or mark a borrow request as returned — only creation and listing exist. The `borrowinghistory` table exists in the schema for this purpose but has no endpoints yet.

### Messages

Messages support conversations between users, optionally tied to a specific item.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/messages` | Get all messages ordered by `sent_at` |
| GET | `/messages/user/:userId` | Get the latest message per conversation for a user |
| POST | `/messages` | Create a new message (with optional `item_id`) |

---

## File uploads

The service uses `multer` to handle image uploads for users and items, saving them to the `uploads/` directory and serving them statically under `/uploads`.

- Max file size: 5 MB
- Allowed types: JPEG, JPG, PNG, GIF
- Profile pictures: `POST /users/:id/profile-picture`
- Item images: `POST /items/upload`

Stored filenames are later converted into full URLs using the incoming request host.

**Known limitation:** `uploads/` is local disk storage, gitignored and not synced anywhere. An image uploaded while running the Service on one machine is *only* visible from that same machine — it is not visible from a different local instance, or from the deployed Azure instance, unless the upload happened on that exact instance. This also means uploads to the Azure App Service are not guaranteed durable long-term. The real fix is moving to cloud object storage (e.g., Azure Blob Storage) instead of local disk — not yet implemented.

**Client-side note:** as of Expo SDK 56+, uploading files via a plain `FormData` object with a `{uri, name, type}` shorthand no longer works reliably. The Client uses `expo-file-system/legacy`'s `uploadAsync` instead — see `Client/app/edit-profile.tsx` or `Client/app/(tabs)/list.tsx` for a working example.

---

## Security notes

- Queries are parameterized with pg-promise to mitigate SQL injection.
- Passwords are hashed with bcrypt before storage; plaintext passwords are never stored.
- Email verification tokens expire after 15 minutes and are cleared once verified.
- Only `@calvin.edu` addresses can sign up, limiting access to the Calvin community.
- File uploads are restricted by MIME type and extension to image formats.
- `GET /users` and `GET /users/:id` strip `password_hash` and `verification_token` before responding — this was previously a live data leak, fixed.

**Known gaps, not yet addressed:**
- No authentication/session checks on most routes — any caller can act as any user by supplying their numeric ID (e.g., editing another user's items, sending messages as them).
- `POST /users` bypasses email/password validation entirely and doesn't require verification.
- `PUT /users/:id` allows changing a user's email to anything, including off `@calvin.edu`, with no re-verification.
- `GET /test-email` is a public, unauthenticated mail relay — abusable for spam or to exhaust the sending account's quota.
- Database connections use `ssl: { rejectUnauthorized: false }`, which accepts any TLS certificate — acceptable for now given Azure's cert setup, but technically open to MITM.

---

## Related repositories

- [Project](https://github.com/calvin-cs262-fall2025-teamG/Project)
- [Client](https://github.com/calvin-cs262-fall2025-teamG/Client)
