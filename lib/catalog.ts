import sourceRows from './catalog-data.json';
import type { CatalogItem, CatalogSourceStatus } from './domain';

type SourceRow = {
  code: string;
  family: string | null;
  nature: string | null;
  name: string;
  billingUnit: string | null;
  sourceValue: string | number | null;
};

function deriveSourceStatus(value: string | number | null): CatalogSourceStatus {
  if (value === null || value === '') return 'Pendente';
  if (typeof value === 'string' && /consultar/i.test(value)) return 'Requer consulta';
  if (typeof value === 'number') return 'Candidato a default';
  return 'Pendente';
}

export const CATALOG_SOURCE = 'Catálogo Mestre - Nomenclaturas (1).xlsx · Padrão Comercial!A4:F69';

export const CATALOG: CatalogItem[] = (sourceRows as SourceRow[]).map((row) => ({
  ...row,
  nature: row.nature as CatalogItem['nature'],
  sourceStatus: deriveSourceStatus(row.sourceValue),
  defaultCents: null,
  defaultStatus: deriveSourceStatus(row.sourceValue),
  source: CATALOG_SOURCE,
}));

export const CATALOG_BY_CODE = new Map(CATALOG.map((item) => [item.code, item]));

export function catalogItem(code: string): CatalogItem {
  const item = CATALOG_BY_CODE.get(code);
  if (!item) throw new Error(`Item de catálogo não encontrado: ${code}`);
  return item;
}
