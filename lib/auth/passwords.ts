// Password hashing via Node's built-in crypto.scrypt — deliberately not
// bcrypt/argon2, which ship as native addons and add prebuild-matching
// risk on whatever container ends up building/running this (Cloud Run,
// Vercel's function runtime, etc.). Node already has a well-reviewed KDF
// built in; no extra dependency needed.

import "server-only";
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const SALT_BYTES = 16;
const KEY_LENGTH = 64;
// OWASP-minimum cost parameters for scrypt as of this writing.
const SCRYPT_PARAMS: ScryptOptions = { N: 16384, r: 8, p: 1 };

function deriveKey(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, SCRYPT_PARAMS, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const storedKey = Buffer.from(keyHex, "hex");
  const derivedKey = await deriveKey(password, salt, storedKey.length);

  if (derivedKey.length !== storedKey.length) return false;
  return timingSafeEqual(derivedKey, storedKey);
}
