# HeyNeighbor Data Service

This project implements the backend data service for the **HeyNeighbor** app. It is a Node.js + TypeScript service that connects to an Azure-hosted PostgreSQL database with authentication, file uploads, and email verification.

## Project Structure

Service/
├── sql/
│ ├── heyneighbor_schema.sql # Database schema
│ ├── heyneighbor_queries.sql # SQL select queries for debugging
│
├── src/
│ ├── types/ # Type definitions for all DB entities
│ │ ├── borrowingrequest.ts
│ │ ├── item.ts
│ │ ├── messages.ts
│ │ └── user.ts
│ │
│ └── heyNeighborService.ts # Main Express service
│
├── uploads/ # User-uploaded profile pictures and item images
├── package.json
├── package-lock.json
├── .env # Environment variables (gitignored)
└── README.md

## Setup

### 1. Install dependencies

npm install


### 2. Environment variables

Create a `.env` file with your Azure Postgres and Gmail credentials:

DB_SERVER=your-server.postgres.database.azure.com
DB_PORT=5432
DB_DATABASE=postgres
DB_USER=your-username
DB_PASSWORD=your-password

EMAIL_USER=your-gmail@gmail.com
EMAIL_PASSWORD=your-app-password

PORT=3001
NODE_ENV=production

> Use a Gmail App Password (not your regular password) for `EMAIL_PASSWORD`. 

### 3. Database setup

Run the schema:

PGSSLMODE=require psql -h $DB_SERVER -U $DB_USER -d $DB_DATABASE -f sql/heyneighbor_schema.sql

You can use `heyneighbor_queries.sql` for quick manual SELECT queries while debugging. 

### Running the service

npm start

By default, the service runs on `http://0.0.0.0:3001` (or whatever you set in `PORT`).

---

## API Endpoints

### Health check

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/` | Basic service check (`"Hello from HeyNeighbor API!"`) |

### Authentication (Calvin.edu only)

All authentication endpoints enforce `@calvin.edu` email addresses and email verification with a 6‑digit code that expires after 15 minutes. 

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST | `/auth/signup` | Sign up with Calvin email, create user, send verification code |
| POST | `/auth/login` | Log in an existing, verified user |
| POST | `/auth/verify-code` | Verify a user’s email using the 6‑digit code |
| POST | `/auth/resend-verification` | Resend a new verification code |
| GET  | `/test-email` | Send a test verification email (for debugging email setup) |

### 👤 Users

Users are stored in the `app_user` table, including optional profile pictures and a verification status flag.

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/users` | Get all users |
| GET | `/users/:id` | Get a single user by ID (profile picture URL is normalized) |
| POST | `/users` | Create a new user (non-auth flow helper) |
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

Stored filenames are later converted into full URLs using the incoming request host, so the same filenames work across localhost and deployed environments.

---

## Security notes

- Queries are parameterized with pg-promise to mitigate SQL injection.
- Email verification tokens expire after 15 minutes and are cleared once verified.
- Only `@calvin.edu` addresses can sign up, limiting access to the Calvin community. 
- File uploads are restricted by MIME type and extension to image formats.

---

## Related repositories

- [Project](https://github.com/calvin-cs262-fall2025-teamG/Project)
- [Client](https://github.com/calvin-cs262-fall2025-teamG/Client)