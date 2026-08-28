import { env } from 'cloudflare:workers';
import { CATALOG } from '../lib/catalog';
import { DEMO_AUDIT, DEMO_PROPOSAL, DEMO_VERSIONS } from '../lib/demo';

let initialization: Promise<void> | null = null;

export function getD1(): D1Database {
  if (!env.DB) throw new Error('D1 binding DB não está disponível.');
  return env.DB;
}

export function getFilesBucket(): R2Bucket {
  if (!env.FILES) throw new Error('R2 binding FILES não está disponível.');
  return env.FILES;
}

export function ensureDatabase(): Promise<void> {
  if (initialization) return initialization;
  initialization = initialize();
  return initialization;
}

async function initialize(): Promise<void> {
  const db = getD1();
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS proposals (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, client_name TEXT NOT NULL,
      modalities TEXT NOT NULL, status TEXT NOT NULL, current_version INTEGER NOT NULL,
      responsible TEXT NOT NULL, valid_until TEXT NOT NULL, snapshot_json TEXT NOT NULL,
      accepted_proposal_version_id TEXT, pipefy_card_id TEXT,
      integration_status TEXT NOT NULL DEFAULT 'Não configurada', updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS pricing_versions (
      id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, version_number INTEGER NOT NULL,
      pricing_json TEXT NOT NULL, frozen INTEGER NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id),
      UNIQUE(proposal_id, version_number)
    )`,
    `CREATE TABLE IF NOT EXISTS template_versions (
      id TEXT PRIMARY KEY, version TEXT NOT NULL UNIQUE, content_json TEXT NOT NULL,
      published INTEGER NOT NULL, effective_at TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS proposal_versions (
      id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, version_number INTEGER NOT NULL,
      status TEXT NOT NULL, frozen INTEGER NOT NULL, based_on TEXT, revision_reason TEXT NOT NULL,
      snapshot_json TEXT NOT NULL, content_hash TEXT NOT NULL, template_version_id TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id),
      UNIQUE(proposal_id, version_number)
    )`,
    `CREATE TABLE IF NOT EXISTS catalog_items (
      code TEXT PRIMARY KEY, family TEXT, nature TEXT, name TEXT NOT NULL, billing_unit TEXT,
      source_value TEXT, source_status TEXT NOT NULL, default_cents INTEGER,
      default_status TEXT NOT NULL, source TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      effective_at TEXT, updated_by TEXT, updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY, proposal_id TEXT NOT NULL, proposal_version_id TEXT NOT NULL,
      file_name TEXT NOT NULL, storage_key TEXT NOT NULL UNIQUE, content_hash TEXT NOT NULL,
      file_hash TEXT NOT NULL, canonical INTEGER NOT NULL, attempt_number INTEGER NOT NULL,
      author TEXT NOT NULL, created_at TEXT NOT NULL,
      FOREIGN KEY (proposal_id) REFERENCES proposals(id),
      FOREIGN KEY (proposal_version_id) REFERENCES proposal_versions(id)
    )`,
    `CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
      action TEXT NOT NULL, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL,
      reason TEXT NOT NULL, before_hash TEXT NOT NULL, after_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value_json TEXT NOT NULL, status TEXT NOT NULL,
      updated_by TEXT NOT NULL, updated_at TEXT NOT NULL
    )`,
    'CREATE INDEX IF NOT EXISTS idx_proposals_status_updated ON proposals(status, updated_at)',
    'CREATE INDEX IF NOT EXISTS idx_proposals_client ON proposals(client_name)',
    'CREATE INDEX IF NOT EXISTS idx_proposals_responsible ON proposals(responsible)',
    'CREATE INDEX IF NOT EXISTS idx_proposals_valid_until ON proposals(valid_until)',
    'CREATE INDEX IF NOT EXISTS idx_proposal_versions_status ON proposal_versions(status)',
    'CREATE INDEX IF NOT EXISTS idx_catalog_nature_family ON catalog_items(nature, family)',
    'CREATE INDEX IF NOT EXISTS idx_catalog_status ON catalog_items(default_status)',
    'CREATE INDEX IF NOT EXISTS idx_artifacts_version_canonical ON artifacts(proposal_version_id, canonical)',
    'CREATE INDEX IF NOT EXISTS idx_audit_object_created ON audit_events(object_type, object_id, created_at)',
  ];
  await db.batch(statements.map((statement) => db.prepare(statement)));

  const catalogCount = await db.prepare('SELECT COUNT(*) AS count FROM catalog_items').first<{ count: number }>();
  if (!catalogCount?.count) {
    const inserts = CATALOG.map((item) => db.prepare(
      `INSERT INTO catalog_items (
        code, family, nature, name, billing_unit, source_value, source_status,
        default_cents, default_status, source, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      item.code,
      item.family,
      item.nature,
      item.name,
      item.billingUnit,
      item.sourceValue === null ? null : String(item.sourceValue),
      item.sourceStatus,
      item.defaultCents,
      item.defaultStatus,
      item.source,
      '',
    ));
    await db.batch(inserts);
  }

  const proposalCount = await db.prepare('SELECT COUNT(*) AS count FROM proposals').first<{ count: number }>();
  if (!proposalCount?.count) {
    const now = '2026-08-24T10:42:00-03:00';
    await db.prepare(
      `INSERT INTO proposals (
        id, code, client_name, modalities, status, current_version, responsible,
        valid_until, snapshot_json, accepted_proposal_version_id, pipefy_card_id,
        integration_status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      DEMO_PROPOSAL.id,
      DEMO_PROPOSAL.code,
      DEMO_PROPOSAL.client.legalName,
      DEMO_PROPOSAL.modalities.join(','),
      DEMO_PROPOSAL.status,
      DEMO_PROPOSAL.version,
      DEMO_PROPOSAL.responsible.name,
      DEMO_PROPOSAL.validUntil,
      JSON.stringify(DEMO_PROPOSAL),
      null,
      null,
      DEMO_PROPOSAL.integrationStatus,
      now,
    ).run();

    await db.batch(DEMO_VERSIONS.map((version) => db.prepare(
      `INSERT INTO proposal_versions (
        id, proposal_id, version_number, status, frozen, based_on, revision_reason,
        snapshot_json, content_hash, template_version_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      version.id,
      version.proposalId,
      version.number,
      version.status,
      version.frozen ? 1 : 0,
      version.basedOn,
      version.revisionReason,
      JSON.stringify(version.snapshot),
      version.contentHash,
      version.snapshot.templateVersion,
      version.createdBy,
      version.createdAt,
    )));
    await db.batch(DEMO_AUDIT.map((event) => db.prepare(
      `INSERT INTO audit_events (
        id, object_type, object_id, action, actor_id, actor_role, reason,
        before_hash, after_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(event.id, 'proposal', event.object, event.action, event.actor, event.role, event.reason, event.before, event.after, event.timestamp)));
    await db.prepare(
      `INSERT OR IGNORE INTO settings (key, value_json, status, updated_by, updated_at)
       VALUES ('approval_gate', '{"enabled":true}', 'Pendente de homologação', 'Sistema', ?)`,
    ).bind(now).run();
  }
  await db.prepare('PRAGMA optimize').run();
}
