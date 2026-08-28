import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['Trader', 'Aprovador', 'Administrador'] }).notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_users_email').on(table.email),
]);

export const proposals = sqliteTable('proposals', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  clientName: text('client_name').notNull(),
  modalities: text('modalities').notNull(),
  status: text('status').notNull(),
  currentVersion: integer('current_version').notNull(),
  responsible: text('responsible').notNull(),
  validUntil: text('valid_until').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  acceptedProposalVersionId: text('accepted_proposal_version_id'),
  pipefyCardId: text('pipefy_card_id'),
  integrationStatus: text('integration_status').notNull().default('Não configurada'),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_proposals_code').on(table.code),
  index('idx_proposals_status_updated').on(table.status, table.updatedAt),
  index('idx_proposals_client').on(table.clientName),
  index('idx_proposals_responsible').on(table.responsible),
  index('idx_proposals_valid_until').on(table.validUntil),
]);

export const pricingVersions = sqliteTable('pricing_versions', {
  id: text('id').primaryKey(),
  proposalId: text('proposal_id').notNull().references(() => proposals.id),
  versionNumber: integer('version_number').notNull(),
  pricingJson: text('pricing_json').notNull(),
  frozen: integer('frozen', { mode: 'boolean' }).notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_pricing_versions_proposal_number').on(table.proposalId, table.versionNumber),
]);

export const templateVersions = sqliteTable('template_versions', {
  id: text('id').primaryKey(),
  version: text('version').notNull(),
  contentJson: text('content_json').notNull(),
  published: integer('published', { mode: 'boolean' }).notNull(),
  effectiveAt: text('effective_at').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_template_versions_version').on(table.version),
]);

export const proposalVersions = sqliteTable('proposal_versions', {
  id: text('id').primaryKey(),
  proposalId: text('proposal_id').notNull().references(() => proposals.id),
  versionNumber: integer('version_number').notNull(),
  status: text('status').notNull(),
  frozen: integer('frozen', { mode: 'boolean' }).notNull(),
  basedOn: text('based_on'),
  revisionReason: text('revision_reason').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  contentHash: text('content_hash').notNull(),
  templateVersionId: text('template_version_id').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_proposal_versions_proposal_number').on(table.proposalId, table.versionNumber),
  index('idx_proposal_versions_status').on(table.status),
]);

export const catalogItems = sqliteTable('catalog_items', {
  code: text('code').primaryKey(),
  family: text('family'),
  nature: text('nature'),
  name: text('name').notNull(),
  billingUnit: text('billing_unit'),
  sourceValue: text('source_value'),
  sourceStatus: text('source_status').notNull(),
  defaultCents: integer('default_cents'),
  defaultStatus: text('default_status').notNull(),
  source: text('source').notNull(),
  note: text('note').notNull().default(''),
  effectiveAt: text('effective_at'),
  updatedBy: text('updated_by'),
  updatedAt: text('updated_at'),
}, (table) => [
  index('idx_catalog_nature_family').on(table.nature, table.family),
  index('idx_catalog_status').on(table.defaultStatus),
]);

export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(),
  proposalId: text('proposal_id').notNull().references(() => proposals.id),
  proposalVersionId: text('proposal_version_id').notNull().references(() => proposalVersions.id),
  fileName: text('file_name').notNull(),
  storageKey: text('storage_key').notNull(),
  contentHash: text('content_hash').notNull(),
  fileHash: text('file_hash').notNull(),
  canonical: integer('canonical', { mode: 'boolean' }).notNull(),
  attemptNumber: integer('attempt_number').notNull(),
  author: text('author').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('idx_artifacts_storage_key').on(table.storageKey),
  index('idx_artifacts_version_canonical').on(table.proposalVersionId, table.canonical),
]);

export const auditEvents = sqliteTable('audit_events', {
  id: text('id').primaryKey(),
  objectType: text('object_type').notNull(),
  objectId: text('object_id').notNull(),
  action: text('action').notNull(),
  actorId: text('actor_id').notNull(),
  actorRole: text('actor_role').notNull(),
  reason: text('reason').notNull(),
  beforeHash: text('before_hash').notNull(),
  afterHash: text('after_hash').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('idx_audit_object_created').on(table.objectType, table.objectId, table.createdAt),
]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  status: text('status').notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: text('updated_at').notNull(),
});
