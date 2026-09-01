import type {
  AuditEvent,
  CommercialLine,
  ProposalItem,
  ProposalSnapshot,
  ProposalVersion,
} from './domain';
import { contentFingerprint } from './rules';

const commercialLines: CommercialLine[] = [
  { code: '700007', modality: 'B2C', name: 'Percentual sobre faturamento | Varejo', kind: 'percentage', active: true, amountMinor: 210, billingUnit: 'Percentual/mês', basis: 'Faturamento líquido elegível', periodicity: 'Mensal', note: 'Valor fictício de demonstração', basisValidated: true, minimumWithoutCharge: false, graceDays: null, graceWaived: false },
  { code: '700010', modality: 'B2C', name: 'Valor mínimo | Varejo', kind: 'minimum', active: true, amountMinor: 900000, billingUnit: 'Mês', basis: '', periodicity: 'Mensal', note: 'Valor fictício de demonstração', basisValidated: true, minimumWithoutCharge: false, graceDays: 30, graceWaived: false },
  { code: '700006', modality: 'B2B', name: 'Percentual sobre faturamento | Atacado', kind: 'percentage', active: true, amountMinor: 165, billingUnit: 'Percentual/mês', basis: 'Faturamento líquido de operações faturadas', periodicity: 'Mensal', note: 'Valor fictício de demonstração', basisValidated: true, minimumWithoutCharge: false, graceDays: null, graceWaived: false },
  { code: '700009', modality: 'B2B', name: 'Valor mínimo | Atacado', kind: 'minimum', active: true, amountMinor: 1250000, billingUnit: 'Mês', basis: '', periodicity: 'Mensal', note: 'Valor fictício de demonstração', basisValidated: true, minimumWithoutCharge: false, graceDays: 30, graceWaived: false },
  { code: '700005', modality: 'Crossdocking', name: 'Percentual sobre faturamento | Crossdocking', kind: 'percentage', active: true, amountMinor: 75, billingUnit: 'Percentual/mês', basis: 'Faturamento líquido das operações elegíveis', periodicity: 'Mensal', note: 'Base validada apenas para a demonstração', basisValidated: true, minimumWithoutCharge: false, graceDays: null, graceWaived: false },
  { code: '700008', modality: 'Crossdocking', name: 'Valor mínimo | Crossdocking', kind: 'minimum', active: true, amountMinor: 650000, billingUnit: 'Mês', basis: '', periodicity: 'Mensal', note: 'Valor fictício de demonstração', basisValidated: true, minimumWithoutCharge: false, graceDays: null, graceWaived: true },
  { code: '700003', modality: 'Comum', name: 'Seguro sobre mercadorias em estoque', kind: 'insurance', active: true, amountMinor: 8, billingUnit: 'Percentual/mês', basis: 'Pico mensal de estoque registrado no WMS', periodicity: 'Mensal', note: 'Taxa fictícia de demonstração', basisValidated: true, minimumWithoutCharge: false, graceDays: null, graceWaived: false },
];

const materials: ProposalItem[] = [
  { code: '600001', name: 'Papel A4', unit: 'Unidade', included: true, valueCents: 12, explicitZero: false, defaultCents: 12, overrideCents: null, overrideReason: '', source: 'Homologação fictícia do ambiente de demonstração', provisional: false },
  { code: '400001', name: 'Filme stretch', unit: 'Bobina', included: true, valueCents: 1425, explicitZero: false, defaultCents: 1390, overrideCents: 1425, overrideReason: 'Ajuste fictício para a operação demonstrativa', source: 'Default fictício + override da V02', provisional: false },
  { code: '400008', name: 'Caixa de papelão', unit: 'Unidade', included: false, valueCents: null, explicitZero: false, defaultCents: null, overrideCents: null, overrideReason: '', source: 'Catálogo mestre - requer tamanho/valor', provisional: false },
];

const services: ProposalItem[] = [
  { code: '700101', name: 'Recebimento por caixa master', unit: 'Caixa master', included: true, valueCents: 0, explicitZero: true, defaultCents: null, overrideCents: null, overrideReason: '', source: 'Definido conscientemente na V02', provisional: false },
  { code: '700104', name: 'Atendimento de pedidos', unit: 'Pedido', included: true, valueCents: 245, explicitZero: false, defaultCents: null, overrideCents: null, overrideReason: '', source: 'Valor fictício da proposta', provisional: false },
  { code: '700303', name: 'Mão de obra | Pessoa/hora', unit: 'Pessoa/hora', included: false, valueCents: null, explicitZero: false, defaultCents: null, overrideCents: null, overrideReason: '', source: 'Sugestão provisória disponível ao ativar', provisional: false },
];

export const DEMO_PROPOSAL: ProposalSnapshot = {
  id: 'proposal-demo-00123',
  code: 'MC-PROP-2026-00123',
  version: 2,
  status: 'Em aprovação',
  frozen: true,
  basedOnVersion: 1,
  revisionReason: 'Inclusão do fluxo de Crossdocking e revisão das condições comerciais.',
  client: {
    legalName: 'Aurora Comércio Integrado - DEMONSTRAÇÃO',
    tradeName: 'Aurora Demo',
    cnpj: '00.000.000/0000-00',
    contactName: 'Contato fictício',
    email: 'contato.demo@exemplo.invalid',
    phone: '(00) 00000-0000',
    segment: 'Bens de consumo - demonstração',
    address: 'Unidade fictícia · Campinas/SP',
  },
  responsible: { name: 'Camila Alves - demonstração', email: 'camila.demo@exemplo.invalid', phone: '(00) 00000-0000' },
  title: 'Solução integrada de armazenagem e Crossdocking',
  operationalUnit: 'CD Campinas - ambiente demonstrativo',
  issueDate: '2026-08-24',
  validUntil: '2026-09-03',
  modalities: ['B2B', 'Crossdocking'],
  context: 'Operação fictícia criada para demonstrar o fluxo completo sem reutilizar dados de clientes reais.',
  need: 'Padronizar recebimento, armazenagem B2B e troca de notas com rastreabilidade comercial.',
  successCriteria: 'Proposta consistente, sem campos ambíguos e com tempos operacionais versionados.',
  scopeIncluded: ['Recebimento B2B programado', 'Armazenagem e gestão WMS', 'Separação e expedição', 'Fluxo dedicado de Crossdocking'],
  clientResponsibilities: ['Disponibilizar cadastro fiscal consistente', 'Enviar NF de entrada e pedido de saída', 'Agendar volumes fora do padrão'],
  outOfScope: ['Integração Pipefy nesta fase', 'Contrato automático', 'Definição autônoma de preços'],
  sla: {
    B2C: 'Pedidos até 12h em D0; após 12h até D+1.',
    B2B: 'Pedidos recebidos até 12h com expedição em D+1.',
    Crossdocking: 'Tempo de liberação a confirmar por operação; não foi inventado um SLA.',
  },
  crossdockingFlow: ['Prioridade na portaria', 'Registro no totem em Troca de nota', 'Integração da NF de entrada', 'Integração do pedido de saída', 'Conferência e impressão de documentos', 'Fechamento dos pedidos', 'Entrega dos documentos', 'Liberação do motorista'],
  crossdockingException: 'Divergências cadastrais exigem validação antes da liberação.',
  commercialLines,
  materials,
  services,
  paymentTerms: '30 dias após emissão - condição fictícia, pendente de homologação.',
  adjustmentRule: 'Reajuste anual por índice configurável - pendente de homologação.',
  taxes: 'Regra tributária configurável e pendente de validação Fiscal/Jurídica.',
  assumptions: ['Valores e contatos desta proposta são fictícios.', 'Indicadores institucionais são versionados com vigência.', 'Nenhuma integração externa está ativa.'],
  templateVersion: 'TPL-2026.08-V01',
  institutionalVersion: 'INST-2026.08-V01',
  institutionalFacts: { years: 31, distributionCenters: 5, squareMeters: 'mais de 50 mil m²', clients: '350+ clientes', effectiveDate: '2026-08-24' },
  dischargeResponsibility: 'Não aplicável',
  hasDischargePrice: false,
  acceptedProposalVersionId: null,
  pipefyCardId: null,
  integrationStatus: 'Não configurada',
};

const v1Snapshot: ProposalSnapshot = {
  ...structuredClone(DEMO_PROPOSAL),
  version: 1,
  status: 'Enviada',
  basedOnVersion: null,
  revisionReason: 'Versão inicial.',
  modalities: ['B2B'],
  frozen: true,
};

export const DEMO_VERSIONS: ProposalVersion[] = [
  {
    id: 'proposal-demo-00123-v1',
    proposalId: DEMO_PROPOSAL.id,
    number: 1,
    status: 'Enviada',
    frozen: true,
    basedOn: null,
    revisionReason: 'Versão inicial.',
    createdAt: '2026-08-20T14:10:00-03:00',
    createdBy: 'Camila Alves - demonstração',
    snapshot: v1Snapshot,
    contentHash: contentFingerprint(v1Snapshot),
    artifacts: [{ id: 'artifact-v1', fileName: 'MC-PROP-2026-00123_Aurora-Demo_V01.pdf', createdAt: '2026-08-20T14:16:00-03:00', author: 'Camila Alves - demonstração', contentHash: contentFingerprint(v1Snapshot), fileHash: 'sha256-demo-v1-imutavel', canonical: true }],
  },
  {
    id: 'proposal-demo-00123-v2',
    proposalId: DEMO_PROPOSAL.id,
    number: 2,
    status: 'Em aprovação',
    frozen: true,
    basedOn: 'proposal-demo-00123-v1',
    revisionReason: DEMO_PROPOSAL.revisionReason,
    createdAt: '2026-08-24T10:42:00-03:00',
    createdBy: 'Camila Alves - demonstração',
    snapshot: DEMO_PROPOSAL,
    contentHash: contentFingerprint(DEMO_PROPOSAL),
    artifacts: [],
  },
];

export const DEMO_AUDIT: AuditEvent[] = [
  { id: 'audit-1', actor: 'Camila Alves - demonstração', role: 'Trader', timestamp: '2026-08-20T13:32:00-03:00', action: 'Criou proposta', object: DEMO_PROPOSAL.code, reason: 'Nova oportunidade', before: 'Não existente', after: 'Rascunho V01' },
  { id: 'audit-2', actor: 'Camila Alves - demonstração', role: 'Trader', timestamp: '2026-08-20T14:10:00-03:00', action: 'Finalizou V01', object: DEMO_PROPOSAL.code, reason: 'Envio inicial', before: 'Rascunho', after: 'Enviada · hash preservado' },
  { id: 'audit-3', actor: 'Camila Alves - demonstração', role: 'Trader', timestamp: '2026-08-24T09:28:00-03:00', action: 'Criou V02', object: DEMO_PROPOSAL.code, reason: DEMO_PROPOSAL.revisionReason, before: 'V01 imutável', after: 'V02 baseada em V01' },
  { id: 'audit-4', actor: 'Aprovador Demo', role: 'Aprovador', timestamp: '2026-08-24T10:42:00-03:00', action: 'Recebeu para aprovação', object: DEMO_PROPOSAL.code, reason: 'Revisar base de Crossdocking e condições', before: 'Rascunho V02', after: 'Em aprovação V02' },
];
