/**
 * Session-based authentication for Open Managed Agents.
 *
 * - Bcrypt password hashing
 * - SHA-256 hashed session tokens stored in DB
 * - Cookie-based session auth
 * - Defaults to an admin/admin user on first run (must be changed)
 */

import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { getDB, newId } from "../db/index.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DEFAULT_ADMIN_PASSWORD = process.env.OMA_DEFAULT_ADMIN_PASSWORD ?? "admin";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string | null;
}

/**
 * Initialize auth: ensure the default admin user has a password hash set.
 */
export function initAuth() {
  const db = getDB();
  const admin = db.prepare("SELECT * FROM users WHERE id = ?").get("user_admin") as any;
  if (admin && !admin.password_hash) {
    const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, "user_admin");
    console.log(`Admin user initialized with default password (set OMA_DEFAULT_ADMIN_PASSWORD env to override).`);
  }
}

/**
 * Verify user credentials and return the user if valid.
 */
export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const db = getDB();
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
  if (!user || !user.password_hash) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organization_id: user.organization_id,
  };
}

/**
 * Create a new session and return the plaintext token (to set as cookie).
 */
export function createSession(userId: string): string {
  const db = getDB();
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = newId("sess");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  db.prepare(
    "INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)"
  ).run(id, userId, tokenHash, expiresAt);

  return token;
}

/**
 * Validate a session token and return the user if valid.
 */
export function validateSession(token: string | undefined): SessionUser | null {
  if (!token) return null;
  const db = getDB();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = db.prepare("SELECT * FROM user_sessions WHERE token_hash = ?").get(tokenHash) as any;
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM user_sessions WHERE id = ?").run(session.id);
    return null;
  }
  const user = db.prepare("SELECT id, email, name, role, organization_id FROM users WHERE id = ?").get(session.user_id) as any;
  return user ?? null;
}

/**
 * Delete a session (logout).
 */
export function deleteSession(token: string) {
  const db = getDB();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  db.prepare("DELETE FROM user_sessions WHERE token_hash = ?").run(tokenHash);
}

/**
 * Hash a password for storage.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

/**
 * Change a user's password.
 */
export async function changePassword(userId: string, newPassword: string) {
  const db = getDB();
  const hash = await hashPassword(newPassword);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, userId);
}
