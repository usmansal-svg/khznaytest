/**
 * Signed staff session — Web Crypto only, so it works in the proxy (Edge)
 * and in route handlers alike. The cookie carries who is signed in; the
 * signature stops it being forged. Nothing secret is inside it.
 *
 * Secret: SESSION_SECRET, or derived from SUPABASE_SERVICE_ROLE_KEY so the
 * founder sets exactly one server-only variable.
 */

export const SESSION_COOKIE = "khz_staff";
export const SESSION_HOURS = 12;

export type StaffSession = {
  id: number;
  name: string;
  role: "tagger" | "qc_senior" | "manager" | "founder" | "photographer";
  outlet_id: number | null;
  exp: number; // unix seconds
};

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sessionSecret(): string | null {
  return process.env.SESSION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || null;
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(session: Omit<StaffSession, "exp">, secret: string, hours = SESSION_HOURS): Promise<string> {
  const payload: StaffSession = { ...session, exp: Math.floor(Date.now() / 1000) + hours * 3600 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = b64url(await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body)));
  return `${body}.${sig}`;
}

export async function verifySession(token: string | undefined | null, secret: string): Promise<StaffSession | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot), sig = token.slice(dot + 1);
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await key(secret), unb64url(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const session = JSON.parse(new TextDecoder().decode(unb64url(body))) as StaffSession;
    if (!session.exp || session.exp < Math.floor(Date.now() / 1000)) return null;
    if (typeof session.id !== "number" || !session.role) return null;
    return session;
  } catch {
    return null;
  }
}

export const MANAGER_ROLES = new Set<StaffSession["role"]>(["manager", "founder"]);
