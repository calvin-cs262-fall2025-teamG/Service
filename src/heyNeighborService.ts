/**
 * HeyNeighbor REST-inspired web service
 *
 * - Written in TypeScript with Node type-stripping (Node 22+)
 * - Uses pgPromise with built-in SQL injection protection
 * - Has CRUD endpoints for User, Item, Messages
 * - Includes authentication (signup/login)
 * - install required packages: npm install bcrypt cors, npm install --save-dev @types/bcrypt @types/cors
 *
 * @author: Team G - Maham Abrar
 * @date: Fall 2025
 */

import express from 'express';
import pgPromise from 'pg-promise';
import bcrypt from 'bcrypt';
import cors from 'cors';

import type { Request, Response, NextFunction } from 'express';
import type { User } from './types/user.js';
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

// Enable CORS for React Native client
app.use(cors());
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

// ===== Items =====
router.get("/items", readItems);
router.get("/items/:id", readItem);
router.post("/items", createItem);
router.put("/items/:id", updateItem);
router.delete("/items/:id", deleteItem);

// ===== Messages =====
router.get("/messages", readMessages);
router.get("/messages/conversation", readConversation);
router.post("/messages", createMessage);

app.use(router);

// Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Error:", err.message);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
    console.log(`HeyNeighbor API listening on port ${port}`);
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
// Auth Endpoints
// ----------------------------------------------
async function signup(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { email, password, name } = req.body;

    // Validate Calvin email
    if (!email || !email.toLowerCase().endsWith('@calvin.edu')) {
        res.status(400).json({ error: 'Please use your @calvin.edu email' });
        return;
    }

    if (!password || password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters' });
        return;
    }

    if (!name || name.trim().length === 0) {
        res.status(400).json({ error: 'Name is required' });
        return;
    }

    try {
        // Check if user already exists
        const existingUser = await db.oneOrNone(
            'SELECT user_id FROM app_user WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existingUser) {
            res.status(409).json({ error: 'Email already registered' });
            return;
        }

        // Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Insert new user
        const newUser = await db.one(
            `INSERT INTO app_user (email, name, password_hash) 
             VALUES ($1, $2, $3) 
             RETURNING user_id, email, name, rating, avatar_url, created_at`,
            [email.toLowerCase(), name.trim(), passwordHash]
        );

        res.status(201).json({
            message: 'User created successfully',
            user: newUser
        });
    } catch (error) {
        next(error);
    }
}

async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
    }

    try {
        // Find user
        const user = await db.oneOrNone(
            'SELECT user_id, email, name, password_hash, rating, avatar_url FROM app_user WHERE email = $1',
            [email.toLowerCase()]
        );

        if (!user) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        // Don't send password hash to client
        const { password_hash, ...userWithoutPassword } = user;

        res.json({
            message: 'Login successful',
            user: userWithoutPassword
        });
    } catch (error) {
        next(error);
    }
}

// ----------------------------------------------
// User Endpoints
// ----------------------------------------------
function readUsers(_req: Request, res: Response, next: NextFunction): void {
    db.manyOrNone('SELECT user_id, email, name, avatar_url, rating, created_at FROM app_user')
        .then((data: User[]) => res.send(data))
        .catch(next);
}

function readUser(req: Request, res: Response, next: NextFunction): void {
    db.oneOrNone(
        'SELECT user_id, email, name, avatar_url, rating, created_at FROM app_user WHERE user_id = $1',
        [req.params.id]
    )
        .then((data: User | null) => returnDataOr404(res, data))
        .catch(next);
}

// ----------------------------------------------
// Item Endpoints
// ----------------------------------------------
function readItems(_req: Request, res: Response, next: NextFunction): void {
    const query = `
        SELECT 
            i.item_id, 
            i.name, 
            i.description, 
            i.image_url, 
            i.category, 
            i.status,
            i.created_at,
            u.user_id AS owner_id,
            u.name AS owner_name,
            u.avatar_url AS owner_avatar,
            u.rating AS owner_rating
        FROM Item i
        JOIN app_user u ON i.owner_id = u.user_id
        ORDER BY i.created_at DESC
    `;

    db.manyOrNone(query)
        .then((data: Item[]) => res.send(data))
        .catch(next);
}

function readItem(req: Request, res: Response, next: NextFunction): void {
    const query = `
        SELECT 
            i.item_id, 
            i.name, 
            i.description, 
            i.image_url, 
            i.category, 
            i.status,
            i.created_at,
            u.user_id AS owner_id,
            u.name AS owner_name,
            u.email AS owner_email,
            u.avatar_url AS owner_avatar,
            u.rating AS owner_rating
        FROM Item i
        JOIN app_user u ON i.owner_id = u.user_id
        WHERE i.item_id = $1
    `;

    db.oneOrNone(query, [req.params.id])
        .then((data: Item | null) => returnDataOr404(res, data))
        .catch(next);
}

function createItem(req: Request, res: Response, next: NextFunction): void {
    db.one(
        `INSERT INTO Item(name, description, image_url, category, owner_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING item_id`,
        [
            req.body.name,
            req.body.description,
            req.body.image_url,
            req.body.category,
            req.body.owner_id,
            req.body.status || 'available'
        ]
    )
        .then((data: { item_id: number }) => res.status(201).send(data))
        .catch(next);
}

function updateItem(req: Request, res: Response, next: NextFunction): void {
    const updates = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic UPDATE query
    if (req.body.name) {
        updates.push(`name = $${paramCount++}`);
        values.push(req.body.name);
    }
    if (req.body.description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        values.push(req.body.description);
    }
    if (req.body.status) {
        updates.push(`status = $${paramCount++}`);
        values.push(req.body.status);
    }
    if (req.body.category) {
        updates.push(`category = $${paramCount++}`);
        values.push(req.body.category);
    }

    if (updates.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
    }

    values.push(req.params.id); // item_id

    db.one(
        `UPDATE Item SET ${updates.join(', ')} WHERE item_id = $${paramCount} RETURNING item_id`,
        values
    )
        .then((data: { item_id: number }) => res.send(data))
        .catch(next);
}

function deleteItem(req: Request, res: Response, next: NextFunction): void {
    db.result('DELETE FROM Item WHERE item_id = $1', [req.params.id])
        .then((result) => {
            if (result.rowCount === 0) {
                res.sendStatus(404);
            } else {
                res.sendStatus(204);
            }
        })
        .catch(next);
}

// ----------------------------------------------
// Messages
// ----------------------------------------------
function readMessages(_req: Request, res: Response, next: NextFunction): void {
    const query = `
        SELECT 
            m.message_id,
            m.sender_id,
            m.receiver_id,
            m.item_id,
            m.content,
            m.sent_at,
            sender.name AS sender_name,
            sender.avatar_url AS sender_avatar,
            receiver.name AS receiver_name
        FROM Messages m
        JOIN app_user sender ON m.sender_id = sender.user_id
        JOIN app_user receiver ON m.receiver_id = receiver.user_id
        ORDER BY m.sent_at DESC
    `;

    db.manyOrNone(query)
        .then((rows) => res.send(rows))
        .catch(next);
}

// Get conversation between two users
function readConversation(req: Request, res: Response, next: NextFunction): void {
    const { user1_id, user2_id } = req.query;

    if (!user1_id || !user2_id) {
        res.status(400).json({ error: 'user1_id and user2_id are required' });
        return;
    }

    const query = `
        SELECT 
            m.message_id,
            m.sender_id,
            m.receiver_id,
            m.item_id,
            m.content,
            m.sent_at,
            sender.name AS sender_name,
            sender.avatar_url AS sender_avatar
        FROM Messages m
        JOIN app_user sender ON m.sender_id = sender.user_id
        WHERE (m.sender_id = $1 AND m.receiver_id = $2)
           OR (m.sender_id = $2 AND m.receiver_id = $1)
        ORDER BY m.sent_at ASC
    `;

    db.manyOrNone(query, [user1_id, user2_id])
        .then((rows) => res.send(rows))
        .catch(next);
}

function createMessage(req: Request, res: Response, next: NextFunction): void {
    db.one(
        `INSERT INTO Messages(sender_id, receiver_id, item_id, content)
         VALUES ($1, $2, $3, $4)
         RETURNING message_id, sent_at`,
        [
            req.body.sender_id,
            req.body.receiver_id,
            req.body.item_id || null,
            req.body.content
        ]
    )
        .then((data: { message_id: number; sent_at: Date }) => res.status(201).send(data))
        .catch(next);
}