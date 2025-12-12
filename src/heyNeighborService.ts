/**
 * HeyNeighbor REST-inspired web service
 *
 * - Written in TypeScript with Node type-stripping (Node 22+)
 * - Uses pgPromise with built-in SQL injection protection
 * - Has CRUD endpoints for User, Item, BorrowingRequest, Messages
 * - Follows same structure as monopolyService.ts
 *
 * @author:
 * @date: Fall 2025
 */
import "dotenv/config";

import express from 'express';
import pgPromise from 'pg-promise';

import type { Request, Response, NextFunction } from 'express';
import type { User, UserInput } from './types/user.js';
import type { Item, ItemInput } from './types/item.js';
import type { BorrowingRequestInput } from './types/borrowingrequest.js';
import type { MessageInput } from './types/messages.js';
import type { ItemWithOwner } from './types/item.js';

type AuthSignupInput = { email: string; password: string; name: string };
type AuthLoginInput = { email: string; password: string };

// ----------------------------------------------
// Database Setup
// ----------------------------------------------
const pgp = pgPromise();

const db = pgp({
  host: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT as string) || 5432,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});


// ----------------------------------------------
// Express Setup
// ----------------------------------------------
const app = express();
const router = express.Router();
const port = parseInt(process.env.PORT as string) || 3000;

router.use(express.json());

// ----------------------------------------------
// Routes
// ----------------------------------------------

// Health check
router.get("/", (_req, res) => {
    res.send("Hello from HeyNeighbor API!");
});

// ===== Auth =====
router.post("/auth/signup", signup);
router.post("/auth/login", login);

// ===== Users =====
router.get("/users", readUsers);
router.get("/users/:id", readUser);
router.post("/users", createUser);

// ===== Items =====
router.get("/items", readItems);
router.get("/items/:id", readItem);
router.post("/items", createItem);
router.put("/items/:id", updateItem);
router.delete("/items/:id", deleteItem);

// ===== Borrowing Requests =====
router.get("/borrow/active", readActiveBorrowRequests);
router.post("/borrow", createBorrowRequest);

// ===== Messages =====
router.get("/messages", readMessages);
router.get("/messages/user/:userId", readUserMessages);
router.post("/messages", createMessage);

app.use(router);

// Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Listening on http://0.0.0.0:${port}`);
});

// ----------------------------------------------
// Utility
// ----------------------------------------------
function returnDataOr404(res: Response, data: unknown): void {
    if (data == null) {
        res.sendStatus(404);
    } else {
        res.send(data);
    }
}

// ----------------------------------------------
// Auth Endpoints (DEV / no real password auth)
// ----------------------------------------------
function signup(req: Request, res: Response, next: NextFunction): void {
  const { email, name } = req.body as AuthSignupInput;

  if (!email || !name) {
    res.status(400).json({ error: "email and name are required" });
    return;
  }

  db.oneOrNone("SELECT * FROM app_user WHERE email = $[email]", { email })
    .then((existing: User | null) => {
      if (existing) {
        res.status(409).json({ error: "Email already in use" });
        return null;
      }

      return db.one(
        "INSERT INTO app_user (email, name) VALUES ($[email], $[name]) RETURNING *",
        { email, name }
      );
    })
    .then((created: User | null) => {
      if (!created) return;
      res.json({ message: "Signup successful", user: created });
    })
    .catch(next);
}

function login(req: Request, res: Response, next: NextFunction): void {
  const { email } = req.body as AuthLoginInput;

  if (!email) {
    res.status(400).json({ error: "email is required" });
    return;
  }

  db.oneOrNone("SELECT * FROM app_user WHERE email = $[email]", { email })
    .then((user: User | null) => {
      if (!user) {
        res.status(401).json({ error: "Invalid email or password" });
        return;
      }
      res.json({ message: "Login successful", user });
    })
    .catch(next);
}

// ----------------------------------------------
// User Endpoints
// ----------------------------------------------
function readUsers(_req: Request, res: Response, next: NextFunction): void {
    db.manyOrNone("SELECT * FROM app_user")
        .then((data: User[]) => res.send(data))
        .catch(next);
}

function readUser(req: Request, res: Response, next: NextFunction): void {
    db.oneOrNone("SELECT * FROM app_user WHERE user_id = $[id]", req.params)
        .then((data: User | null) => returnDataOr404(res, data))
        .catch(next);
}

function createUser(req: Request, res: Response, next: NextFunction): void {
    db.one(
        "INSERT INTO app_user(name, profile_picture) VALUES($[name], $[profile_picture]) RETURNING user_id",
        req.body as UserInput
    )
        .then((data: { user_id: number }) => res.send(data))
        .catch(next);
}

// ----------------------------------------------
// Item Endpoints
// ----------------------------------------------
function readItems(_req: Request, res: Response, next: NextFunction): void {
  db.manyOrNone(
    `
    SELECT
      i.*,
      u.name AS owner_name,
      u.profile_picture AS owner_avatar
    FROM item i
    JOIN app_user u ON u.user_id = i.owner_id
    `
  )
    .then((data: any[]) => res.send(data))
    .catch(next);
}

function readItem(req: Request, res: Response, next: NextFunction): void {
  db.oneOrNone(
    `
    SELECT
      i.*,
      u.name AS owner_name,
      u.profile_picture AS owner_avatar
    FROM item i
    JOIN app_user u ON u.user_id = i.owner_id
    WHERE i.item_id = $[id]
    `,
    req.params
  )
    .then((data: ItemWithOwner | null) => returnDataOr404(res, data))
    .catch(next);
}

function createItem(req: Request, res: Response, next: NextFunction): void {
    db.one(
        "INSERT INTO item(name, description, image_url, category, owner_id, request_status, start_date, end_date) VALUES($[name], $[description], $[image_url], $[category], $[owner_id], $[request_status], $[start_date], $[end_date]) RETURNING item_id",
        req.body as ItemInput
    )
        .then((data: { item_id: number }) => res.send(data))
        .catch(next);
}

function updateItem(req: Request, res: Response, next: NextFunction): void {
    const { id } = req.params;
    const updates = req.body as Partial<ItemInput>;
    
    // Build SET clause dynamically based on provided fields
    const fields: string[] = [];
    const values: any = { id };
    
    if (updates.name !== undefined) {
        fields.push('name = $[name]');
        values.name = updates.name;
    }
    if (updates.description !== undefined) {
        fields.push('description = $[description]');
        values.description = updates.description;
    }
    if (updates.image_url !== undefined) {
        fields.push('image_url = $[image_url]');
        values.image_url = updates.image_url;
    }
    if (updates.category !== undefined) {
        fields.push('category = $[category]');
        values.category = updates.category;
    }
    if (updates.request_status !== undefined) {
        fields.push('request_status = $[request_status]');
        values.request_status = updates.request_status;
    }
    if (updates.start_date !== undefined) {
        fields.push('start_date = $[start_date]');
        values.start_date = updates.start_date;
    }
    if (updates.end_date !== undefined) {
        fields.push('end_date = $[end_date]');
        values.end_date = updates.end_date;
    }
    
    if (fields.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
    }
    
    const query = `UPDATE item SET ${fields.join(', ')} WHERE item_id = $[id] RETURNING *`;
    
    db.one(query, values)
        .then((data: Item) => res.send(data))
        .catch(next);
}

function deleteItem(req: Request, res: Response, next: NextFunction): void {
    const { id } = req.params;
    
    // Delete related records first, then the item (in correct order due to foreign keys)
    db.tx(async t => {
        // First, get all borrowing request IDs for this item
        const requests = await t.manyOrNone(
            "SELECT request_id FROM borrowingrequest WHERE item_id = $[id]",
            { id }
        );
        
        // Delete borrowing history for these requests
        if (requests.length > 0) {
            const requestIds = requests.map(r => r.request_id);
            await t.none(
                "DELETE FROM borrowinghistory WHERE request_id = ANY($1)",
                [requestIds]
            );
        }
        
        // Delete borrowing requests
        await t.none("DELETE FROM borrowingrequest WHERE item_id = $[id]", { id });
        
        // Delete related messages
        await t.none("DELETE FROM messages WHERE item_id = $[id]", { id });
        
        // Finally, delete the item
        const result = await t.result("DELETE FROM item WHERE item_id = $[id]", { id });
        
        if (result.rowCount === 0) {
            throw new Error("Item not found");
        }
        
        return { message: "Item deleted successfully" };
    })
    .then((data) => res.json(data))
    .catch((error) => {
        if (error.message === "Item not found") {
            res.status(404).json({ error: "Item not found" });
        } else {
            next(error);
        }
    });
}


// ----------------------------------------------
// Borrowing Requests
// ----------------------------------------------
function readActiveBorrowRequests(_req: Request, res: Response, next: NextFunction): void {
    const query = `
        SELECT r.request_id, u.name AS requester, i.name AS item, r.request_datetime
        FROM borrowingrequest r
        JOIN app_user u ON r.user_id = u.user_id
        JOIN item i ON r.item_id = i.item_id
        WHERE i.request_status = 'pending'
    `;

    db.manyOrNone(query)
        .then((data) => res.send(data))
        .catch(next);
}

function createBorrowRequest(req: Request, res: Response, next: NextFunction): void {
    db.one(
        "INSERT INTO borrowingrequest(user_id, item_id) VALUES($[user_id], $[item_id]) RETURNING request_id",
        req.body as BorrowingRequestInput
    )
        .then((data: { request_id: number }) => res.send(data))
        .catch(next);
}

// ----------------------------------------------
// Messages
// ----------------------------------------------
function readMessages(_req: Request, res: Response, next: NextFunction): void {
    db.manyOrNone("SELECT * FROM messages ORDER BY sent_at")
        .then((rows) => res.send(rows))
        .catch(next);
}

function readUserMessages(req: Request, res: Response, next: NextFunction): void {
    const { userId } = req.params;
    
    // Get all messages where user is sender or receiver, grouped by conversation
    db.manyOrNone(
        `SELECT DISTINCT ON (other_user_id)
            m.message_id,
            m.sender_id,
            m.receiver_id,
            m.item_id,
            m.content,
            m.sent_at,
            CASE 
                WHEN m.sender_id = $[userId] THEN m.receiver_id
                ELSE m.sender_id
            END as other_user_id,
            u.name as other_user_name,
            u.profile_picture as other_user_avatar
        FROM messages m
        JOIN app_user u ON u.user_id = CASE 
            WHEN m.sender_id = $[userId] THEN m.receiver_id
            ELSE m.sender_id
        END
        WHERE m.sender_id = $[userId] OR m.receiver_id = $[userId]
        ORDER BY other_user_id, m.sent_at DESC`,
        { userId }
    )
        .then((rows) => res.send(rows))
        .catch(next);
}

function createMessage(req: Request, res: Response, next: NextFunction): void {
    const { sender_id, receiver_id, item_id, content } = req.body as MessageInput;
    
    // Make item_id optional - only include if provided
    const query = item_id
        ? "INSERT INTO messages(sender_id, receiver_id, item_id, content) VALUES($[sender_id], $[receiver_id], $[item_id], $[content]) RETURNING message_id"
        : "INSERT INTO messages(sender_id, receiver_id, content) VALUES($[sender_id], $[receiver_id], $[content]) RETURNING message_id";
    
    db.one(query, { sender_id, receiver_id, item_id, content })
        .then((data: { message_id: number }) => res.send(data))
        .catch(next);
}