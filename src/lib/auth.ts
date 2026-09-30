import { ExpressAuth, getSession, type ExpressAuthConfig } from "@auth/express";
import Credentials from "@auth/express/providers/credentials";
import type { Express, Request, Response, NextFunction } from "express";
import { compare, hash, hashSync } from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { query, dbEnabled, runWithUser } from "./db";

export interface AuthUser { id: string; email: string; name?: string | null; emailVerified?: Date | string | null }
interface UserRow extends AuthUser { password_hash: string | null }
const requestUsers = new WeakMap<Request, Promise<AuthUser | null>>();
const dummyHash = hashSync(randomBytes(32).toString("hex"), 12);
let config: ExpressAuthConfig | undefined;
export function authEnabled(): boolean { return true; }
export function normalizeEmail(value: unknown): string { return typeof value === "string" ? value.trim().toLowerCase() : ""; }
function validEmail(value: string): boolean { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
export function validNewPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 12 && Buffer.byteLength(value, "utf8") <= 72;
}
export function claimHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function authConfig(): ExpressAuthConfig {
  if (config) return config;
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET must contain at least 32 random characters.");
  if (!dbEnabled()) throw new Error("A database is required for authentication. Use npm run demo for the isolated fixture preview.");
  config = {
    secret: process.env.AUTH_SECRET, basePath: "/auth", trustHost: true,
    session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
    pages: { signIn: "/signin", error: "/signin" },
    providers: [Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials) {
        const email = normalizeEmail(credentials.email);
        const password = typeof credentials.password === "string" ? credentials.password : "";
        if (!validEmail(email) || !password || Buffer.byteLength(password, "utf8") > 72) return null;
        const user = (await query<UserRow>("select id,email,name,password_hash from public.users where lower(email)=$1 limit 1", [email]))[0];
        const matches = await compare(password, user?.password_hash || dummyHash);
        if (!user?.password_hash || !matches) return null;
        await query("update public.users set last_sign_in_at=now() where id=$1", [user.id]);
        return { id: user.id, email: user.email, name: user.name || user.email.split("@")[0] };
      },
    })],
    callbacks: {
      jwt({ token, user }) { if (user) token.sub = user.id; return token; },
      session({ session, token }) { if (session.user && token.sub) session.user.id = token.sub; return session; },
    },
    logger: { error(error) { console.warn("[auth]", error.name); }, warn(code) { console.warn("[auth]", code); }, debug() {} },
  };
  return config;
}
/** Identity comes only from an encrypted HttpOnly Auth.js session cookie. */
export async function getUser(req: Request): Promise<AuthUser | null> {
  let pending = requestUsers.get(req);
  if (!pending) {
    pending = (async () => {
      const session = await getSession(req, authConfig());
      if (!session?.user?.id) return null;
      return (await query<AuthUser>(`select id,email,name,email_verified_at as "emailVerified" from public.users where id=$1`, [session.user.id]))[0] ?? null;
    })();
    requestUsers.set(req, pending);
  }
  return pending;
}
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await getUser(req);
    if (!user) { res.status(401).json({ error: "Please sign in to continue." }); return; }
    res.locals.user = user;
    res.setHeader("Cache-Control", "private, no-store");
    runWithUser(user.id, next);
  } catch { res.status(503).json({ error: "Sign-in is temporarily unavailable. Please try again." }); }
}
/** CORS does not prevent form POSTs: browser mutations require our exact origin. */
export function requireSameOrigin(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) { next(); return; }
  const configured = process.env.APP_URL || process.env.AUTH_URL;
  const expected = configured ? new URL(configured).origin : `${req.protocol}://${req.get("host")}`;
  if (req.get("origin") !== expected) { res.status(403).json({ error: "This request must come from the application." }); return; }
  next();
}
export function mountAuth(app: Express): void {
  const cfg = authConfig();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 15, standardHeaders: "draft-8", legacyHeaders: false,
    skip: (req) => req.method === "GET", message: { error: "Too many sign-in attempts. Try again in 15 minutes." } });
  app.use("/auth", limiter);
  app.use("/auth/*", ExpressAuth(cfg));
  app.post("/api/auth/signup", limiter, requireSameOrigin, async (req, res) => {
    const email = normalizeEmail(req.body?.email), password = req.body?.password;
    if (!validEmail(email) || !validNewPassword(password)) {
      res.status(400).json({ error: "Use a valid email and a password of at least 12 characters (maximum 72 UTF-8 bytes)." }); return;
    }
    try {
      const rows = await query<{ id: string }>(
        "insert into public.users(id,email,password_hash,name) values($1,$2,$3,$4) on conflict do nothing returning id",
        [randomUUID(), email, await hash(password, 12), email.split("@")[0]],
      );
      if (!rows.length) { res.status(409).json({ error: "This account cannot be created. Try signing in; existing passwordless users need their private setup link." }); return; }
      res.status(201).json({ ok: true });
    } catch { res.status(503).json({ error: "Account creation is temporarily unavailable." }); }
  });
  app.post("/api/auth/claim", limiter, requireSameOrigin, async (req, res) => {
    const token = typeof req.body?.token === "string" ? req.body.token : "";
    if (!/^[a-f0-9]{64}$/.test(token) || !validNewPassword(req.body?.password)) {
      res.status(400).json({ error: "Use your private setup token and a password of at least 12 characters." }); return;
    }
    try {
      const rows = await query<{ id: string }>(`update public.users set password_hash=$2,password_claim_used_at=now(),password_claim_token_hash=null
        where password_claim_token_hash=$1 and password_hash is null and password_claim_used_at is null
        and password_claim_expires_at>now() returning id`, [claimHash(token), await hash(req.body.password, 12)]);
      if (!rows.length) { res.status(400).json({ error: "The setup link is invalid, expired or already used." }); return; }
      res.json({ ok: true });
    } catch { res.status(503).json({ error: "Password setup is temporarily unavailable." }); }
  });
}
