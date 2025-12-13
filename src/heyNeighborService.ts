/**
 * HeyNeighbor REST-inspired web service
 * 
 * Features:
 * - Calvin-only authentication with email verification
 * - User profiles with image upload
 * - Item listings with CRUD operations
 * - Messaging system between users
 * - Borrowing request tracking
 *
 * @author: Maham Abrar, Bryn Lamppa
 * @date: Fall 2024
 */
import "dotenv/config";

import express from 'express';
import pgPromise from 'pg-promise';
import path from 'path';
import multer from 'multer';
import * as fs from 'fs';
import nodemailer from 'nodemailer';

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
// Email Configuration & Helpers
// ----------------------------------------------
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Generates a random 6-digit verification code
 * @returns 6-digit string code
 */
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Sends verification email with 6-digit code
 * @param email - Recipient's Calvin email address
 * @param code - 6-digit verification code
 * @param name - Recipient's name for personalization
 */
async function sendVerificationEmail(email: string, code: string, name: string) {
  const mailOptions = {
    from: `"Hey, Neighbor!" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Verify Your Calvin Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #f97316;">Welcome to Hey, Neighbor!</h1>
        <p>Hi ${name},</p>
        <p>Thank you for signing up! Please use the verification code below to complete your registration and join Calvin's sharing community.</p>
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

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Parse JSON request bodies
router.use(express.json());

// ----------------------------------------------
// Routes
// ----------------------------------------------

// Health check
router.get("/", (_req, res) => {
  res.send("Hello from HeyNeighbor API!");
});

// ===== Authentication Routes =====
router.post("/auth/signup", signup);
router.post("/auth/login", login);
router.post("/auth/verify-code", verifyEmailCode);
router.post("/auth/resend-verification", resendVerification);

// ===== User Routes =====
router.get("/users", readUsers);
router.get("/users/:id", readUser);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.post("/users/:id/profile-picture", upload.single('photo'), uploadProfilePicture);

// ===== Item Routes =====
router.get("/items", readItems);
router.get("/items/:id", readItem);
router.post("/items", createItem);
router.post("/items/upload", upload.single('photo'), uploadItemImage);
router.put("/items/:id", updateItem);
router.delete("/items/:id", deleteItem);

// ===== Borrowing Request Routes =====
router.get("/borrow/active", readActiveBorrowRequests);
router.post("/borrow", createBorrowRequest);

// ===== Message Routes =====
router.get("/messages", readMessages);
router.get("/messages/user/:userId", readUserMessages);
router.post("/messages", createMessage);

// ===== Development/Testing Routes =====
// TODO: Remove before production deployment
router.get("/test-email", async (req, res) => {
  try {
    await sendVerificationEmail("test@calvin.edu", "123456", "Test User");
    res.json({ success: true, message: "Email sent! Check your inbox." });
  } catch (error: any) {
    console.error("Email error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.use(router);

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Error:", err.message);
  console.error("Stack:", err.stack);
  res.status(500).json({ error: "Internal server error" });
});

// Start server
app.listen(port, "0.0.0.0", () => {
  console.log(`Listening on http://0.0.0.0:${port}`);
});

// ----------------------------------------------
// Utility Functions
// ----------------------------------------------

/**
 * Helper to return data or 404 if null
 * @param res - Express response object
 * @param data - Data to return or null
 */
function returnDataOr404(res: Response, data: unknown): void {
  if (data == null) {
    res.sendStatus(404);
  } else {
    res.send(data);
  }
}

// ----------------------------------------------
// Authentication Handlers
// ----------------------------------------------

/**
 * Handles user signup with Calvin email verification
 * - Validates @calvin.edu email domain
 * - Generates 6-digit code with 15-min expiration
 * - Sends verification email
 * - Creates unverified user account
 */
function signup(req: Request, res: Response, next: NextFunction): void {
  const { email, name } = req.body as AuthSignupInput;

  if (!email || !name) {
    res.status(400).json({ error: "email and name are required" });
    return;
  }

  // Only allow Calvin College email addresses
  if (!email.endsWith('@calvin.edu')) {
    res.status(400).json({ error: "Must use a Calvin College email address (@calvin.edu)" });
    return;
  }

  const verificationCode = generateVerificationCode();

  db.oneOrNone("SELECT * FROM app_user WHERE email = $[email]", { email })
    .then((existing: User | null) => {
      if (existing) {
        res.status(409).json({ error: "Email already in use" });
        return null;
      }

      // Create user with verification code (expires in 15 minutes)
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

/**
 * Handles user login
 * - Checks if user exists
 * - Verifies email is confirmed
 * - Returns user data on success
 */
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

      // Check if email is verified
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

/**
 * Verifies user's email with 6-digit code
 * - Checks code validity and expiration
 * - Marks user as verified
 * - Clears verification token
 */
function verifyEmailCode(req: Request, res: Response, next: NextFunction): void {
  const { email, code } = req.body;

  if (!email || !code) {
    res.status(400).json({ error: "Email and verification code are required" });
    return;
  }

  // Find user with matching code that hasn't expired
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

      // Mark user as verified and clear verification data
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

/**
 * Resends verification code to user's email
 * - Generates new code with fresh 15-min expiration
 * - Only works for unverified accounts
 */
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

      // Generate new verification code
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
// User Handlers
// ----------------------------------------------

/**
 * Get all users
 */
function readUsers(_req: Request, res: Response, next: NextFunction): void {
  db.manyOrNone("SELECT * FROM app_user")
    .then((data: User[]) => res.send(data))
    .catch(next);
}

/**
 * Get user by ID with full image URLs
 * Converts relative image paths to full URLs based on request host
 */
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

      // Handle uploaded files (start with 'user_')
      if (profile_picture?.startsWith('user_')) {
        profile_picture = `http://${host}/uploads/${profile_picture}`;
      } 
      // Handle localhost URLs in production
      else if (profile_picture?.includes('localhost')) {
        profile_picture = profile_picture.replace(/localhost:\d+/, host);
      }

      res.send({ ...user, profile_picture });
    })
    .catch(next);
}

/**
 * Create a new user
 */
function createUser(req: Request, res: Response, next: NextFunction): void {
  db.one(
    "INSERT INTO app_user(name, profile_picture) VALUES($[name], $[profile_picture]) RETURNING user_id",
    req.body as UserInput
  )
    .then((data: { user_id: number }) => res.send(data))
    .catch(next);
}

/**
 * Update user information
 * Supports partial updates of name, profile_picture, and email
 */
function updateUser(req: Request, res: Response, next: NextFunction): void {
  const { id } = req.params;
  const updates = req.body as Partial<UserInput>;

  // Build SET clause dynamically based on provided fields
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

/**
 * Handle profile picture upload
 * Returns the uploaded filename
 */
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
// Item Handlers
// ----------------------------------------------

/**
 * Get all items with full image URLs
 * Converts relative image paths to full URLs based on request host
 */
function readItems(req: Request, res: Response, next: NextFunction): void {
  db.manyOrNone("SELECT * FROM item")
    .then((items: Item[]) => {
      // Determine host for building full URLs
      let host = req.get('host') || 'localhost:3001';
      const forwardedHost = req.get('x-forwarded-host');
      if (forwardedHost) {
        host = forwardedHost;
      }

      // Convert all image URLs to full paths
      const itemsWithFullUrls = items.map(item => {
        let image_url = item.image_url;

        if (image_url?.startsWith('user_')) {
          image_url = `http://${host}/uploads/${image_url}`;
        }
        else if (image_url?.includes('localhost')) {
          image_url = image_url.replace(/localhost:\d+/, host);
        }

        return { ...item, image_url };
      });

      res.send(itemsWithFullUrls);
    })
    .catch(next);
}

/**
 * Get item by ID with owner information
 * Includes owner name, avatar, and rating
 */
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

      // Convert image URLs to full paths
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

/**
 * Create a new item listing
 */
function createItem(req: Request, res: Response, next: NextFunction): void {
  db.one(
    "INSERT INTO item(name, description, image_url, category, owner_id, request_status, start_date, end_date) VALUES($[name], $[description], $[image_url], $[category], $[owner_id], $[request_status], $[start_date], $[end_date]) RETURNING item_id",
    req.body as ItemInput
  )
    .then((data: { item_id: number }) => res.send(data))
    .catch(next);
}

/**
 * Handle item image upload
 * Returns the uploaded filename (not full URL)
 */
function uploadItemImage(req: Request, res: Response): void {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  // Return just the filename - full URL will be constructed by readItems
  res.json({
    success: true,
    filename: req.file.filename
  });
}

/**
 * Update item information
 * Supports partial updates of any item field
 */
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

/**
 * Delete an item and all related records
 * Cascades through: borrowing history → borrowing requests → messages → item
 */
function deleteItem(req: Request, res: Response, next: NextFunction): void {
  const { id } = req.params;

  // Use transaction to ensure all deletes succeed or fail together
  db.tx(async t => {
    // Get all borrowing request IDs for this item
    const requests = await t.manyOrNone(
      "SELECT request_id FROM borrowingrequest WHERE item_id = $[id]",
      { id }
    );

    // Delete borrowing history first (foreign key constraint)
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
// Borrowing Request Handlers
// ----------------------------------------------

/**
 * Get all active borrowing requests
 * Returns requests for items with 'pending' status
 */
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

/**
 * Create a new borrowing request
 */
function createBorrowRequest(req: Request, res: Response, next: NextFunction): void {
  db.one(
    "INSERT INTO borrowingrequest(user_id, item_id) VALUES($[user_id], $[item_id]) RETURNING request_id",
    req.body as BorrowingRequestInput
  )
    .then((data: { request_id: number }) => res.send(data))
    .catch(next);
}

// ----------------------------------------------
// Message Handlers
// ----------------------------------------------

/**
 * Get all messages ordered by timestamp
 */
function readMessages(_req: Request, res: Response, next: NextFunction): void {
  db.manyOrNone("SELECT * FROM messages ORDER BY sent_at")
    .then((rows) => res.send(rows))
    .catch(next);
}

/**
 * Get user's messages grouped by conversation
 * Returns most recent message per conversation partner
 */
function readUserMessages(req: Request, res: Response, next: NextFunction): void {
  const { userId } = req.params;

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

/**
 * Create a new message
 * item_id is optional - used when message is about a specific item
 */
function createMessage(req: Request, res: Response, next: NextFunction): void {
  const { sender_id, receiver_id, item_id, content } = req.body as MessageInput;

  // Use different query based on whether item_id is provided
  const query = item_id
    ? "INSERT INTO messages(sender_id, receiver_id, item_id, content) VALUES($[sender_id], $[receiver_id], $[item_id], $[content]) RETURNING message_id"
    : "INSERT INTO messages(sender_id, receiver_id, content) VALUES($[sender_id], $[receiver_id], $[content]) RETURNING message_id";

  db.one(query, { sender_id, receiver_id, item_id, content })
    .then((data: { message_id: number }) => res.send(data))
    .catch(next);
}