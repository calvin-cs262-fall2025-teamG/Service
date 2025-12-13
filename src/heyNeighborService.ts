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
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

import type { Request, Response, NextFunction } from 'express';
import type { User, UserInput } from './types/user.js';
import type { Item, ItemInput } from './types/item.js';
import type { BorrowingRequestInput } from './types/borrowingrequest.js';
import type { MessageInput } from './types/messages.js';

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
// Email Setup
// ----------------------------------------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email: string, code: string, name: string) {
  const mailOptions = {
    from: `"Hey, Nieghbor!" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your Calvin Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">Welcome to Hey, Neighbor!</h1>
        <p>Hi ${name},</p>
        <p>Thank you for signing up! Please use the verification code below to complete your registration.</p>
        <div style="background-color: #f3f4f6; padding: 20px; margin: 30px 0; text-align: center; border-radius: 8px;">
          <h2 style="color: #f97316; font-size: 32px; letter-spacing: 8px; margin: 0;">${code}</h2>
        </div>
        <p>Enter this code in the app to verify your email address.</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 30px;">
          This code will expire in 15 minutes. If you didn't create an account, please ignore this email.
        </p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
}

// ----------------------------------------------
// Express Setup
// ----------------------------------------------
const app = express();
const router = express.Router();
const port = parseInt(process.env.PORT as string) || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `user_${req.body.userId || 'unknown'}_${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

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
router.post("/auth/verify-code", verifyEmailCode);
router.post("/auth/resend-verification", resendVerification);

// ===== Users =====
router.get("/users", readUsers);
router.get("/users/:id", readUser);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.post("/users/:id/profile-picture", upload.single('photo'), uploadProfilePicture);

// ===== Items =====
router.get("/items", readItems);
router.get("/items/:id", readItem);
router.post("/items", createItem);
router.post("/items/upload", upload.single('photo'), uploadItemImage);
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

router.get("/test-email", async (req, res) => {
  try {
    await sendVerificationEmail("YOUR_CALVIN_EMAIL@calvin.edu", "123456", "Test User");
    res.json({ success: true, message: "Email sent! Check your inbox." });
  } catch (error: any) {
    console.error("Email error:", error);
    res.status(500).json({ error: error.message });
  }
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
function signup(req: Request, res: Response, next: NextFunction): void {
  const { email, name } = req.body as AuthSignupInput;

  if (!email || !name) {
    res.status(400).json({ error: "email and name are required" });
    return;
  }

  // Check if email ends with @calvin.edu
  if (!email.endsWith('@calvin.edu')) {
    res.status(400).json({ error: "Must use a Calvin College email address (@calvin.edu)" });
    return;
  }

  const verificationCode = generateVerificationCode();
  const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // Use ISO string for UTC

  db.oneOrNone("SELECT * FROM app_user WHERE email = $[email]", { email })
    .then((existing: User | null) => {
      if (existing) {
        res.status(409).json({ error: "Email already in use" });
        return null;
      }

      return db.one(
        `INSERT INTO app_user (email, name, verification_token, is_verified, token_expires_at) 
   VALUES ($[email], $[name], $[verificationCode], false, NOW() + INTERVAL '15 minutes') 
   RETURNING *`,
        { email, name, verificationCode }
      );
    })
    .then(async (created: User | null) => {
      if (!created) return;

      try {
        await sendVerificationEmail(email, verificationCode, name);
        res.json({
          message: "Signup successful. Please check your email for a verification code.",
          requiresVerification: true,
          email: email
        });
      } catch (emailError) {
        console.error("Failed to send verification email:", emailError);
        res.status(500).json({ error: "Account created but failed to send verification email." });
      }
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

      if (!user.is_verified) {
        res.status(403).json({
          error: "Email not verified. Please check your inbox for the verification code.",
          requiresVerification: true,
          email: user.email
        });
        return;
      }

      res.json({ message: "Login successful", user });
    })
    .catch(next);
}

function verifyEmailCode(req: Request, res: Response, next: NextFunction): void {
  const { email, code } = req.body;

  if (!email || !code) {
    res.status(400).json({ error: "Email and verification code are required" });
    return;
  }

  db.oneOrNone(
    `SELECT * FROM app_user 
     WHERE email = $[email] 
     AND verification_token = $[code]
     AND token_expires_at > NOW()`,
    { email, code }
  )
    .then((user: User | null) => {
      if (!user) {
        res.status(400).json({ error: "Invalid or expired verification code" });
        return null;
      }

      if (user.is_verified) {
        res.json({ message: "Email already verified", alreadyVerified: true, user });
        return null;
      }

      // FIX: Mark as verified, don't generate new code
      return db.one(
        `UPDATE app_user 
         SET is_verified = true, 
             verification_token = NULL,
             token_expires_at = NULL
         WHERE user_id = $[user_id]
         RETURNING *`,
        { user_id: user.user_id }
      );
    })
    .then((updated: User | null) => {
      if (!updated) return;

      res.json({
        message: "Email verified successfully!",
        verified: true,
        user: updated
      });
    })
    .catch(next);
}

function resendVerification(req: Request, res: Response, next: NextFunction): void {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  db.oneOrNone("SELECT * FROM app_user WHERE email = $[email]", { email })
    .then((user: User | null) => {
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return null;
      }

      if (user.is_verified) {
        res.status(400).json({ error: "Email is already verified" });
        return null;
      }

      const verificationCode = generateVerificationCode();

      return db.one(
        `UPDATE app_user 
         SET verification_token = $[verificationCode],
             token_expires_at = NOW() + INTERVAL '15 minutes'
         WHERE user_id = $[user_id]
         RETURNING *`,
        { verificationCode, user_id: user.user_id }
      ).then(async (updated: User) => {
        await sendVerificationEmail(email, verificationCode, updated.name);
        return updated;
      });
    })
    .then((updated: User | null) => {
      if (!updated) return;

      res.json({
        message: "Verification code sent. Please check your email.",
        sent: true
      });
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
    .then((user: User | null) => {
      if (!user) {
        res.sendStatus(404);
        return;
      }

      // Convert profile picture filename to full URL
      let host = req.get('host') || 'localhost:3001';
      const forwardedHost = req.get('x-forwarded-host');
      if (forwardedHost) {
        host = forwardedHost;
      }

      let profile_picture = user.profile_picture;

      if (profile_picture?.startsWith('user_')) {
        profile_picture = `http://${host}/uploads/${profile_picture}`;
      } else if (profile_picture?.includes('localhost')) {
        profile_picture = profile_picture.replace(/localhost:\d+/, host);
      }

      res.send({ ...user, profile_picture });
    })
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

function updateUser(req: Request, res: Response, next: NextFunction): void {
  const { id } = req.params;
  const updates = req.body as Partial<UserInput>;

  // Build SET clause dynamically
  const fields: string[] = [];
  const values: any = { id };

  if (updates.name !== undefined) {
    fields.push('name = $[name]');
    values.name = updates.name;
  }
  if (updates.profile_picture !== undefined) {
    fields.push('profile_picture = $[profile_picture]');
    values.profile_picture = updates.profile_picture;
  }
  if (updates.email !== undefined) {
    fields.push('email = $[email]');
    values.email = updates.email;
  }

  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  const query = `UPDATE app_user SET ${fields.join(', ')} WHERE user_id = $[id] RETURNING *`;

  db.one(query, values)
    .then((data: User) => res.send(data))
    .catch(next);
}

function uploadProfilePicture(req: Request, res: Response): void {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  res.json({
    success: true,
    filename: req.file.filename
  });
}

// ----------------------------------------------
// Item Endpoints
// ----------------------------------------------
function readItems(req: Request, res: Response, next: NextFunction): void {
  db.manyOrNone("SELECT * FROM item")
    .then((items: Item[]) => {
      // Get host from request, but handle both localhost and actual IP
      let host = req.get('host') || 'localhost:3001';

      // If request came from actual IP (not localhost), use that
      const forwardedHost = req.get('x-forwarded-host');
      if (forwardedHost) {
        host = forwardedHost;
      }

      const itemsWithFullUrls = items.map(item => {
        let image_url = item.image_url;

        // If it starts with user_, convert to full URL
        if (image_url?.startsWith('user_')) {
          image_url = `http://${host}/uploads/${image_url}`;
        }
        // If it's already a full URL but uses localhost, replace with actual host
        else if (image_url?.includes('localhost')) {
          image_url = image_url.replace(/localhost:\d+/, host);
        }

        return { ...item, image_url };
      });

      res.send(itemsWithFullUrls);
    })
    .catch(next);
}

function readItem(req: Request, res: Response, next: NextFunction): void {
  db.oneOrNone(
    `SELECT 
            i.item_id,
            i.name,
            i.description,
            i.image_url,
            i.category,
            i.owner_id,
            i.request_status,
            i.start_date,
            i.end_date,
            u.name as owner_name,
            u.profile_picture as owner_avatar,
            u.rating as owner_rating
         FROM item i
         LEFT JOIN app_user u ON i.owner_id = u.user_id
         WHERE i.item_id = $[id]`,
    req.params
  )
    .then((item: any) => {
      if (!item) {
        res.sendStatus(404);
        return;
      }

      // Get host from request
      let host = req.get('host') || 'localhost:3001';
      const forwardedHost = req.get('x-forwarded-host');
      if (forwardedHost) {
        host = forwardedHost;
      }

      let image_url = item.image_url;
      let owner_avatar = item.owner_avatar;

      // Convert item image to full URL
      if (image_url?.startsWith('user_')) {
        image_url = `http://${host}/uploads/${image_url}`;
      } else if (image_url?.includes('localhost')) {
        image_url = image_url.replace(/localhost:\d+/, host);
      }

      // Convert owner avatar to full URL
      if (owner_avatar?.startsWith('user_')) {
        owner_avatar = `http://${host}/uploads/${owner_avatar}`;
      } else if (owner_avatar?.includes('localhost')) {
        owner_avatar = owner_avatar.replace(/localhost:\d+/, host);
      }

      res.send({ ...item, image_url, owner_avatar });
    })
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

function uploadItemImage(req: Request, res: Response): void {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  // Return just the filename, not the full URL
  // The readItems function will construct the full URL based on the request host
  res.json({
    success: true,
    filename: req.file.filename
  });
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