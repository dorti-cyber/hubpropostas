export const MODALITIES = ['B2C', 'B2B', 'Crossdocking'] as const;
export type Modality = (typeof MODALITIES)[number];

export const PROPOSAL_STATUSES = [
  'Rascunho',
  'Em aprovação',
  'Aprovada',
  'Enviada',
  'Aceita',
  'Recusada',
  'Expirada',
  'Substituída',
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type UserRole = 'Trader' | 'Aprovador' | 'Administrador';

export type CatalogSourceStatus =
  | 'Pendente'
  | 'Requer consulta'
  | 'Candidato a default'
  | 'Confirmado';

export type CatalogItem = {
  code: string;
  family: string | null;
  nature: 'Material' | 'Serviço' | 'Condição comercial' | null;
  name: string;
  billingUnit: string | null;
  sourceValue: string | number | null;
  sourceStatus: CatalogSourceStatus;
  defaultCents: number | null;
  defaultStatus: CatalogSourceStatus;
  source: string;
};

export type CommercialLineKind = 'percentage' | 'minimum' | 'fixed' | 'insurance';

export type CommercialLine = {
  code: string;
  modality: Modality | 'Comum';
  name: string;
  kind: CommercialLineKind;
  active: boolean;
  amountMinor: number | null;
  billingUnit: string;
  basis: string;
  periodicity: string;
  note: string;
  basisValidated: boolean;
  minimumWithoutCharge: boolean;
  graceDays: number | null;
  graceWaived: boolean;
};

export type ProposalItem = {
  code: string;
  name: string;
  unit: string;
  included: boolean;
  valueCents: number | null;
  explicitZero: boolean;
  defaultCents: number | null;
  overrideCents: number | null;
  overrideReason: string;
  source: string;
  provisional: boolean;
};

export type ProposalClient = {
  legalName: string;
  tradeName: string;
  cnpj: string;
  contactName: string;
  email: string;
  phone: string;
  segment: string;
  address: string;
};

export type ProposalSnapshot = {
  id: string;
  code: string;
  version: number;
  status: ProposalStatus;
  frozen: boolean;
  basedOnVersion: number | null;
  revisionReason: string;
  client: ProposalClient;
  responsible: {
    name: string;
    email: string;
    phone: string;
  };
  title: string;
  operationalUnit: string;
  issueDate: string;
  validUntil: string;
  modalities: Modality[];
  context: string;
  need: string;
  successCriteria: string;
  scopeIncluded: string[];
  clientResponsibilities: string[];
  outOfScope: string[];
  sla: Record<Modality, string>;
  crossdockingFlow: string[];
  crossdockingException: string;
  commercialLines: CommercialLine[];
  materials: ProposalItem[];
  services: ProposalItem[];
  paymentTerms: string;
  adjustmentRule: string;
  taxes: string;
  assumptions: string[];
  templateVersion: string;
  institutionalVersion: string;
  institutionalFacts: {
    years: number;
    distributionCenters: number;
    squareMeters: string;
    clients: string;
    effectiveDate: string;
  };
  dischargeResponsibility: 'Mercocamp' | 'Cliente/transportadora' | 'Não aplicável';
  hasDischargePrice: boolean;
  acceptedProposalVersionId: string | null;
  pipefyCardId: string | null;
  integrationStatus: 'Não configurada' | 'Pendente' | 'Sincronizada' | 'Erro';
};

export type ArtifactRecord = {
  id: string;
  fileName: string;
  createdAt: string;
  author: string;
  contentHash: string;
  fileHash: string;
  canonical: boolean;
};

export type ProposalVersion = {
  id: string;
  proposalId: string;
  number: number;
  status: ProposalStatus;
  frozen: boolean;
  basedOn: string | null;
  revisionReason: string;
  createdAt: string;
  createdBy: string;
  snapshot: ProposalSnapshot;
  contentHash: string;
  artifacts: ArtifactRecord[];
};

export type AuditEvent = {
  id: string;
  actor: string;
  role: UserRole;
  timestamp: string;
  action: string;
  object: string;
  reason: string;
  before: string;
  after: string;
};

export type ValidationIssue = {
  id: string;
  step: number;
  field: string;
  message: string;
  severity: 'blocking' | 'warning';
};

export function formatBRL(cents: number | null): string {
  if (cents === null) return 'A definir';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}

export function formatPercent(basisPoints: number | null): string {
  if (basisPoints === null) return 'A definir';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(basisPoints / 100) + '%';
}

export function formatDateBR(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
}

export function versionLabel(version: number): string {
  return `V${String(version).padStart(2, '0')}`;
}
