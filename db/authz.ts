import type { UserRole } from '../lib/domain';
import { getD1 } from './runtime';

export type RequestIdentity = {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  demo: boolean;
};

const ROLES = new Set<UserRole>(['Trader', 'Aprovador', 'Administrador']);

export async function requestIdentity(request: Request): Promise<RequestIdentity | null> {
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  const encodedName = request.headers.get('oai-authenticated-user-full-name');
  const encoding = request.headers.get('oai-authenticated-user-full-name-encoding');

  if (userId && email) {
    const db = getD1();
    const existing = await db.prepare(
      'SELECT id, email, display_name AS displayName, role FROM users WHERE id = ? AND active = 1',
    ).bind(userId).first<{ id: string; email: string; displayName: string; role: UserRole }>();
    if (existing) return { ...existing, demo: false };

    const displayName = encodedName && encoding === 'percent-encoded-utf-8'
      ? safeDecode(encodedName) || email
      : email;
    const now = new Date().toISOString();
    await db.prepare(
      'INSERT INTO users (id, email, display_name, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
    ).bind(userId, email, displayName, 'Trader', now).run();
    return { id: userId, email, displayName, role: 'Trader', demo: false };
  }

  const hostname = new URL(request.url).hostname;
  const local = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.test');
  if (!local) return null;
  const requestedRole = request.headers.get('x-demo-role') as UserRole | null;
  const role = requestedRole && ROLES.has(requestedRole) ? requestedRole : 'Trader';
  return {
    id: `local-demo-${role.toLowerCase()}`,
    email: 'demo@exemplo.invalid',
    displayName: `${role} Demo`,
    role,
    demo: true,
  };
}

export function requireRole(identity: RequestIdentity | null, allowed: UserRole[]): RequestIdentity {
  if (!identity) throw new Response('Autenticação obrigatória.', { status: 401 });
  if (!allowed.includes(identity.role)) throw new Response('Perfil sem permissão para esta ação.', { status: 403 });
  return identity;
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}
