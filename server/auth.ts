import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db';
import type { UserRole } from '../src/lib/domain';

export interface AuthSession {
  token: string;
  userId: number;
  username: string;
  role: UserRole;
  fullName: string;
  mustChangePassword: boolean;
  csrfToken: string;
  createdAt: number;
}

export interface AuthedRequest extends Request {
  session?: AuthSession;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function createSession(user: {
  id: number;
  username: string;
  role: UserRole;
  full_name: string;
  must_change_password: number;
}): AuthSession {
  const token = crypto.randomBytes(32).toString('hex');
  const csrfToken = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

  db.prepare(`
    INSERT INTO user_sessions (token, user_id, username, role, full_name, must_change_password, csrf_token, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(token, user.id, user.username, user.role, user.full_name, user.must_change_password ? 1 : 0, csrfToken, expiresAt);

  return {
    token,
    userId: user.id,
    username: user.username,
    role: user.role,
    fullName: user.full_name,
    mustChangePassword: Boolean(user.must_change_password),
    csrfToken,
    createdAt: Date.now(),
  };
}

export function getSession(token?: string): AuthSession | undefined {
  if (!token) return undefined;
  const row = db.prepare(`SELECT * FROM user_sessions WHERE token = ?`).get(token) as any;
  if (!row) return undefined;
  if (Date.now() > Number(row.expires_at)) {
    db.prepare(`DELETE FROM user_sessions WHERE token = ?`).run(token);
    return undefined;
  }
  return {
    token: row.token,
    userId: row.user_id,
    username: row.username,
    role: row.role as UserRole,
    fullName: row.full_name,
    mustChangePassword: Boolean(row.must_change_password),
    csrfToken: row.csrf_token,
    createdAt: Date.now(),
  };
}

export function extractAuthToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }
  if (req.cookies?.sti_session) {
    return String(req.cookies.sti_session);
  }
  return undefined;
}

export function updateSessionPasswordChanged(token: string) {
  db.prepare(`UPDATE user_sessions SET must_change_password = 0 WHERE token = ?`).run(token);
}

export function destroySession(token?: string) {
  if (token) {
    db.prepare(`DELETE FROM user_sessions WHERE token = ?`).run(token);
  }
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractAuthToken(req);
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  req.session = session;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.session) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.session.mustChangePassword && !req.path.includes('change-password') && !req.path.includes('/auth/me')) {
      return res.status(403).json({
        error: 'Mandatory first-login password change required before accessing this module.',
        mustChangePassword: true,
      });
    }
    if (!roles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Access denied for your account role.' });
    }
    next();
  };
}

export function verifyCsrf(req: AuthedRequest, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (!req.session) return next();
  const headerToken = req.headers['x-csrf-token'];
  if (!headerToken || headerToken !== req.session.csrfToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
  }
  next();
}

// Ephemeral one-time credential store (never stored in MySQL/SQLite; cleared immediately after download or 15 mins)
export interface EphemeralCredential {
  token: string;
  name: string;
  code: string;
  role: 'Student' | 'Teacher';
  username: string;
  tempPassword: string;
  assignedTarget: string;
  createdAt: string;
  expiresAt: number;
}

const credentialTokens = new Map<string, EphemeralCredential>();

export function storeOneTimeCredential(cred: Omit<EphemeralCredential, 'token' | 'expiresAt'>): string {
  const token = crypto.randomBytes(24).toString('hex');
  credentialTokens.set(token, {
    ...cred,
    token,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
  return token;
}

export function getOneTimeCredential(token: string): EphemeralCredential | undefined {
  const entry = credentialTokens.get(token);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    credentialTokens.delete(token);
    return undefined;
  }
  return entry;
}

export function consumeOneTimeCredential(token: string): EphemeralCredential | undefined {
  const entry = getOneTimeCredential(token);
  if (entry) {
    credentialTokens.delete(token);
  }
  return entry;
}
