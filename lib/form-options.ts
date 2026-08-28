import { CATALOG } from './catalog';
import type {
  CatalogItem,
  CommercialLine,
  Modality,
  ProposalItem,
} from './domain';
import { MODALITIES } from './domain';

export type CatalogDefault = {
  cents: number;
  source: string;
  note: string;
};

export type CatalogDefaultMap = Record<string, CatalogDefault>;

const COMMERCIAL_CATALOG = CATALOG.filter((item) => item.nature === 'Condição comercial');

export const COMMERCIAL_BILLING_UNITS = [...new Set(
  COMMERCIAL_CATALOG.map((item) => item.billingUnit).filter((unit): unit is string => Boolean(unit)),
)];

export const COMMERCIAL_PERIODICITIES = ['Mensal', 'Diária', 'Por hora', 'Por ocorrência'];

export const CALCULATION_BASES = [
  'Requer validação',
  'Faturamento',
  'Faturamento líquido elegível',
  'Valor das mercadorias em estoque',
  'CNPJ',
  'Palete / posição de palete',
  'Unidade',
  'Dias de carência',
  'Não se aplica',
];

export function conditionModality(item: Pick<CatalogItem, 'name'>): Modality | 'Comum' {
  const suffix = item.name.split('|').at(-1)?.trim();
  if (suffix === 'Varejo') return 'B2C';
  if (suffix === 'Atacado') return 'B2B';
  if (suffix === 'Crossdocking') return 'Crossdocking';
  return 'Comum';
}

function conditionKind(item: CatalogItem): CommercialLine['kind'] {
  if (item.code === '700003') return 'insurance';
  if (item.name.startsWith('Valor mínimo')) return 'minimum';
  if (item.billingUnit === 'Percentual/mês' || item.name.startsWith('Percentual')) return 'percentage';
  return 'fixed';
}

function defaultBasis(item: CatalogItem): string {
  if (item.code === '700005') return 'Requer validação';
  if (item.code === '700003') return 'Valor das mercadorias em estoque';
  if (item.billingUnit === 'Percentual/mês') return 'Faturamento';
  return 'Não se aplica';
}

function defaultPeriodicity(item: CatalogItem): string {
  if (item.billingUnit === 'Mês' || item.billingUnit === 'Percentual/mês') return 'Mensal';
  if (item.billingUnit === 'Dia') return 'Diária';
  return 'Por ocorrência';
}

export function buildCommercialLines(existing: CommercialLine[] = []): CommercialLine[] {
  const previous = new Map(existing.map((line) => [line.code, line]));
  return COMMERCIAL_CATALOG.map((item) => {
    const saved = previous.get(item.code);
    if (saved) {
      return {
        ...saved,
        name: item.name,
        modality: conditionModality(item),
        billingUnit: saved.billingUnit || item.billingUnit || 'Unidade',
        active: saved.amountMinor !== null && saved.active !== false,
      };
    }
    const basis = defaultBasis(item);
    return {
      code: item.code,
      modality: conditionModality(item),
      name: item.name,
      kind: conditionKind(item),
      active: false,
      amountMinor: null,
      billingUnit: item.billingUnit || 'Unidade',
      basis,
      periodicity: defaultPeriodicity(item),
      note: '',
      basisValidated: item.code !== '700005',
      minimumWithoutCharge: false,
      graceDays: null,
      graceWaived: false,
    };
  });
}

export function buildProposalItems(
  nature: 'Material' | 'Serviço',
  existing: ProposalItem[] = [],
  defaults: CatalogDefaultMap = {},
): ProposalItem[] {
  const previous = new Map(existing.map((item) => [item.code, item]));
  return CATALOG.filter((item) => item.nature === nature).map((item) => {
    const saved = previous.get(item.code);
    const catalogDefault = defaults[item.code];
    if (saved) {
      const inheritedDefault = catalogDefault?.cents ?? saved.defaultCents;
      const shouldRefreshValue = saved.provisional
        || (saved.overrideCents === null && saved.valueCents === saved.defaultCents);
      return {
        ...saved,
        name: item.name,
        unit: item.billingUnit || saved.unit || 'Unidade',
        defaultCents: inheritedDefault,
        valueCents: shouldRefreshValue ? inheritedDefault : saved.valueCents,
        source: catalogDefault?.source || saved.source,
        provisional: catalogDefault ? false : saved.provisional,
      };
    }

    const isProvisionalLabor = nature === 'Serviço' && item.code === '700303' && !catalogDefault;
    const valueCents = catalogDefault?.cents ?? (isProvisionalLabor ? 3500 : item.defaultCents);
    return {
      code: item.code,
      name: item.name,
      unit: item.billingUnit || 'Unidade',
      included: true,
      valueCents,
      explicitZero: valueCents === 0,
      defaultCents: catalogDefault?.cents ?? item.defaultCents,
      overrideCents: null,
      overrideReason: '',
      source: catalogDefault?.source || (isProvisionalLabor
        ? 'Sugestão fictícia provisória de R$ 35,00'
        : item.source),
      provisional: isProvisionalLabor,
    };
  });
}

export function buildProposalTitle(clientName: string, modalities: Modality[]): string {
  const orderedModalities = MODALITIES.filter((modality) => modalities.includes(modality));
  const service = orderedModalities.length ? orderedModalities.join(' + ') : 'Serviço contratado';
  return `Proposta Comercial > ${service} > ${clientName.trim() || 'Cliente'}`;
}

export function addDaysIso(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
