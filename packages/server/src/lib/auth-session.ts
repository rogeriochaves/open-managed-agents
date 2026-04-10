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
export async function initAuth() {
  const db = await getDB();
  const admin = await db.get<any>("SELECT * FROM users WHERE id = ?", "user_admin");
  if (admin && !admin.password_hash) {
    const hash = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);
    await db.run("UPDATE users SET password_hash = ? WHERE id = ?", hash, "user_admin");
    console.log(`Admin user initialized with default password (set OMA_DEFAULT_ADMIN_PASSWORD env to override).`);
  }
}

/**
 * Verify user credentials and return the user if valid.
 */
export async function verifyCredentials(email: string, password: string): Promise<SessionUser | null> {
  const db = await getDB();
  const user = await db.get<any>("SELECT * FROM users WHERE email = ?", email);
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
export async function createSession(userId: string): Promise<string> {
  const db = await getDB();
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const id = newId("sess");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  await db.run(
    "INSERT INTO user_sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    id, userId, tokenHash, expiresAt
  );

  return token;
}

/**
 * Validate a session token and return the user if valid.
 */
export async function validateSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const db = await getDB();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await db.get<any>("SELECT * FROM user_sessions WHERE token_hash = ?", tokenHash);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.run("DELETE FROM user_sessions WHERE id = ?", session.id);
    return null;
  }
  const user = await db.get<any>(
    "SELECT id, email, name, role, organization_id FROM users WHERE id = ?",
    session.user_id
  );
  return user ?? null;
}

/**
 * Delete a session (logout).
 */
export async function deleteSession(token: string) {
  const db = await getDB();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.run("DELETE FROM user_sessions WHERE token_hash = ?", tokenHash);
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
  const db = await getDB();
  const hash = await hashPassword(newPassword);
  await db.run("UPDATE users SET password_hash = ? WHERE id = ?", hash, userId);
}
