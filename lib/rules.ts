import type {
  AuditEvent,
  CommercialLine,
  Modality,
  ProposalItem,
  ProposalSnapshot,
  ProposalVersion,
  ValidationIssue,
} from './domain';
import { versionLabel } from './domain';

const MODALITY_CODES: Record<Modality, string[]> = {
  B2C: ['700007', '700010'],
  B2B: ['700006', '700009'],
  Crossdocking: ['700005', '700008'],
};

const DISCHARGE_SERVICE_CODES = new Set(['700201', '700202', '700203', '700204', '700205', '700206']);

export function applicableCommercialCodes(modalities: Modality[]): string[] {
  return [...new Set(modalities.flatMap((modality) => MODALITY_CODES[modality]))];
}

export function visibleCommercialLines(snapshot: ProposalSnapshot): CommercialLine[] {
  if (!snapshot.modalities.length) return [];
  const codes = new Set(applicableCommercialCodes(snapshot.modalities));
  return snapshot.commercialLines.filter((line) => line.modality === 'Comum' || codes.has(line.code));
}

export function isCrossdockingOnly(modalities: Modality[]): boolean {
  return modalities.length === 1 && modalities[0] === 'Crossdocking';
}

export function visibleServices(snapshot: ProposalSnapshot): ProposalItem[] {
  return snapshot.services.filter((service) => {
    if (isCrossdockingOnly(snapshot.modalities) && DISCHARGE_SERVICE_CODES.has(service.code)) return false;
    return true;
  });
}

export function pdfServiceRows(snapshot: ProposalSnapshot): ProposalItem[] {
  return visibleServices(snapshot).filter((service) => service.included && service.valueCents !== null);
}

export function applyMaterialOverride(
  material: ProposalItem,
  overrideCents: number,
  reason: string,
): ProposalItem {
  if (!reason.trim()) throw new Error('O motivo do valor personalizado é obrigatório.');
  return {
    ...material,
    valueCents: overrideCents,
    overrideCents,
    overrideReason: reason.trim(),
    source: `${material.source} · override da versão atual`,
  };
}

export function validateProposal(snapshot: ProposalSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const blocking = (id: string, step: number, field: string, message: string) =>
    issues.push({ id, step, field, message, severity: 'blocking' });

  if (!snapshot.client.legalName.trim()) blocking('client-name', 1, 'client.legalName', 'Informe a razão social.');
  if (!snapshot.modalities.length) blocking('modalities', 3, 'modalities', 'Selecione ao menos uma modalidade.');

  const visibleLines = visibleCommercialLines(snapshot).filter((line) => line.active && line.amountMinor !== null);
  if (snapshot.modalities.length && !visibleLines.length) {
    blocking('commercial-lines', 5, 'commercialLines', 'Preencha ao menos uma condição comercial aplicável.');
  }

  for (const line of visibleLines) {
    if ((line.kind === 'percentage' || line.kind === 'insurance') && !line.basis.trim()) {
      blocking(`basis-${line.code}`, 5, line.code, `${line.name}: informe a base de cálculo.`);
    }
    if ((line.kind === 'percentage' || line.kind === 'insurance') && !line.periodicity.trim()) {
      blocking(`period-${line.code}`, 5, line.code, `${line.name}: informe a periodicidade.`);
    }
    if (line.modality === 'Crossdocking' && line.kind === 'percentage' && !line.basisValidated) {
      blocking('crossdock-basis', 5, line.code, 'Valide se a base de Crossdocking é faturamento, vendas ou outra regra homologada.');
    }
    if (line.kind === 'minimum' && line.amountMinor > 0 && line.graceDays === null && !line.graceWaived) {
      blocking(`grace-${line.code}`, 5, line.code, `${line.name}: defina ou dispense a carência.`);
    }
  }

  for (const material of snapshot.materials.filter((item) => item.included)) {
    if (material.valueCents === null) blocking(`material-${material.code}`, 6, material.code, `${material.name}: informe um valor válido.`);
  }

  for (const service of visibleServices(snapshot).filter((item) => item.included)) {
    if (service.valueCents === null) blocking(`service-${service.code}`, 7, service.code, `${service.name}: informe um valor numérico ou remova o item.`);
    if (service.provisional) blocking(`provisional-${service.code}`, 7, service.code, `${service.name}: substitua o valor provisório antes da emissão.`);
  }

  if (!snapshot.issueDate || !snapshot.validUntil || snapshot.validUntil < snapshot.issueDate) {
    blocking('validity', 2, 'validUntil', 'A validade deve ser igual ou posterior à emissão.');
  }
  if (snapshot.hasDischargePrice && snapshot.dischargeResponsibility === 'Cliente/transportadora') {
    blocking('discharge-conflict', 4, 'dischargeResponsibility', 'Resolva a contradição entre preço de descarga e responsabilidade do cliente/transportadora.');
  }
  if (snapshot.frozen && snapshot.status === 'Rascunho') {
    blocking('immutable-draft', 8, 'status', 'Uma versão congelada não pode permanecer como rascunho editável.');
  }

  return issues;
}

export function contentFingerprint(snapshot: ProposalSnapshot): string {
  const input = JSON.stringify(snapshot);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function freezeVersion(
  snapshot: ProposalSnapshot,
  actor: string,
  at: string,
): ProposalVersion {
  const frozenSnapshot = structuredClone({
    ...snapshot,
    frozen: true,
    status: snapshot.status === 'Rascunho' ? 'Em aprovação' : snapshot.status,
  });
  return {
    id: `${snapshot.id}-v${snapshot.version}`,
    proposalId: snapshot.id,
    number: snapshot.version,
    status: frozenSnapshot.status,
    frozen: true,
    basedOn: snapshot.basedOnVersion ? `${snapshot.id}-v${snapshot.basedOnVersion}` : null,
    revisionReason: snapshot.revisionReason,
    createdAt: at,
    createdBy: actor,
    snapshot: frozenSnapshot,
    contentHash: contentFingerprint(frozenSnapshot),
    artifacts: [],
  };
}

export function createNextVersion(previous: ProposalVersion, reason: string): ProposalSnapshot {
  if (!reason.trim()) throw new Error('Informe o motivo da revisão.');
  const next = structuredClone(previous.snapshot);
  next.version = previous.number + 1;
  next.status = 'Rascunho';
  next.frozen = false;
  next.basedOnVersion = previous.number;
  next.revisionReason = reason.trim();
  return next;
}

export type VersionChange = {
  type: 'added' | 'removed' | 'changed';
  field: string;
  before: string;
  after: string;
};

export function compareVersions(before: ProposalSnapshot, after: ProposalSnapshot): VersionChange[] {
  const changes: VersionChange[] = [];
  const compare = (field: string, left: unknown, right: unknown) => {
    const a = JSON.stringify(left);
    const b = JSON.stringify(right);
    if (a === b) return;
    changes.push({
      type: left == null ? 'added' : right == null ? 'removed' : 'changed',
      field,
      before: left == null ? 'Não existente' : String(Array.isArray(left) ? left.join(', ') : left),
      after: right == null ? 'Removido' : String(Array.isArray(right) ? right.join(', ') : right),
    });
  };
  compare('Modalidades', before.modalities, after.modalities);
  compare('Validade', before.validUntil, after.validUntil);
  compare('Escopo', before.scopeIncluded, after.scopeIncluded);
  compare('SLA B2C', before.sla.B2C, after.sla.B2C);
  compare('SLA B2B', before.sla.B2B, after.sla.B2B);
  compare('SLA Crossdocking', before.sla.Crossdocking, after.sla.Crossdocking);

  const lineMap = (rows: CommercialLine[]) => new Map(rows.map((row) => [row.code, row]));
  const leftLines = lineMap(visibleCommercialLines(before));
  const rightLines = lineMap(visibleCommercialLines(after));
  for (const code of new Set([...leftLines.keys(), ...rightLines.keys()])) {
    compare(`Condição ${code}`, leftLines.get(code)?.amountMinor, rightLines.get(code)?.amountMinor);
  }
  const selectedCodes = (items: ProposalItem[]) => items.filter((item) => item.included).map((item) => item.code).sort();
  compare('Materiais', selectedCodes(before.materials), selectedCodes(after.materials));
  compare('Serviços', selectedCodes(before.services), selectedCodes(after.services));
  return changes;
}

export function buildVersionAudit(
  before: ProposalVersion,
  after: ProposalVersion,
  actor: string,
  role: AuditEvent['role'],
  reason: string,
): AuditEvent {
  return {
    id: `audit-${after.id}`,
    actor,
    role,
    timestamp: after.createdAt,
    action: `Criou ${versionLabel(after.number)}`,
    object: after.proposalId,
    reason,
    before: before.contentHash,
    after: after.contentHash,
  };
}
