/**
 * PIN hashing — Node runtime only (scrypt). PINs are 4–6 digits; the salt
 * and cost make offline guessing slow, and the login route rate-limits.
 */

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384, R = 8, P = 1, KEYLEN = 32;

export const PIN_PATTERN = /^\d{4,6}$/;

export function hashPin(pin: string): string {
  if (!PIN_PATTERN.test(pin)) throw new Error("PIN must be 4 to 6 digits.");
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !PIN_PATTERN.test(pin)) return false;
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(pin, Buffer.from(saltB64, "base64"), expected.length, { N, r: R, p: P });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
