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
import bcrypt from "bcrypt";

import type { Request, Response, NextFunction } from 'express';
import type { User, UserInput } from './types/user.js';
import type { Item, ItemInput } from './types/item.js';
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

// ===== Messages =====
router.get("/messages", readMessages);
router.post("/messages", createMessage);

// ===== Authentication =====
router.post("/auth/signup", async (req: Request, res: Response, next: NextFunction) => {
    // Signup logic here
});

router.post("/auth/login", async (req: Request, res: Response, next: NextFunction) => {
    // Login logic here
});

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
    db.manyOrNone("SELECT user_id, email, name, avatar_url, created_at FROM app_user")
        .then((data: User[]) => res.send(data))
        .catch(next);
}

function readUser(req: Request, res: Response, next: NextFunction): void {
    db.oneOrNone("SELECT user_id, email, name, avatar_url, created_at FROM app_user WHERE user_id = $1", [req.params.id])
        .then((data: User | null) => returnDataOr404(res, data))
        .catch(next);
}

function createUser(req: Request, res: Response, next: NextFunction): void {
    const { email, name, password_hash, avatar_url } = req.body;

    if (!email || !name || !password_hash) {
        res.status(400).json({ error: "Missing required fields: email, name, or password_hash" });
        return;
    }

    db.one(
        "INSERT INTO app_user(email, name, password_hash, avatar_url) VALUES($1, $2, $3, $4) RETURNING user_id, email, name, avatar_url, created_at",
        [email, name, password_hash, avatar_url || null]
    )
        .then((data: User) => res.status(201).json(data))
        .catch(next);
}

// ----------------------------------------------
// Item Endpoints
// ----------------------------------------------
function readItems(_req: Request, res: Response, next: NextFunction): void {
    const query = `
        SELECT i.*, 
               u.name AS owner_name, 
               u.email AS owner_email, 
               u.avatar_url AS owner_avatar
        FROM Item i
        JOIN app_user u ON i.owner_id = u.user_id
        ORDER BY i.created_at DESC
    `;
    db.manyOrNone(query)
        .then((data: Item[]) => res.json(data))
        .catch(next);
}

function readItem(req: Request, res: Response, next: NextFunction): void {
    const query = `
        SELECT i.*, 
               u.name AS owner_name, 
               u.email AS owner_email, 
               u.avatar_url AS owner_avatar
        FROM Item i
        JOIN app_user u ON i.owner_id = u.user_id
        WHERE i.item_id = $1
    `;
    db.oneOrNone(query, [req.params.id])
        .then((data: Item | null) => returnDataOr404(res, data))
        .catch(next);
}

function createItem(req: Request, res: Response, next: NextFunction): void {
    const { name, description, image_url, category, owner_id, status } = req.body;

    if (!name || !owner_id) {
        res.status(400).json({ error: "Missing required fields: name or owner_id" });
        return;
    }

    db.one(
        `INSERT INTO Item(name, description, image_url, category, owner_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING item_id, name, description, image_url, category, owner_id, status, created_at`,
        [name, description || null, image_url || null, category || null, owner_id, status || "available"]
    )
        .then((data: Item) => res.status(201).json(data))
        .catch(next);
}

// ----------------------------------------------
// Messages
// ----------------------------------------------
function readMessages(_req: Request, res: Response, next: NextFunction): void {
    const query = `
        SELECT m.*, 
               sender.name AS sender_name, 
               sender.avatar_url AS sender_avatar,
               receiver.name AS receiver_name
        FROM Messages m
        JOIN app_user sender ON m.sender_id = sender.user_id
        JOIN app_user receiver ON m.receiver_id = receiver.user_id
        ORDER BY m.sent_at DESC
    `;
    db.manyOrNone(query)
        .then((rows) => res.json(rows))
        .catch(next);
}

function createMessage(req: Request, res: Response, next: NextFunction): void {
    const { sender_id, receiver_id, item_id, content } = req.body;

    if (!sender_id || !receiver_id || !content) {
        res.status(400).json({ error: "Missing required fields: sender_id, receiver_id, or content" });
        return;
    }

    db.one(
        `INSERT INTO Messages(sender_id, receiver_id, item_id, content)
         VALUES ($1, $2, $3, $4)
         RETURNING message_id, sender_id, receiver_id, item_id, content, sent_at`,
        [sender_id, receiver_id, item_id || null, content]
    )
        .then((data) => res.status(201).json(data))
        .catch(next);
}

// ===== Authentication =====
router.post("/auth/signup", async (req: Request, res: Response, next: NextFunction) => {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
        res.status(400).json({ error: "Missing required fields: email, password, or name" });
        return;
    }

    try {
        // Check if the user already exists
        const existingUser = await db.oneOrNone("SELECT user_id FROM app_user WHERE email = $1", [email]);
        if (existingUser) {
            res.status(409).json({ error: "Email is already registered" });
            return;
        }

        // Hash the password
        const passwordHash = await bcrypt.hash(password, 10);

        // Insert the user into the database
        const user = await db.one(
            `INSERT INTO app_user (email, name, password_hash, avatar_url, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING user_id, email, name, avatar_url, created_at`,
            [email, name, passwordHash, null]
        );

        res.status(201).json({ user });
    } catch (error) {
        console.error("Signup error:", error);
        next(error);
    }
});

router.post("/auth/login", async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).json({ error: "Missing required fields: email or password" });
        return;
    }

    try {
        // Find the user by email
        const user = await db.oneOrNone(
            "SELECT user_id, email, name, password_hash, avatar_url, created_at FROM app_user WHERE email = $1",
            [email]
        );

        if (!user) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        // Compare the provided password with the stored hash
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        // Exclude the password hash from the response
        const { password_hash, ...userWithoutPassword } = user;

        res.json({ user: userWithoutPassword });
    } catch (error) {
        console.error("Login error:", error);
        next(error);
    }
});