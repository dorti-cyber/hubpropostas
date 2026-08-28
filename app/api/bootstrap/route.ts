import { NextResponse } from 'next/server';
import { requestIdentity, requireRole } from '../../../db/authz';
import { ensureDatabase, getD1 } from '../../../db/runtime';
import type { ProposalSnapshot } from '../../../lib/domain';
import { contentFingerprint } from '../../../lib/rules';

export const dynamic = 'force-dynamic';

function responseFromThrown(error: unknown): NextResponse {
  if (error instanceof Response) return new NextResponse(error.body, { status: error.status, headers: error.headers });
  console.error(error);
  return NextResponse.json({ error: 'Não foi possível concluir a operação.' }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const identity = await requestIdentity(request);
    requireRole(identity, ['Trader', 'Aprovador', 'Administrador']);
    const db = getD1();
    const proposals = await db.prepare(
      `SELECT id, code, client_name AS clientName, modalities, status,
        current_version AS currentVersion, responsible, valid_until AS validUntil,
        updated_at AS updatedAt FROM proposals ORDER BY updated_at DESC LIMIT 100`,
    ).all();
    const catalog = await db.prepare(
      'SELECT nature, default_status AS status, COUNT(*) AS count FROM catalog_items GROUP BY nature, default_status',
    ).all();
    const catalogDefaults = await db.prepare(
      `SELECT code, default_cents AS defaultCents, source, note
        FROM catalog_items WHERE default_cents IS NOT NULL ORDER BY code`,
    ).all();
    return NextResponse.json({
      proposals: proposals.results,
      catalog: catalog.results,
      catalogDefaults: catalogDefaults.results,
      identity,
    });
  } catch (error) {
    return responseFromThrown(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDatabase();
    const identity = await requestIdentity(request);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || '');
    const db = getD1();

    if (action === 'autosave') {
      const actor = requireRole(identity, ['Trader', 'Administrador']);
      const snapshot = body.snapshot as ProposalSnapshot;
      if (!snapshot?.id || !snapshot.code || snapshot.frozen) {
        return NextResponse.json({ error: 'Versões congeladas não aceitam autosave.' }, { status: 409 });
      }
      const existingVersion = await db.prepare(
        'SELECT frozen, content_hash AS contentHash FROM proposal_versions WHERE proposal_id = ? AND version_number = ?',
      ).bind(snapshot.id, snapshot.version).first<{ frozen: number; contentHash: string }>();
      if (existingVersion?.frozen) {
        return NextResponse.json({ error: 'A versão é imutável. Crie uma nova versão.' }, { status: 409 });
      }
      const now = new Date().toISOString();
      const afterHash = contentFingerprint(snapshot);
      const beforeHash = existingVersion?.contentHash || 'Não existente';
      await db.batch([
        db.prepare(
          `INSERT INTO proposals (
            id, code, client_name, modalities, status, current_version, responsible,
            valid_until, snapshot_json, accepted_proposal_version_id, pipefy_card_id,
            integration_status, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            code=excluded.code, client_name=excluded.client_name, modalities=excluded.modalities,
            status=excluded.status, current_version=excluded.current_version,
            responsible=excluded.responsible, valid_until=excluded.valid_until,
            snapshot_json=excluded.snapshot_json, integration_status=excluded.integration_status,
            updated_at=excluded.updated_at`,
        ).bind(
          snapshot.id, snapshot.code, snapshot.client.legalName || 'Novo cliente',
          snapshot.modalities.join(','), snapshot.status, snapshot.version,
          snapshot.responsible.name, snapshot.validUntil, JSON.stringify(snapshot),
          snapshot.acceptedProposalVersionId, snapshot.pipefyCardId,
          snapshot.integrationStatus, now,
        ),
        db.prepare(
          `INSERT INTO proposal_versions (
            id, proposal_id, version_number, status, frozen, based_on, revision_reason,
            snapshot_json, content_hash, template_version_id, created_by, created_at
          ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(proposal_id, version_number) DO UPDATE SET
            status=excluded.status, revision_reason=excluded.revision_reason,
            snapshot_json=excluded.snapshot_json, content_hash=excluded.content_hash,
            template_version_id=excluded.template_version_id, created_by=excluded.created_by
          WHERE proposal_versions.frozen = 0`,
        ).bind(
          `${snapshot.id}-v${snapshot.version}`, snapshot.id, snapshot.version,
          snapshot.status, snapshot.basedOnVersion ? `${snapshot.id}-v${snapshot.basedOnVersion}` : null,
          snapshot.revisionReason, JSON.stringify(snapshot), afterHash,
          snapshot.templateVersion, actor.displayName, now,
        ),
        db.prepare(
          `INSERT INTO audit_events (
            id, object_type, object_id, action, actor_id, actor_role, reason,
            before_hash, after_hash, created_at
          ) VALUES (?, 'proposal', ?, 'Autosave de rascunho', ?, ?, 'Edição da versão atual', ?, ?, ?)`,
        ).bind(crypto.randomUUID(), snapshot.id, actor.id, actor.role, beforeHash, afterHash, now),
      ]);
      return NextResponse.json({ savedAt: now, contentHash: afterHash });
    }

    if (action === 'catalog-default') {
      const actor = requireRole(identity, ['Administrador']);
      const code = String(body.code || '');
      const cents = Number(body.cents);
      const source = String(body.source || '').trim();
      const note = String(body.note || '').trim();
      if (!code || !Number.isInteger(cents) || cents < 0 || !source || !note) {
        return NextResponse.json({ error: 'Código, valor em centavos, fonte e motivo são obrigatórios.' }, { status: 400 });
      }
      const before = await db.prepare(
        'SELECT default_cents AS defaultCents, default_status AS defaultStatus FROM catalog_items WHERE code = ?',
      ).bind(code).first<{ defaultCents: number | null; defaultStatus: string }>();
      if (!before) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404 });
      const now = new Date().toISOString();
      await db.batch([
        db.prepare(
          `UPDATE catalog_items SET default_cents = ?, default_status = 'Confirmado',
            source = ?, note = ?, effective_at = ?, updated_by = ?, updated_at = ? WHERE code = ?`,
        ).bind(cents, source, note, now.slice(0, 10), actor.displayName, now, code),
        db.prepare(
          `INSERT INTO audit_events (
            id, object_type, object_id, action, actor_id, actor_role, reason,
            before_hash, after_hash, created_at
          ) VALUES (?, 'catalog_item', ?, 'Homologou default', ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(), code, actor.id, actor.role, note,
          JSON.stringify(before), JSON.stringify({ defaultCents: cents, defaultStatus: 'Confirmado', source }), now,
        ),
      ]);
      return NextResponse.json({ code, defaultCents: cents, status: 'Confirmado', updatedAt: now });
    }

    if (action === 'approve') {
      const actor = requireRole(identity, ['Aprovador']);
      const proposalId = String(body.proposalId || '');
      const version = Number(body.version);
      const row = await db.prepare(
        'SELECT id, snapshot_json AS snapshotJson, status, frozen FROM proposal_versions WHERE proposal_id = ? AND version_number = ?',
      ).bind(proposalId, version).first<{ id: string; snapshotJson: string; status: string; frozen: number }>();
      if (!row || !row.frozen || row.status !== 'Em aprovação') {
        return NextResponse.json({ error: 'Somente uma versão congelada em aprovação pode ser aprovada.' }, { status: 409 });
      }
      const snapshot = JSON.parse(row.snapshotJson) as ProposalSnapshot;
      snapshot.status = 'Aprovada';
      snapshot.frozen = true;
      const afterHash = contentFingerprint(snapshot);
      const now = new Date().toISOString();
      await db.batch([
        db.prepare('UPDATE proposal_versions SET status = ?, snapshot_json = ?, content_hash = ? WHERE id = ?').bind('Aprovada', JSON.stringify(snapshot), afterHash, row.id),
        db.prepare('UPDATE proposals SET status = ?, snapshot_json = ?, updated_at = ? WHERE id = ?').bind('Aprovada', JSON.stringify(snapshot), now, proposalId),
        db.prepare(
          `INSERT INTO audit_events (
            id, object_type, object_id, action, actor_id, actor_role, reason,
            before_hash, after_hash, created_at
          ) VALUES (?, 'proposal_version', ?, 'Aprovou versão', ?, ?, ?, ?, ?, ?)`,
        ).bind(crypto.randomUUID(), row.id, actor.id, actor.role, String(body.reason || 'Aprovação comercial'), row.status, afterHash, now),
      ]);
      return NextResponse.json({ snapshot, approvedAt: now, contentHash: afterHash });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (error) {
    return responseFromThrown(error);
  }
}
