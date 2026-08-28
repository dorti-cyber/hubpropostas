import { NextResponse } from 'next/server';
import { requestIdentity, requireRole } from '../../../db/authz';
import { ensureDatabase, getD1, getFilesBucket } from '../../../db/runtime';

export const dynamic = 'force-dynamic';

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes)).map((value) => value.toString(16).padStart(2, '0')).join('');
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 140);
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const actor = requireRole(await requestIdentity(request), ['Trader', 'Aprovador', 'Administrador']);
    const data = await request.formData();
    const proposalId = String(data.get('proposalId') || '');
    const versionNumber = Number(data.get('version'));
    const contentHash = String(data.get('contentHash') || '');
    const reportedFileHash = String(data.get('fileHash') || '');
    const file = data.get('file');
    if (!proposalId || !Number.isInteger(versionNumber) || !contentHash || !(file instanceof File) || file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Arquivo PDF e metadados da versão são obrigatórios.' }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'O PDF excede 15 MB.' }, { status: 413 });

    const db = getD1();
    const version = await db.prepare(
      `SELECT id, status, frozen, content_hash AS contentHash
       FROM proposal_versions WHERE proposal_id = ? AND version_number = ?`,
    ).bind(proposalId, versionNumber).first<{ id: string; status: string; frozen: number; contentHash: string }>();
    if (!version || !version.frozen || version.status !== 'Aprovada') {
      return NextResponse.json({ error: 'O PDF final exige uma versão congelada e aprovada.' }, { status: 409 });
    }
    if (version.contentHash !== contentHash) {
      return NextResponse.json({ error: 'O conteúdo mudou após a aprovação. Crie uma nova versão.' }, { status: 409 });
    }

    const bytes = await file.arrayBuffer();
    const fileHash = hex(await crypto.subtle.digest('SHA-256', bytes));
    if (reportedFileHash && reportedFileHash !== fileHash) {
      return NextResponse.json({ error: 'O hash informado não corresponde ao arquivo recebido.' }, { status: 400 });
    }
    const existing = await db.prepare(
      'SELECT id, content_hash AS contentHash FROM artifacts WHERE proposal_version_id = ? AND canonical = 1',
    ).bind(version.id).first<{ id: string; contentHash: string }>();
    if (existing && existing.contentHash !== contentHash) {
      return NextResponse.json({ error: 'Já existe um PDF canônico com conteúdo diferente para esta versão.' }, { status: 409 });
    }
    const attempt = await db.prepare(
      'SELECT COUNT(*) AS count FROM artifacts WHERE proposal_version_id = ?',
    ).bind(version.id).first<{ count: number }>();
    const id = crypto.randomUUID();
    const name = safeFileName(file.name || `${proposalId}_V${String(versionNumber).padStart(2, '0')}.pdf`);
    const storageKey = `proposals/${proposalId}/v${String(versionNumber).padStart(2, '0')}/${id}-${name}`;
    const canonical = existing ? 0 : 1;
    await getFilesBucket().put(storageKey, bytes, {
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { proposalId, version: String(versionNumber), contentHash, fileHash },
    });
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        `INSERT INTO artifacts (
          id, proposal_id, proposal_version_id, file_name, storage_key, content_hash,
          file_hash, canonical, attempt_number, author, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(id, proposalId, version.id, name, storageKey, contentHash, fileHash, canonical, (attempt?.count || 0) + 1, actor.displayName, now),
      db.prepare(
        `INSERT INTO audit_events (
          id, object_type, object_id, action, actor_id, actor_role, reason,
          before_hash, after_hash, created_at
        ) VALUES (?, 'artifact', ?, 'Registrou PDF', ?, ?, ?, ?, ?, ?)`,
      ).bind(crypto.randomUUID(), id, actor.id, actor.role, canonical ? 'Artefato canônico' : 'Tentativa técnica adicional', contentHash, fileHash, now),
    ]);
    return NextResponse.json({ id, fileName: name, contentHash, fileHash, canonical: Boolean(canonical), attemptNumber: (attempt?.count || 0) + 1 });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, { status: error.status, headers: error.headers });
    console.error(error);
    return NextResponse.json({ error: 'Não foi possível registrar o PDF.' }, { status: 500 });
  }
}
