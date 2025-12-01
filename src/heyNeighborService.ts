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

import express from 'express';
import pgPromise from 'pg-promise';

import type { Request, Response, NextFunction } from 'express';
import type { User, UserInput } from './types/user.js';
import type { Item, ItemInput } from './types/item.js';
import type { BorrowingRequestInput } from './types/borrowingrequest.js';
import type { MessageInput } from './types/messages.js';

// ----------------------------------------------
// Database Setup
// ----------------------------------------------
const db = pgPromise()({
    host: process.env.DB_SERVER,
    port: parseInt(process.env.DB_PORT as string) || 5432,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
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

// ===== Users =====
router.get("/users", readUsers);
router.get("/users/:id", readUser);
router.post("/users", createUser);

// ===== Items =====
router.get("/items", readItems);
router.get("/items/:id", readItem);
router.post("/items", createItem);

// ===== Borrowing Requests =====
router.get("/borrow/active", readActiveBorrowRequests);
router.post("/borrow", createBorrowRequest);

// ===== Messages =====
router.get("/messages", readMessages);
router.post("/messages", createMessage);

app.use(router);

// Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
    console.log(`Listening on port ${port}`);
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
// User Endpoints
// ----------------------------------------------
function readUsers(_req: Request, res: Response, next: NextFunction): void {
    db.manyOrNone("SELECT * FROM App_User")
        .then((data: User[]) => res.send(data))
        .catch(next);
}

function readUser(req: Request, res: Response, next: NextFunction): void {
    db.oneOrNone("SELECT * FROM App_User WHERE user_id = ${id}", req.params)
        .then((data: User | null) => returnDataOr404(res, data))
        .catch(next);
}

function createUser(req: Request, res: Response, next: NextFunction): void {
    db.one(
        "INSERT INTO App_User(name, profile_picture) VALUES(${name}, ${profile_picture}) RETURNING user_id",
        req.body as UserInput
    )
        .then((data: { user_id: number }) => res.send(data))
        .catch(next);
}

// ----------------------------------------------
// Item Endpoints
// ----------------------------------------------
function readItems(_req: Request, res: Response, next: NextFunction): void {
    db.manyOrNone("SELECT * FROM Item")
        .then((data: Item[]) => res.send(data))
        .catch(next);
}

function readItem(req: Request, res: Response, next: NextFunction): void {
    db.oneOrNone("SELECT * FROM Item WHERE item_id = ${id}", req.params)
        .then((data: Item | null) => returnDataOr404(res, data))
        .catch(next);
}

function createItem(req: Request, res: Response, next: NextFunction): void {
    db.one(
        `INSERT INTO Item(name, description, image_url, category, owner_id, request_status, start_date, end_date)
         VALUES (\${name}, \${description}, \${image_url}, \${category}, \${owner_id}, \${request_status}, \${start_date}, \${end_date})
         RETURNING item_id`,
        req.body as ItemInput
    )
        .then((data: { item_id: number }) => res.send(data))
        .catch(next);
}


// ----------------------------------------------
// Borrowing Requests
// ----------------------------------------------
function readActiveBorrowRequests(_req: Request, res: Response, next: NextFunction): void {
    const query = `
        SELECT r.request_id, u.name AS requester, i.name AS item, r.request_datetime
        FROM BorrowingRequest r
        JOIN App_User u ON r.user_id = u.user_id
        JOIN Item i ON r.item_id = i.item_id
        WHERE i.request_status = 'pending'
    `;

    db.manyOrNone(query)
        .then((data) => res.send(data))
        .catch(next);
}

function createBorrowRequest(req: Request, res: Response, next: NextFunction): void {
    db.one(
        "INSERT INTO BorrowingRequest(user_id, item_id) VALUES(${user_id}, ${item_id}) RETURNING request_id",
        req.body as BorrowingRequestInput
    )
        .then((data: { request_id: number }) => res.send(data))
        .catch(next);
}

// ----------------------------------------------
// Messages
// ----------------------------------------------
function readMessages(_req: Request, res: Response, next: NextFunction): void {
    db.manyOrNone("SELECT * FROM Messages ORDER BY sent_at")
        .then((rows) => res.send(rows))
        .catch(next);
}

function createMessage(req: Request, res: Response, next: NextFunction): void {
    db.one(
        `INSERT INTO Messages(sender_id, receiver_id, item_id, content)
         VALUES (\${sender_id}, \${receiver_id}, \${item_id}, \${content})
         RETURNING message_id`,
        req.body as MessageInput
    )
        .then((data: { message_id: number }) => res.send(data))
        .catch(next);
}
