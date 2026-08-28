import assert from 'node:assert/strict';
import test from 'node:test';

import { DEMO_PROPOSAL, DEMO_VERSIONS } from '../lib/demo';
import {
  addDaysIso,
  buildCommercialLines,
  buildProposalItems,
  buildProposalTitle,
} from '../lib/form-options';
import {
  applicableCommercialCodes,
  applyMaterialOverride,
  compareVersions,
  contentFingerprint,
  createNextVersion,
  freezeVersion,
  isCrossdockingOnly,
  pdfServiceRows,
  validateProposal,
  visibleCommercialLines,
  visibleServices,
} from '../lib/rules';

function proposalCopy() {
  return structuredClone(DEMO_PROPOSAL);
}

test('01 · B2B + Crossdocking seleciona apenas as linhas comerciais aplicáveis', () => {
  assert.deepEqual(applicableCommercialCodes(['B2B', 'Crossdocking']), [
    '700006', '700009', '700005', '700008',
  ]);
  assert.deepEqual(
    visibleCommercialLines(proposalCopy()).map((line) => line.code),
    ['700006', '700009', '700005', '700008', '700003'],
  );
});

test('02 · B2C não herda condições de B2B ou Crossdocking', () => {
  const proposal = proposalCopy();
  proposal.modalities = ['B2C'];
  assert.deepEqual(
    visibleCommercialLines(proposal).map((line) => line.code),
    ['700007', '700010', '700003'],
  );
});

test('03 · operação somente Crossdocking é detectada sem ambiguidade', () => {
  assert.equal(isCrossdockingOnly(['Crossdocking']), true);
  assert.equal(isCrossdockingOnly(['B2B', 'Crossdocking']), false);
});

test('04 · serviços de descarga somem quando Crossdocking é a única modalidade', () => {
  const proposal = proposalCopy();
  proposal.modalities = ['Crossdocking'];
  proposal.services.push({
    code: '700201', name: 'Descarga', unit: 'Veículo', included: true, valueCents: 10000,
    explicitZero: false, defaultCents: null, overrideCents: null, overrideReason: '',
    source: 'Teste', provisional: false,
  });
  assert.equal(visibleServices(proposal).some((service) => service.code === '700201'), false);
});

test('05 · serviço desmarcado não aparece no PDF', () => {
  const rows = pdfServiceRows(proposalCopy());
  assert.equal(rows.some((service) => service.code === '700303'), false);
});

test('06 · zero explícito permanece como serviço incluído no PDF', () => {
  const row = pdfServiceRows(proposalCopy()).find((service) => service.code === '700101');
  assert.equal(row?.included, true);
  assert.equal(row?.valueCents, 0);
  assert.equal(row?.explicitZero, true);
});

test('07 · override de material exige justificativa', () => {
  const material = proposalCopy().materials[0];
  assert.throws(() => applyMaterialOverride(material, 2500, '   '), /motivo/i);
});

test('08 · override de material fica registrado apenas na versão', () => {
  const material = proposalCopy().materials[0];
  const overridden = applyMaterialOverride(material, 2500, 'Ajuste negociado');
  assert.equal(overridden.defaultCents, material.defaultCents);
  assert.equal(overridden.overrideCents, 2500);
  assert.equal(overridden.overrideReason, 'Ajuste negociado');
});

test('09 · base de Crossdocking não homologada bloqueia emissão', () => {
  const proposal = proposalCopy();
  const line = proposal.commercialLines.find((item) => item.code === '700005');
  assert.ok(line);
  line.basisValidated = false;
  assert.equal(validateProposal(proposal).some((issue) => issue.id === 'crossdock-basis'), true);
});

test('10 · conflito entre preço e responsabilidade de descarga bloqueia emissão', () => {
  const proposal = proposalCopy();
  proposal.hasDischargePrice = true;
  proposal.dischargeResponsibility = 'Cliente/transportadora';
  assert.equal(validateProposal(proposal).some((issue) => issue.id === 'discharge-conflict'), true);
});

test('11 · congelar transforma rascunho em versão imutável para aprovação', () => {
  const proposal = proposalCopy();
  proposal.status = 'Rascunho';
  proposal.frozen = false;
  const version = freezeVersion(proposal, 'Trader Demo', '2026-08-24T12:00:00-03:00');
  assert.equal(version.frozen, true);
  assert.equal(version.status, 'Em aprovação');
  assert.equal(version.contentHash, contentFingerprint(version.snapshot));
});

test('12 · nova versão preserva a anterior e exige motivo de revisão', () => {
  assert.throws(() => createNextVersion(DEMO_VERSIONS[1], ''), /motivo/i);
  const next = createNextVersion(DEMO_VERSIONS[1], 'Ajuste solicitado pelo cliente');
  assert.equal(next.version, 3);
  assert.equal(next.basedOnVersion, 2);
  assert.equal(next.status, 'Rascunho');
  assert.equal(DEMO_VERSIONS[1].number, 2);
});

test('13 · comparação de versões evidencia a inclusão de Crossdocking', () => {
  const changes = compareVersions(DEMO_VERSIONS[0].snapshot, DEMO_VERSIONS[1].snapshot);
  const modalityChange = changes.find((change) => change.field === 'Modalidades');
  assert.match(modalityChange?.after ?? '', /Crossdocking/);
});

test('14 · hash do conteúdo muda quando um valor comercial muda', () => {
  const original = proposalCopy();
  const changed = proposalCopy();
  changed.commercialLines.find((line) => line.code === '700006')!.amountMinor = 170;
  assert.notEqual(contentFingerprint(original), contentFingerprint(changed));
});

test('15 · catálogo completo contém 14 condições e mantém aluguéis como comuns', () => {
  const lines = buildCommercialLines();
  assert.equal(lines.length, 14);
  assert.equal(lines.find((line) => line.code === '700013')?.modality, 'Comum');
  assert.equal(lines.find((line) => line.code === '700017')?.modality, 'Comum');
});

test('16 · B2B mostra condições comuns e apenas suas exclusivas', () => {
  const proposal = proposalCopy();
  proposal.modalities = ['B2B'];
  proposal.commercialLines = buildCommercialLines();
  const codes = visibleCommercialLines(proposal).map((line) => line.code);
  assert.equal(codes.length, 10);
  assert.equal(codes.includes('700006'), true);
  assert.equal(codes.includes('700009'), true);
  assert.equal(codes.includes('700007'), false);
  assert.equal(codes.includes('700005'), false);
});

test('17 · materiais e serviços completos começam selecionados', () => {
  const materials = buildProposalItems('Material');
  const services = buildProposalItems('Serviço');
  assert.equal(materials.length, 27);
  assert.equal(services.length, 23);
  assert.equal(materials.every((item) => item.included), true);
  assert.equal(services.every((item) => item.included), true);
});

test('18 · título automático respeita ordem canônica e cliente', () => {
  assert.equal(
    buildProposalTitle('Cliente Exemplo', ['Crossdocking', 'B2B']),
    'Proposta Comercial > B2B + Crossdocking > Cliente Exemplo',
  );
});

test('19 · validade padrão soma 30 dias sem depender do fuso local', () => {
  assert.equal(addDaysIso('2026-08-24', 30), '2026-09-23');
});

test('20 · default homologado é aplicado a uma nova proposta', () => {
  const services = buildProposalItems('Serviço', [], {
    '700101': { cents: 1250, source: 'Tabela homologada', note: 'Teste' },
  });
  const service = services.find((item) => item.code === '700101');
  assert.equal(service?.valueCents, 1250);
  assert.equal(service?.source, 'Tabela homologada');
});
