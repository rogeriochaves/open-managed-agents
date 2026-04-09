import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

let encryptionKey: Buffer | null = null;

/**
 * Initialize the encryption module.
 * Reads VAULT_ENCRYPTION_KEY from env, or generates one and writes to .env.
 */
export function initEncryption(): void {
  const keyHex = process.env.VAULT_ENCRYPTION_KEY;

  if (keyHex) {
    if (keyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(keyHex)) {
      throw new Error(
        "VAULT_ENCRYPTION_KEY must be 64 hex characters (32 bytes)"
      );
    }
    encryptionKey = Buffer.from(keyHex, "hex");
    return;
  }

  // Auto-generate key on first run
  const newKey = randomBytes(KEY_LENGTH);
  const newKeyHex = newKey.toString("hex");

  const envPath = resolve(process.cwd(), ".env");
  const envContent = existsSync(envPath)
    ? readFileSync(envPath, "utf-8")
    : "";

  const line = `VAULT_ENCRYPTION_KEY=${newKeyHex}`;
  const updated = envContent.includes("VAULT_ENCRYPTION_KEY")
    ? envContent.replace(/^VAULT_ENCRYPTION_KEY=.*$/m, line)
    : envContent + (envContent.endsWith("\n") ? "" : "\n") + line + "\n";

  writeFileSync(envPath, updated, "utf-8");
  encryptionKey = newKey;

  console.warn(
    "Generated new VAULT_ENCRYPTION_KEY - back this up! Written to .env"
  );
}

function getKey(): Buffer {
  if (!encryptionKey) {
    throw new Error(
      "Encryption not initialized. Call initEncryption() first."
    );
  }
  return encryptionKey;
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string: IV (12) + ciphertext + authTag (16).
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: IV + ciphertext + authTag
  const packed = Buffer.concat([iv, encrypted, authTag]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64 string produced by encrypt().
 * Returns the original plaintext.
 */
export function decrypt(encoded: string): string {
  const key = getKey();
  const packed = Buffer.from(encoded, "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted data: too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(packed.length - AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH, packed.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf-8");
}

/**
 * Check if encryption is initialized and ready.
 */
export function isEncryptionReady(): boolean {
  return encryptionKey !== null;
}
