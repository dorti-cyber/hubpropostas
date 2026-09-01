'use client';

import { useEffect, useMemo, useState } from 'react';
import { CATALOG } from '../../lib/catalog';
import { DEMO_AUDIT, DEMO_PROPOSAL, DEMO_VERSIONS } from '../../lib/demo';
import type {
  AuditEvent,
  CatalogItem,
  CommercialLine,
  Modality,
  ProposalItem,
  ProposalSnapshot,
  UserRole,
} from '../../lib/domain';
import {
  formatBRL,
  formatDateBR,
  formatPercent,
  MODALITIES,
  versionLabel,
} from '../../lib/domain';
import {
  applyMaterialOverride,
  compareVersions,
  createNextVersion,
  pdfServiceRows,
  validateProposal,
  visibleCommercialLines,
  visibleServices,
} from '../../lib/rules';
import {
  addDaysIso,
  buildCommercialLines,
  buildProposalItems,
  buildProposalTitle,
  CALCULATION_BASES,
  COMMERCIAL_BILLING_UNITS,
  COMMERCIAL_PERIODICITIES,
  todayIso,
  type CatalogDefaultMap,
} from '../../lib/form-options';
import { PdfPanel } from './pdf-panel';

type View = 'dashboard' | 'wizard' | 'detail' | 'catalog' | 'settings';
type DetailTab = 'Resumo' | 'Precificação' | 'Prévia' | 'Versões' | 'Auditoria';

type Props = {
  authenticatedUser: { displayName: string; email: string } | null;
};

const WIZARD_STEPS = [
  'Cliente',
  'Dados da proposta',
  'Modalidades e escopo',
  'Operação e SLAs',
  'Condições comerciais',
  'Materiais e insumos',
  'Serviços',
  'Revisão e PDF',
];

const proposalRows = [
  { code: 'MC-PROP-2026-00123', client: 'Aurora Comércio Integrado - DEMONSTRAÇÃO', modes: ['B2B', 'Crossdocking'], version: 'V02', status: 'Em aprovação', owner: 'Camila Alves', validity: '03/09/2026', updated: 'Hoje, 10:42' },
  { code: 'MC-PROP-2026-00122', client: 'Norte Sul Cosméticos - DEMONSTRAÇÃO', modes: ['B2C'], version: 'V01', status: 'Rascunho', owner: 'Rafael Demo', validity: '08/09/2026', updated: 'Hoje, 09:18' },
  { code: 'MC-PROP-2026-00121', client: 'Verde Campo Distribuição - DEMONSTRAÇÃO', modes: ['B2B'], version: 'V03', status: 'Aprovada', owner: 'Camila Alves', validity: '29/08/2026', updated: 'Ontem, 17:05' },
  { code: 'MC-PROP-2026-00120', client: 'Horizonte Saúde - DEMONSTRAÇÃO', modes: ['B2C', 'B2B'], version: 'V01', status: 'Enviada', owner: 'Rafael Demo', validity: '27/08/2026', updated: '22/08, 15:31' },
];

function normalizeEditableDraft(
  snapshot: ProposalSnapshot,
  catalogDefaults: CatalogDefaultMap,
): ProposalSnapshot {
  const draft = structuredClone(snapshot);
  draft.commercialLines = buildCommercialLines(draft.commercialLines);
  draft.materials = buildProposalItems('Material', draft.materials, catalogDefaults);
  draft.services = buildProposalItems('Serviço', draft.services, catalogDefaults);
  draft.title = buildProposalTitle(draft.client.legalName, draft.modalities);
  return draft;
}

function blankDraft(
  authenticatedUser: Props['authenticatedUser'],
  catalogDefaults: CatalogDefaultMap = {},
): ProposalSnapshot {
  const draft = structuredClone(DEMO_PROPOSAL);
  const issueDate = todayIso();
  draft.id = 'proposal-draft-00124';
  draft.code = 'MC-PROP-2026-00124';
  draft.version = 1;
  draft.status = 'Rascunho';
  draft.frozen = false;
  draft.basedOnVersion = null;
  draft.revisionReason = '';
  draft.client = {
    legalName: '',
    tradeName: '',
    cnpj: '',
    contactName: '',
    email: '',
    phone: '',
    segment: '',
    address: '',
  };
  draft.responsible = {
    name: authenticatedUser?.displayName || 'Marina Lopes - demonstração',
    email: authenticatedUser?.email || 'marina.demo@exemplo.invalid',
    phone: '',
  };
  draft.title = buildProposalTitle('', []);
  draft.operationalUnit = 'Rod. Governador Mário Covas, Km 279 | Espírito Santo';
  draft.issueDate = issueDate;
  draft.validUntil = addDaysIso(issueDate, 30);
  draft.modalities = [];
  draft.context = '';
  draft.need = '';
  draft.successCriteria = '';
  draft.scopeIncluded = [];
  draft.materials = buildProposalItems('Material', [], catalogDefaults);
  draft.services = buildProposalItems('Serviço', [], catalogDefaults);
  draft.commercialLines = buildCommercialLines();
  draft.dischargeResponsibility = 'Cliente/transportadora';
  draft.hasDischargePrice = false;
  return normalizeEditableDraft(draft, catalogDefaults);
}

function valueForLine(line: CommercialLine): string {
  if (line.amountMinor === null) return 'A definir';
  return line.kind === 'percentage' || line.kind === 'insurance'
    ? formatPercent(line.amountMinor)
    : formatBRL(line.amountMinor);
}

function itemDisplayValue(item: ProposalItem): string {
  if (item.valueCents === null) return 'A definir';
  if (item.valueCents === 0 && item.explicitZero) return 'Incluso';
  return formatBRL(item.valueCents);
}

function statusClass(status: string): string {
  return status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-');
}

export function ProposalPortal({ authenticatedUser }: Props) {
  const [view, setView] = useState<View>('dashboard');
  const [detailTab, setDetailTab] = useState<DetailTab>('Resumo');
  const [role, setRole] = useState<UserRole>('Trader');
  const [proposal, setProposal] = useState<ProposalSnapshot>(() => structuredClone(DEMO_PROPOSAL));
  const [draft, setDraft] = useState<ProposalSnapshot>(() => blankDraft(authenticatedUser));
  const [wizardStep, setWizardStep] = useState(0);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [query, setQuery] = useState('');
  const [dashboardFilter, setDashboardFilter] = useState('Todas');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [materialQuery, setMaterialQuery] = useState('');
  const [serviceQuery, setServiceQuery] = useState('');
  const [catalogNature, setCatalogNature] = useState('Todas');
  const [catalogOverrides, setCatalogOverrides] = useState<CatalogDefaultMap>({});
  const [catalogEditor, setCatalogEditor] = useState<{ code: string; cents: string; source: string; note: string } | null>(null);
  const [overrideEditor, setOverrideEditor] = useState<{ code: string; value: string; reason: string } | null>(null);
  const [approvalGate, setApprovalGate] = useState(true);
  const [audit, setAudit] = useState<AuditEvent[]>(DEMO_AUDIT);
  const [toast, setToast] = useState('');

  const displayName = authenticatedUser?.displayName || 'Marina Lopes - demonstração';
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const issues = useMemo(() => validateProposal(draft), [draft]);
  const blockingIssues = issues.filter((issue) => issue.severity === 'blocking');
  const filteredRows = proposalRows.filter((row) => {
    const matchesQuery = !query || `${row.client} ${row.code} ${row.owner}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = dashboardFilter === 'Todas' || row.status === dashboardFilter;
    return matchesQuery && matchesFilter;
  });
  const filteredCatalog = CATALOG.filter((item) => {
    const matchesQuery = !catalogQuery || `${item.code} ${item.name} ${item.family}`.toLowerCase().includes(catalogQuery.toLowerCase());
    const matchesNature = catalogNature === 'Todas' || item.nature === catalogNature;
    return matchesQuery && matchesNature;
  });

  useEffect(() => {
    let cancelled = false;
    async function loadCatalogDefaults() {
      try {
        const response = await fetch('/api/bootstrap', { headers: { 'x-demo-role': role } });
        if (!response.ok) throw new Error(await response.text());
        const result = await response.json() as {
          catalogDefaults?: Array<{ code: string; defaultCents: number; source: string; note: string }>;
        };
        const defaults = Object.fromEntries((result.catalogDefaults || []).map((item) => [
          item.code,
          { cents: item.defaultCents, source: item.source, note: item.note },
        ]));
        if (cancelled) return;
        setCatalogOverrides(defaults);
        setDraft((current) => normalizeEditableDraft(current, defaults));
      } catch {
        if (!cancelled) setCatalogOverrides({});
      }
    }
    void loadCatalogDefaults();
    return () => { cancelled = true; };
  }, [role]);

  useEffect(() => {
    if (view !== 'wizard' || draft.frozen) return;
    const timer = window.setTimeout(async () => {
      setSaveState('saving');
      try {
        const response = await fetch('/api/bootstrap', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-demo-role': role },
          body: JSON.stringify({ action: 'autosave', snapshot: draft }),
        });
        if (!response.ok) throw new Error(await response.text());
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [draft, role, view]);

  function announce(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }

  function navigate(next: View) {
    setView(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startNewProposal() {
    setDraft(blankDraft(authenticatedUser, catalogOverrides));
    setWizardStep(0);
    navigate('wizard');
  }

  function startNewVersion() {
    const latest = { ...DEMO_VERSIONS[1], snapshot: proposal };
    const next = createNextVersion(latest, 'Revisão comercial iniciada pelo portal.');
    setDraft(normalizeEditableDraft(next, catalogOverrides));
    setWizardStep(2);
    navigate('wizard');
  }

  function duplicateProposal() {
    const copy = structuredClone(proposal);
    copy.id = 'proposal-draft-duplicated';
    copy.code = 'MC-PROP-2026-00124';
    copy.version = 1;
    copy.status = 'Rascunho';
    copy.frozen = false;
    copy.basedOnVersion = null;
    copy.revisionReason = `Duplicada de ${proposal.code} sem herdar o PDF.`;
    setDraft(normalizeEditableDraft(copy, catalogOverrides));
    setWizardStep(0);
    navigate('wizard');
  }

  async function approveProposal() {
    if (role !== 'Aprovador') return;
    const reason = 'Condições revisadas no ambiente de demonstração.';
    try {
      const response = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-demo-role': role },
        body: JSON.stringify({
          action: 'approve',
          proposalId: proposal.id,
          version: proposal.version,
          reason,
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json() as { snapshot: ProposalSnapshot };
      setProposal(result.snapshot);
    } catch {
      announce('Não foi possível aprovar a versão. Recarregue e tente novamente.');
      return;
    }
    setAudit((events) => [{
      id: `audit-approve-${Date.now()}`,
      actor: displayName,
      role,
      timestamp: new Date().toISOString(),
      action: 'Aprovou V02',
      object: proposal.code,
      reason,
      before: 'Em aprovação',
      after: 'Aprovada',
    }, ...events]);
    announce('V02 aprovada. O PDF final foi liberado.');
  }

  function updateDraft(mutator: (current: ProposalSnapshot) => ProposalSnapshot) {
    setDraft((current) => {
      const next = mutator(structuredClone(current));
      next.title = buildProposalTitle(next.client.legalName, next.modalities);
      return next;
    });
  }

  function toggleModality(modality: Modality) {
    updateDraft((current) => {
      const selected = current.modalities.includes(modality);
      current.modalities = selected
        ? current.modalities.filter((item) => item !== modality)
        : [...current.modalities, modality];
      if (!selected && modality === 'Crossdocking') {
        current.commercialLines = current.commercialLines.map((line) =>
          line.code === '700005' ? { ...line, basis: 'Requer validação', basisValidated: false } : line,
        );
      }
      current.scopeIncluded = current.scopeIncluded.filter((item) => !item.startsWith(`${modality}:`));
      if (!selected) current.scopeIncluded.push(`${modality}: operação logística aplicável`);
      return current;
    });
  }

  function updateCommercialLine(code: string, changes: Partial<CommercialLine>) {
    updateDraft((current) => {
      current.commercialLines = current.commercialLines.map((line) => line.code === code ? { ...line, ...changes } : line);
      return current;
    });
  }

  function toggleMaterial(item: CatalogItem) {
    updateDraft((current) => {
      const existing = current.materials.find((material) => material.code === item.code);
      if (existing) {
        current.materials = current.materials.map((material) =>
          material.code === item.code ? { ...material, included: !material.included } : material,
        );
      } else {
        const override = catalogOverrides[item.code];
        current.materials.push({
          code: item.code,
          name: item.name,
          unit: item.billingUnit || 'A definir',
          included: true,
          valueCents: override?.cents ?? item.defaultCents,
          explicitZero: false,
          defaultCents: override?.cents ?? item.defaultCents,
          overrideCents: null,
          overrideReason: '',
          source: override?.source || item.source,
          provisional: false,
        });
      }
      return current;
    });
  }

  function saveMaterialOverride() {
    if (!overrideEditor) return;
    const cents = Math.round(Number(overrideEditor.value.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents < 0 || !overrideEditor.reason.trim()) {
      announce('Informe um valor válido e o motivo do override.');
      return;
    }
    updateDraft((current) => {
      current.materials = current.materials.map((material) =>
        material.code === overrideEditor.code
          ? applyMaterialOverride(material, cents, overrideEditor.reason)
          : material,
      );
      return current;
    });
    setOverrideEditor(null);
    announce('Valor personalizado aplicado somente à versão atual.');
  }

  function toggleService(code: string) {
    updateDraft((current) => {
      current.services = current.services.map((service) => service.code === code
        ? { ...service, included: !service.included }
        : service);
      return current;
    });
  }

  function updateService(code: string, value: string, confirm = false) {
    const normalized = value.trim();
    const cents = normalized === '' ? null : Math.round(Number(normalized.replace(',', '.')) * 100);
    updateDraft((current) => {
      current.services = current.services.map((service) => service.code === code
        ? { ...service, valueCents: cents != null && Number.isFinite(cents) ? cents : null, explicitZero: cents === 0, provisional: confirm ? false : service.provisional }
        : service);
      return current;
    });
  }

  async function saveCatalogDefault() {
    if (!catalogEditor || role !== 'Administrador') return;
    const cents = Math.round(Number(catalogEditor.cents.replace(',', '.')) * 100);
    if (!Number.isFinite(cents) || cents < 0 || !catalogEditor.source.trim() || !catalogEditor.note.trim()) {
      announce('Informe valor, fonte e motivo da homologação.');
      return;
    }
    try {
      const response = await fetch('/api/bootstrap', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-demo-role': role },
        body: JSON.stringify({ action: 'catalog-default', ...catalogEditor, cents }),
      });
      if (!response.ok) throw new Error(await response.text());
    } catch {
      announce('Não foi possível salvar o novo valor no catálogo. Tente novamente.');
      return;
    }
    setCatalogOverrides((current) => ({ ...current, [catalogEditor.code]: { cents, source: catalogEditor.source, note: catalogEditor.note } }));
    setCatalogEditor(null);
    announce('Default homologado sem alterar snapshots já congelados.');
  }

  function renderDashboard() {
    return (
      <div className="page-stack">
        <section className="hero-card dashboard-hero">
          <div>
            <p className="eyebrow eyebrow-light">Visão geral</p>
            <h2>Do briefing ao PDF,<br />sem perder o histórico.</h2>
            <p>Estruture condições, valide pendências e preserve cada versão emitida.</p>
          </div>
          <div className="hero-metrics">
            <div><strong>12</strong><span>Em andamento</span></div>
            <div><strong>4</strong><span>Aguardam aprovação</span></div>
            <div><strong>91%</strong><span>Dentro da validade</span></div>
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="table-card">
            <div className="section-heading">
              <div><p className="eyebrow">Atividade recente</p><h2>Propostas</h2></div>
              <div className="filter-row" aria-label="Filtros rápidos">
                {['Todas', 'Rascunho', 'Em aprovação', 'Aprovada'].map((filter) => (
                  <button key={filter} className={`filter ${dashboardFilter === filter ? 'active' : ''}`} type="button" onClick={() => setDashboardFilter(filter)}>{filter}</button>
                ))}
              </div>
            </div>
            <div className="data-table-wrap">
              <table className="data-table proposal-table">
                <thead><tr><th>Cliente / código</th><th>Modalidades</th><th>Versão</th><th>Status</th><th>Responsável</th><th>Validade</th><th>Ações</th></tr></thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.code}>
                      <td><strong>{row.client}</strong><small>{row.code} · {row.updated}</small></td>
                      <td><div className="mode-tags">{row.modes.map((mode) => <span key={mode}>{mode}</span>)}</div></td>
                      <td><span className="version-pill">{row.version}</span></td>
                      <td><span className={`status-pill status-${statusClass(row.status)}`}>{row.status}</span></td>
                      <td>{row.owner}</td><td>{row.validity}</td>
                      <td>
                        <div className="table-actions">
                          <button type="button" onClick={() => { navigate('detail'); setDetailTab('Resumo'); }}>Abrir</button>
                          <button type="button" onClick={duplicateProposal}>Duplicar</button>
                          <button type="button" onClick={() => { navigate('detail'); setDetailTab('Versões'); }}>Comparar</button>
                          <button type="button" onClick={() => { navigate('detail'); setDetailTab('Prévia'); }}>PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredRows.length && <div className="empty-state"><strong>Nenhuma proposta encontrada.</strong><span>Ajuste a busca ou os filtros.</span></div>}
            </div>
          </div>

          <aside className="side-panel">
            <section className="attention-card">
              <p className="eyebrow">Sua atenção</p><h2>4 aprovações aguardam revisão</h2>
              <p>Há condições comerciais e um SLA fora do padrão para avaliar.</p>
              <button type="button" className="secondary-button" onClick={() => { navigate('detail'); setDetailTab('Resumo'); }}>Ver aprovações</button>
            </section>
            <section className="draft-card">
              <div className="draft-header"><span className="draft-icon">06</span><span className="autosave-dot">Salvo há 2 min</span></div>
              <p className="eyebrow">Continuar rascunho</p><h2>Norte Sul Cosméticos</h2><p>B2C · etapa 6 de 8</p>
              <div className="progress-track"><span /></div>
              <div className="draft-footer"><strong>3 pendências</strong><button type="button" onClick={() => { setDraft(blankDraft(authenticatedUser, catalogOverrides)); setWizardStep(5); navigate('wizard'); }}>Continuar →</button></div>
            </section>
            <section className="quick-links">
              <p className="eyebrow">Atalhos</p>
              <button type="button" onClick={() => navigate('catalog')}>Consultar catálogo <span>→</span></button>
              <button type="button" onClick={() => navigate('settings')}>Gerenciar modelo mestre <span>→</span></button>
              <button type="button" onClick={() => { navigate('detail'); setDetailTab('Auditoria'); }}>Ver auditoria <span>→</span></button>
            </section>
          </aside>
        </section>
      </div>
    );
  }

  function renderWizardStep() {
    if (wizardStep === 0) {
      return (
        <div className="form-section">
          <div className="form-heading"><p className="eyebrow">Etapa 1</p><h2>Quem receberá a proposta?</h2><p>O cliente é uma única fonte para capa, conteúdo e aceite.</p></div>
          <div className="form-grid">
            <label className="field wide"><span>Razão social *</span><input value={draft.client.legalName} onChange={(event) => updateDraft((current) => ({ ...current, client: { ...current.client, legalName: event.target.value } }))} placeholder="Empresa - DEMONSTRAÇÃO" /></label>
            <label className="field"><span>Nome fantasia</span><input value={draft.client.tradeName} onChange={(event) => updateDraft((current) => ({ ...current, client: { ...current.client, tradeName: event.target.value } }))} /></label>
            <label className="field"><span>CNPJ</span><input value={draft.client.cnpj} onChange={(event) => updateDraft((current) => ({ ...current, client: { ...current.client, cnpj: event.target.value } }))} placeholder="00.000.000/0000-00" /></label>
          </div>
          <div className="inline-note">Use apenas dados fictícios neste ambiente de demonstração.</div>
        </div>
      );
    }
    if (wizardStep === 1) {
      return (
        <div className="form-section">
          <div className="form-heading"><p className="eyebrow">Etapa 2</p><h2>Identificação e validade</h2><p>Código e versão são separados e repetidos no documento inteiro.</p></div>
          <div className="form-grid">
            <label className="field"><span>Código</span><input value={draft.code} readOnly /></label>
            <label className="field"><span>Versão</span><input value={versionLabel(draft.version)} readOnly /></label>
            <label className="field wide automatic-title"><span>Título automático</span><input value={draft.title} readOnly /><small className="field-hint">Gerado a partir das modalidades selecionadas e da razão social do cliente.</small></label>
            <label className="field"><span>Data de emissão</span><input type="date" value={draft.issueDate} onChange={(event) => updateDraft((current) => ({ ...current, issueDate: event.target.value, validUntil: event.target.value ? addDaysIso(event.target.value, 30) : '' }))} /></label>
            <label className="field"><span>Válida até</span><input type="date" value={draft.validUntil} onChange={(event) => updateDraft((current) => ({ ...current, validUntil: event.target.value }))} /></label>
            <label className="field wide"><span>Unidade operacional</span><input value={draft.operationalUnit} onChange={(event) => updateDraft((current) => ({ ...current, operationalUnit: event.target.value }))} /></label>
            <label className="field"><span>Responsável comercial</span><input value={draft.responsible.name} onChange={(event) => updateDraft((current) => ({ ...current, responsible: { ...current.responsible, name: event.target.value } }))} /></label>
            <label className="field"><span>E-mail do responsável</span><input type="email" value={draft.responsible.email} onChange={(event) => updateDraft((current) => ({ ...current, responsible: { ...current.responsible, email: event.target.value } }))} /></label>
            <label className="field"><span>Telefone do responsável</span><input value={draft.responsible.phone} onChange={(event) => updateDraft((current) => ({ ...current, responsible: { ...current.responsible, phone: event.target.value } }))} placeholder="(00) 00000-0000" /></label>
          </div>
        </div>
      );
    }
    if (wizardStep === 2) {
      return (
        <div className="form-section">
          <div className="form-heading"><p className="eyebrow">Etapa 3</p><h2>Quais modalidades entram?</h2><p>Selecione uma ou mais. A prévia mostra apenas a união dos blocos aplicáveis.</p></div>
          <div className="modality-grid">
            {MODALITIES.map((modality) => {
              const selected = draft.modalities.includes(modality);
              const description = modality === 'B2C' ? 'Varejo · D0 até 12h' : modality === 'B2B' ? 'Atacado · D+1 até 12h' : 'Troca de nota · fluxo dedicado';
              return (
                <button type="button" key={modality} className={`modality-card ${selected ? 'selected' : ''}`} onClick={() => toggleModality(modality)} aria-pressed={selected}>
                  <span className="check-box">{selected ? '✓' : ''}</span><strong>{modality}</strong><small>{description}</small>
                </button>
              );
            })}
          </div>
          {draft.modalities.includes('Crossdocking') && (
            <div className="inline-note warning"><strong>Base do Crossdocking:</strong> uma proposta nova começa em “Requer validação”. O PDF final fica bloqueado até a decisão registrada.</div>
          )}
          <div className="form-grid">
            <label className="field wide"><span>Contexto operacional</span><textarea value={draft.context} onChange={(event) => updateDraft((current) => ({ ...current, context: event.target.value }))} /><small className="field-hint">Campo utilizado apenas para registro e controle interno.</small></label>
            <label className="field wide"><span>Necessidade principal</span><textarea value={draft.need} onChange={(event) => updateDraft((current) => ({ ...current, need: event.target.value }))} /><small className="field-hint">Campo utilizado apenas para registro e controle interno.</small></label>
          </div>
        </div>
      );
    }
    if (wizardStep === 3) {
      return (
        <div className="form-section">
          <div className="form-heading"><p className="eyebrow">Etapa 4</p><h2>Operação, premissas e SLAs</h2><p>Cada modalidade mantém seu compromisso e suas exceções em bloco próprio.</p></div>
          {!draft.modalities.length && <div className="empty-state compact"><strong>Selecione uma modalidade na etapa anterior.</strong></div>}
          {draft.modalities.map((modality) => (
            <section className="form-card" key={modality}>
              <div className="form-card-heading"><span>{modality}</span><strong>SLA de referência editável</strong></div>
              <label className="field"><textarea value={draft.sla[modality]} onChange={(event) => updateDraft((current) => ({ ...current, sla: { ...current.sla, [modality]: event.target.value } }))} /></label>
              {modality === 'Crossdocking' && (
                <ol className="flow-list">{draft.crossdockingFlow.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span>{step}</li>)}</ol>
              )}
            </section>
          ))}
          {!draft.modalities.includes('Crossdocking') || draft.modalities.length > 1 ? (
            <label className="field check-field"><input type="checkbox" checked={draft.dischargeResponsibility === 'Cliente/transportadora'} onChange={(event) => updateDraft((current) => ({ ...current, dischargeResponsibility: event.target.checked ? 'Cliente/transportadora' : 'Mercocamp' }))} /><span>Descarga convencional por conta do cliente/transportadora</span></label>
          ) : (
            <div className="inline-note">Crossdocking puro: recebimento/descarga convencional e espera por doca foram removidos.</div>
          )}
        </div>
      );
    }
    if (wizardStep === 4) {
      const lines = visibleCommercialLines(draft);
      return (
        <div className="form-section">
          <div className="form-heading"><p className="eyebrow">Etapa 5</p><h2>Condições comerciais</h2><p>Valor, unidade, base, periodicidade e observação permanecem separados.</p></div>
          {!draft.modalities.length && <div className="empty-state compact"><strong>Selecione uma modalidade para exibir as condições.</strong></div>}
          <div className="commercial-stack">
            {lines.map((line) => (
              <section className="commercial-row" key={line.code}>
                <div className="commercial-title"><span>{line.code}</span><div><strong>{line.name}</strong><small>{line.modality === 'Comum' ? 'Comum às modalidades selecionadas' : `Exclusivo de ${line.modality}`}</small></div></div>
                <div className="commercial-fields">
                  <label className="field compact"><span>{line.kind === 'percentage' || line.kind === 'insurance' ? 'Percentual (%)' : 'Valor (R$)'}</span><input type="number" min="0" step="0.01" value={line.amountMinor === null ? '' : line.amountMinor / 100} onChange={(event) => {
                    const amountMinor = event.target.value === '' ? null : Math.round(Number(event.target.value) * 100);
                    updateCommercialLine(line.code, { amountMinor, active: amountMinor !== null });
                  }} /></label>
                  <label className="field compact"><span>Unidade de cobrança</span><select value={line.billingUnit} onChange={(event) => updateCommercialLine(line.code, { billingUnit: event.target.value })}>{[...new Set([line.billingUnit, ...COMMERCIAL_BILLING_UNITS])].map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  {(line.kind === 'percentage' || line.kind === 'insurance') && <label className="field compact"><span>Base de cálculo</span><select value={line.basis} onChange={(event) => updateCommercialLine(line.code, { basis: event.target.value, basisValidated: line.modality === 'Crossdocking' ? false : line.basisValidated })}>{[...new Set([line.basis, ...CALCULATION_BASES])].map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}
                  <label className="field compact"><span>Periodicidade</span><select value={line.periodicity} onChange={(event) => updateCommercialLine(line.code, { periodicity: event.target.value })}>{[...new Set([line.periodicity, ...COMMERCIAL_PERIODICITIES])].map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="field compact note-field"><span>Observação</span><input value={line.note} onChange={(event) => updateCommercialLine(line.code, { note: event.target.value })} placeholder="Opcional" /></label>
                  {line.kind === 'minimum' && line.amountMinor !== null && line.amountMinor > 0 && (
                    <label className="field compact"><span>Carência em dias</span><input type="number" min="0" value={line.graceDays ?? ''} onChange={(event) => updateCommercialLine(line.code, { graceDays: event.target.value === '' ? null : Number(event.target.value), graceWaived: false })} /></label>
                  )}
                </div>
                {line.modality === 'Crossdocking' && line.kind === 'percentage' && (
                  <label className="field check-field validation-check"><input type="checkbox" checked={line.basisValidated} onChange={(event) => updateCommercialLine(line.code, { basisValidated: event.target.checked })} /><span>Base escolhida e validação administrativa registrada</span></label>
                )}
              </section>
            ))}
          </div>
          <div className="inline-note warning"><strong>700002:</strong> “Faturamento mínimo mensal” está com unidade “Percentual/mês” na planilha. O dado original foi preservado e continua pendente de confirmação.</div>
        </div>
      );
    }
    if (wizardStep === 5) {
      const materialCatalog = CATALOG.filter((item) => item.nature === 'Material');
      return (
          <div className="form-section">
          <div className="form-heading"><p className="eyebrow">Etapa 6</p><h2>Materiais e insumos</h2><p>Defaults homologados são protegidos. O lápis cria um override apenas nesta versão.</p></div>
          <div className="inline-note">Todos os materiais começam selecionados. Desmarque somente o que não fizer parte desta proposta.</div>
          <label className="catalog-search"><span className="sr-only">Buscar materiais</span><input placeholder="Buscar material, código ou família" value={materialQuery} onChange={(event) => setMaterialQuery(event.target.value)} /></label>
          <div className="selection-list">
            {materialCatalog.filter((item) => !materialQuery || `${item.code} ${item.name} ${item.family}`.toLowerCase().includes(materialQuery.toLowerCase())).map((item) => {
              const selected = draft.materials.find((material) => material.code === item.code);
              return (
                <div className={`selection-row ${selected?.included ? 'selected' : ''}`} key={item.code}>
                  <label className="selection-main"><input type="checkbox" checked={Boolean(selected?.included)} onChange={() => toggleMaterial(item)} /><span><strong>{item.name}</strong><small>{item.code} · {item.billingUnit} · {item.family}</small></span></label>
                  <div className="selection-value">
                    <strong>{selected?.included ? itemDisplayValue(selected) : item.sourceStatus}</strong>
                    {selected?.included && (
                      <button className="icon-button" type="button" aria-label="Editar valor" onClick={() => setOverrideEditor({ code: item.code, value: selected.valueCents === null ? '' : String(selected.valueCents / 100).replace('.', ','), reason: selected.overrideReason })}>Editar valor</button>
                    )}
                  </div>
                  {overrideEditor?.code === item.code && (
                    <div className="inline-editor">
                      <label className="field compact"><span>Novo valor (R$)</span><input value={overrideEditor.value} onChange={(event) => setOverrideEditor({ ...overrideEditor, value: event.target.value })} /></label>
                      <label className="field compact grow"><span>Motivo obrigatório</span><input value={overrideEditor.reason} onChange={(event) => setOverrideEditor({ ...overrideEditor, reason: event.target.value })} /></label>
                      <button type="button" className="primary-button" onClick={saveMaterialOverride}>Aplicar</button>
                      <button type="button" className="ghost-button" onClick={() => setOverrideEditor(null)}>Cancelar</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    if (wizardStep === 6) {
      const services = visibleServices(draft).filter((service) => !serviceQuery || `${service.code} ${service.name} ${service.unit}`.toLowerCase().includes(serviceQuery.toLowerCase()));
      return (
        <div className="form-section">
          <div className="form-heading"><p className="eyebrow">Etapa 7</p><h2>Serviços</h2><p>Todos começam selecionados. Desmarque somente o que não fizer parte desta proposta.</p></div>
          <label className="catalog-search"><span className="sr-only">Buscar serviços</span><input placeholder="Buscar serviço, código ou unidade" value={serviceQuery} onChange={(event) => setServiceQuery(event.target.value)} /></label>
          <div className="selection-list">
            {services.map((service) => (
              <div className={`selection-row service-row ${service.included ? 'selected' : ''}`} key={service.code}>
                <label className="selection-main"><input type="checkbox" checked={service.included} onChange={() => toggleService(service.code)} /><span><strong>{service.name}</strong><small>{service.code} · {service.unit}</small></span></label>
                {service.included ? (
                  <div className="service-editor">
                    <label className="field compact"><span>Valor (R$)</span><input type="number" min="0" step="0.01" value={service.valueCents === null ? '' : service.valueCents / 100} onChange={(event) => updateService(service.code, event.target.value)} /></label>
                    {service.provisional && <button type="button" className="warning-button" onClick={() => updateService(service.code, String((service.valueCents ?? 3500) / 100), true)}>Confirmar valor para esta proposta</button>}
                    <span className={`item-state ${service.provisional ? 'warning' : ''}`}>{service.provisional ? 'Provisório' : itemDisplayValue(service)}</span>
                  </div>
                ) : <span className="item-state">Oculto do PDF</span>}
              </div>
            ))}
          </div>
          <div className="inline-note warning"><strong>700303:</strong> enquanto não houver default homologado, o valor sugerido de R$ 35,00 fica marcado como provisório e exige confirmação.</div>
        </div>
      );
    }
    return (
      <div className="review-layout">
        <section className="checklist-card">
          <div className="form-heading"><p className="eyebrow">Etapa 8</p><h2>Checklist de emissão</h2><p>Os mesmos dados alimentam a prévia e o PDF.</p></div>
          <div className="checklist">
            {issues.length ? issues.map((issue) => (
              <button key={issue.id} type="button" className="check-item blocked" onClick={() => setWizardStep(issue.step - 1)}>
                <span>!</span><div><strong>{issue.message}</strong><small>Ir para a etapa {issue.step}</small></div>
              </button>
            )) : (
              <div className="check-item passed"><span>✓</span><div><strong>Campos e regras comerciais validados</strong><small>Pronto para congelar e enviar para aprovação.</small></div></div>
            )}
            <div className="check-item passed"><span>✓</span><div><strong>Cliente único em todas as páginas</strong><small>{draft.client.legalName || 'A definir'}</small></div></div>
            <div className="check-item passed"><span>✓</span><div><strong>Catálogo e template versionados</strong><small>{draft.templateVersion}</small></div></div>
          </div>
          <button type="button" className="primary-button full-button" disabled={blockingIssues.length > 0} onClick={() => {
            setDraft((current) => ({ ...current, frozen: true, status: approvalGate ? 'Em aprovação' : 'Aprovada' }));
            announce(approvalGate ? 'Versão congelada e enviada para aprovação.' : 'Versão congelada e finalizada.');
          }}>{approvalGate ? 'Congelar e enviar para aprovação' : 'Finalizar versão'}</button>
        </section>
        <PdfPanel snapshot={draft} role={role} approvalGate={approvalGate} compact />
      </div>
    );
  }

  function renderWizard() {
    return (
      <div className="wizard-shell">
        <aside className="wizard-steps">
          <div className="wizard-progress-copy"><span>{wizardStep + 1} de {WIZARD_STEPS.length}</span><strong>{Math.round(((wizardStep + 1) / WIZARD_STEPS.length) * 100)}%</strong></div>
          <div className="wizard-progress"><span style={{ width: `${((wizardStep + 1) / WIZARD_STEPS.length) * 100}%` }} /></div>
          <ol>
            {WIZARD_STEPS.map((step, index) => (
              <li key={step}>
                <button type="button" className={index === wizardStep ? 'active' : index < wizardStep ? 'complete' : ''} onClick={() => setWizardStep(index)}>
                  <span>{index < wizardStep ? '✓' : String(index + 1).padStart(2, '0')}</span><strong>{step}</strong>
                </button>
              </li>
            ))}
          </ol>
          <div className={`save-indicator save-${saveState}`}>
            <span />{saveState === 'saving' ? 'Salvando…' : saveState === 'saved' ? 'Rascunho salvo' : saveState === 'error' ? 'Servidor local indisponível' : 'Autosave ativo'}
          </div>
        </aside>
        <div className="wizard-main">
          <div className="wizard-content">{renderWizardStep()}</div>
          <footer className="wizard-footer">
            <button type="button" className="ghost-button" onClick={() => wizardStep === 0 ? navigate('dashboard') : setWizardStep((step) => step - 1)}>{wizardStep === 0 ? 'Sair do rascunho' : '← Voltar'}</button>
            <span>Etapa {wizardStep + 1}: {WIZARD_STEPS[wizardStep]}</span>
            {wizardStep < WIZARD_STEPS.length - 1 && <button type="button" className="primary-button" onClick={() => setWizardStep((step) => Math.min(WIZARD_STEPS.length - 1, step + 1))}>Continuar →</button>}
          </footer>
        </div>
        <aside className="wizard-summary">
          <p className="eyebrow">Resumo da versão</p>
          <h3>{draft.client.tradeName || draft.client.legalName || 'Novo cliente'}</h3>
          <span className="summary-code">{draft.code} · {versionLabel(draft.version)}</span>
          <dl>
            <div><dt>Status</dt><dd><span className="status-pill status-rascunho">{draft.status}</span></dd></div>
            <div><dt>Modalidades</dt><dd>{draft.modalities.join(', ') || 'Nenhuma'}</dd></div>
            <div><dt>Validade</dt><dd>{formatDateBR(draft.validUntil)}</dd></div>
            <div><dt>Materiais</dt><dd>{draft.materials.filter((item) => item.included).length}</dd></div>
            <div><dt>Serviços no PDF</dt><dd>{pdfServiceRows(draft).length}</dd></div>
          </dl>
          <div className={`pending-box ${blockingIssues.length ? '' : 'clear'}`}><strong>{blockingIssues.length ? `${blockingIssues.length} pendências` : 'Sem bloqueios'}</strong><span>{blockingIssues[0]?.message || 'A versão pode avançar.'}</span></div>
        </aside>
      </div>
    );
  }

  function renderDetail() {
    const currentVersions = [
      DEMO_VERSIONS[0],
      { ...DEMO_VERSIONS[1], status: proposal.status, snapshot: proposal },
    ];
    const changes = compareVersions(currentVersions[0].snapshot, currentVersions[1].snapshot);
    return (
      <div className="detail-page">
        <header className="detail-header">
          <div><button className="back-link" type="button" onClick={() => navigate('dashboard')}>← Propostas</button><p className="eyebrow">{proposal.code} · {versionLabel(proposal.version)}</p><h2>{proposal.client.legalName}</h2><div className="detail-meta"><span className={`status-pill status-${statusClass(proposal.status)}`}>{proposal.status}</span><span>{proposal.modalities.join(' + ')}</span><span>Válida até {formatDateBR(proposal.validUntil)}</span></div></div>
          <div className="detail-actions">
            <button type="button" className="ghost-button" onClick={duplicateProposal}>Duplicar</button>
            {proposal.frozen && role === 'Trader' && <button type="button" className="secondary-button auto-width" onClick={startNewVersion}>Criar nova versão</button>}
            {proposal.status === 'Em aprovação' && role === 'Aprovador' && <button type="button" className="primary-button" onClick={approveProposal}>Aprovar V02</button>}
            <button type="button" className="primary-button" onClick={() => setDetailTab('Prévia')}>Ver PDF</button>
          </div>
        </header>
        <nav className="tab-nav" aria-label="Detalhe da proposta">
          {(['Resumo', 'Precificação', 'Prévia', 'Versões', 'Auditoria'] as DetailTab[]).map((tab) => <button type="button" key={tab} className={detailTab === tab ? 'active' : ''} onClick={() => setDetailTab(tab)}>{tab}</button>)}
        </nav>
        {detailTab === 'Resumo' && (
          <div className="detail-grid">
            <section className="panel-card span-2"><p className="eyebrow">Visão executiva</p><h3>{proposal.title}</h3><p>{proposal.context}</p><div className="scope-chips">{proposal.scopeIncluded.map((item) => <span key={item}>{item}</span>)}</div></section>
            <section className="panel-card"><p className="eyebrow">Identificação</p><dl className="info-list"><div><dt>Cliente</dt><dd>{proposal.client.legalName}</dd></div><div><dt>CNPJ</dt><dd>{proposal.client.cnpj}</dd></div><div><dt>Responsável</dt><dd>{proposal.responsible.name}</dd></div><div><dt>Unidade</dt><dd>{proposal.operationalUnit}</dd></div></dl></section>
            <section className="panel-card"><p className="eyebrow">Gate da versão</p><div className="health-score"><strong>{validateProposal(proposal).length ? 'Revisar' : 'Íntegra'}</strong><span>{validateProposal(proposal).length} bloqueios de conteúdo</span></div><p>Versão congelada. Alterações exigem uma nova versão e um motivo.</p></section>
            <section className="panel-card span-2"><p className="eyebrow">Modelo operacional</p><div className="sla-grid">{proposal.modalities.map((modality) => <div key={modality}><strong>{modality}</strong><p>{proposal.sla[modality]}</p></div>)}</div></section>
          </div>
        )}
        {detailTab === 'Precificação' && (
          <div className="pricing-detail">
            <div className="panel-heading"><div><p className="eyebrow">PricingVersion</p><h3>Condições congeladas em {versionLabel(proposal.version)}</h3></div><span className="lock-chip">Imutável</span></div>
            <div className="commercial-stack">{visibleCommercialLines(proposal).filter((line) => line.active).map((line) => <div className="pricing-line-card" key={line.code}><span>{line.code}</span><div><strong>{line.name}</strong><small>{line.basis || line.billingUnit} · {line.periodicity || line.billingUnit}</small></div><strong>{valueForLine(line)}</strong></div>)}</div>
            <div className="split-panels"><section className="panel-card"><p className="eyebrow">Materiais</p>{proposal.materials.filter((item) => item.included).map((item) => <div className="mini-row" key={item.code}><span>{item.name}<small>{item.code} · {item.overrideCents !== null ? 'Valor personalizado' : 'Default da versão'}</small></span><strong>{itemDisplayValue(item)}</strong></div>)}</section><section className="panel-card"><p className="eyebrow">Serviços no PDF</p>{pdfServiceRows(proposal).map((item) => <div className="mini-row" key={item.code}><span>{item.name}<small>{item.code} · {item.unit}</small></span><strong>{itemDisplayValue(item)}</strong></div>)}</section></div>
          </div>
        )}
        {detailTab === 'Prévia' && <PdfPanel snapshot={proposal} role={role} approvalGate={approvalGate} />}
        {detailTab === 'Versões' && (
          <div className="versions-layout">
            <section className="version-timeline"><div className="panel-heading"><div><p className="eyebrow">Histórico imutável</p><h3>Linha do tempo</h3></div><button className="secondary-button auto-width" type="button" onClick={startNewVersion}>Criar nova versão</button></div>{currentVersions.slice().reverse().map((version) => <article className="version-entry" key={version.id}><span className="timeline-dot" /><div><div className="version-entry-top"><strong>{versionLabel(version.number)} · {version.status}</strong><span>{new Date(version.createdAt).toLocaleString('pt-BR')}</span></div><p>{version.revisionReason}</p><small>{version.createdBy} · {version.contentHash}</small><div className="table-actions"><button type="button" onClick={() => setDetailTab('Prévia')}>Ver prévia</button><button type="button" disabled={!version.artifacts.length}>Baixar PDF original</button></div></div></article>)}</section>
            <section className="diff-panel"><p className="eyebrow">Comparar V01 × V02</p><h3>{changes.length} mudanças materiais</h3>{changes.map((change) => <div className={`diff-item diff-${change.type}`} key={change.field}><span>{change.type === 'added' ? '+' : change.type === 'removed' ? '−' : '↻'}</span><div><strong>{change.field}</strong><small>{change.before} → {change.after}</small></div></div>)}</section>
          </div>
        )}
        {detailTab === 'Auditoria' && (
          <section className="audit-panel"><div className="panel-heading"><div><p className="eyebrow">Log append-only</p><h3>Eventos e decisões</h3></div><button className="ghost-button" type="button" onClick={() => announce('Exportação de auditoria preparada em CSV.')}>Exportar CSV</button></div><div className="audit-list">{audit.map((event) => <article key={event.id}><span className="audit-avatar">{event.actor.split(' ').slice(0,2).map((part) => part[0]).join('')}</span><div><strong>{event.action}</strong><p>{event.reason}</p><small>{event.actor} · {event.role} · {new Date(event.timestamp).toLocaleString('pt-BR')}</small></div><div className="audit-change"><span>{event.before}</span><b>→</b><span>{event.after}</span></div></article>)}</div></section>
        )}
      </div>
    );
  }

  function renderCatalog() {
    const counts = {
      Material: CATALOG.filter((item) => item.nature === 'Material').length,
      Serviço: CATALOG.filter((item) => item.nature === 'Serviço').length,
      'Condição comercial': CATALOG.filter((item) => item.nature === 'Condição comercial').length,
    };
    return (
      <div className="page-stack">
        <section className="page-intro"><div><p className="eyebrow">Administração</p><h2>Catálogo mestre</h2><p>Os seis campos originais foram preservados; status e homologações vivem em metadados separados.</p></div><span className="source-chip">Padrão Comercial · A4:F69 · 65 registros</span></section>
        <section className="catalog-stats">{Object.entries(counts).map(([label, count]) => <div key={label}><strong>{count}</strong><span>{label}</span></div>)}<div><strong>{CATALOG.filter((item) => item.sourceStatus === 'Requer consulta').length}</strong><span>Requerem consulta</span></div></section>
        {catalogEditor && (
          <section className="catalog-editor panel-card">
            <div><p className="eyebrow">Homologar default</p><h3>{catalogEditor.code} · {CATALOG.find((item) => item.code === catalogEditor.code)?.name}</h3><p>A alteração vale para propostas futuras. Versões congeladas permanecem intactas.</p></div>
            <label className="field compact"><span>Valor (R$)</span><input value={catalogEditor.cents} onChange={(event) => setCatalogEditor({ ...catalogEditor, cents: event.target.value })} /></label>
            <label className="field compact"><span>Fonte</span><input value={catalogEditor.source} onChange={(event) => setCatalogEditor({ ...catalogEditor, source: event.target.value })} /></label>
            <label className="field compact"><span>Motivo / observação</span><input value={catalogEditor.note} onChange={(event) => setCatalogEditor({ ...catalogEditor, note: event.target.value })} /></label>
            <button className="primary-button" type="button" onClick={() => void saveCatalogDefault()}>Homologar</button><button className="ghost-button" type="button" onClick={() => setCatalogEditor(null)}>Cancelar</button>
          </section>
        )}
        <section className="table-card">
          <div className="catalog-toolbar"><label className="catalog-search"><input value={catalogQuery} onChange={(event) => setCatalogQuery(event.target.value)} placeholder="Buscar código, família ou item" /></label><div className="filter-row">{['Todas', 'Material', 'Serviço', 'Condição comercial'].map((nature) => <button type="button" key={nature} className={`filter ${catalogNature === nature ? 'active' : ''}`} onClick={() => setCatalogNature(nature)}>{nature}</button>)}</div></div>
          <div className="data-table-wrap catalog-table-wrap">
            <table className="data-table"><thead><tr><th>Código</th><th>Família</th><th>Natureza</th><th>Serviço / material</th><th>Unidade</th><th>Valor original</th><th>Valor vigente</th><th>Estado</th><th>Ação</th></tr></thead><tbody>{filteredCatalog.map((item) => {
              const override = catalogOverrides[item.code];
              const currentValue = override?.cents ?? item.defaultCents;
              return <tr key={item.code}><td><code>{item.code}</code></td><td>{item.family || '—'}</td><td><span className="nature-chip">{item.nature || 'Personalizado'}</span></td><td><strong>{item.name}</strong></td><td>{item.billingUnit || '—'}</td><td>{item.sourceValue ?? 'Vazio'}</td><td><strong>{currentValue === null ? 'Não homologado' : formatBRL(currentValue)}</strong></td><td><span className={`source-status ${override || item.defaultStatus === 'Confirmado' ? 'confirmed' : statusClass(item.sourceStatus)}`}>{override ? 'Confirmado' : item.defaultStatus}</span></td><td><button type="button" className="row-action" disabled={role !== 'Administrador'} onClick={() => setCatalogEditor({ code: item.code, cents: currentValue === null ? '' : String(currentValue / 100).replace('.', ','), source: override?.source || item.source || '', note: override?.note || '' })}>{role === 'Administrador' ? 'Editar default' : 'Somente Admin'}</button></td></tr>;
            })}</tbody></table>
          </div>
        </section>
      </div>
    );
  }

  function renderSettings() {
    return (
      <div className="settings-page">
        <section className="page-intro"><div><p className="eyebrow">Preparação e governança</p><h2>Configurações</h2><p>Regras sensíveis permanecem explícitas, versionadas e pendentes de homologação quando necessário.</p></div><span className="source-chip">Template {proposal.templateVersion}</span></section>
        <div className="settings-grid">
          <section className="panel-card"><div className="setting-heading"><div><p className="eyebrow">Workflow</p><h3>Gate de aprovação</h3></div><label className="switch"><input type="checkbox" checked={approvalGate} onChange={(event) => setApprovalGate(event.target.checked)} disabled={role !== 'Administrador'} /><span /></label></div><p>Quando ativo, versões com exceções precisam de um Aprovador e o trader não aprova a própria exceção.</p><span className={`setting-state ${approvalGate ? 'active' : ''}`}>{approvalGate ? 'Ativo' : 'Desabilitado para operação'}</span></section>
          <section className="panel-card"><div className="setting-heading"><div><p className="eyebrow">Fiscal / Jurídico</p><h3>Impostos e textos legais</h3></div><span className="pending-chip">Pendente de homologação</span></div><p>Nenhuma alíquota histórica foi promovida silenciosamente. O conteúdo exige vigência, fonte e publicação autorizada.</p><button className="ghost-button" type="button" disabled={role !== 'Administrador'}>Revisar conteúdo</button></section>
          <section className="panel-card span-2"><p className="eyebrow">Dados institucionais versionados</p><div className="institutional-fields"><label className="field"><span>Anos em 2026</span><input value={proposal.institutionalFacts.years} readOnly /></label><label className="field"><span>Centros de distribuição</span><input value={proposal.institutionalFacts.distributionCenters} readOnly /></label><label className="field"><span>Área</span><input value={proposal.institutionalFacts.squareMeters} readOnly /></label><label className="field"><span>Clientes</span><input value={proposal.institutionalFacts.clients} readOnly /></label></div><p className="source-note">Vigência: {formatDateBR(proposal.institutionalFacts.effectiveDate)} · {proposal.institutionalVersion}. Históricos divergentes (330/350, 5/7, 40/50 mil m²) não foram mesclados.</p></section>
          <section className="panel-card integration-card"><div><p className="eyebrow">Fase 2</p><h3>Pipefy</h3><p>Resumo, status, versão atual, link e PDF final.</p></div><span className="feature-flag">Feature flag desligada</span><ul><li>Fila e retentativa preparadas</li><li>Idempotência e reconciliação</li><li>Nenhuma credencial conectada</li></ul></section>
          <section className="panel-card integration-card"><div><p className="eyebrow">Fase 2</p><h3>Contratos</h3><p>Sempre nascem da versão aceita.</p></div><span className="feature-flag">Feature flag desligada</span><ul><li>acceptedProposalVersionId preparado</li><li>Biblioteca jurídica não homologada</li><li>Nenhuma assinatura conectada</li></ul></section>
        </div>
      </div>
    );
  }

  const title = view === 'dashboard' ? 'Propostas comerciais' : view === 'wizard' ? 'Nova proposta' : view === 'detail' ? 'Detalhe da proposta' : view === 'catalog' ? 'Catálogo comercial' : 'Configurações';
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand-lockup" type="button" onClick={() => navigate('dashboard')} aria-label="Ir ao dashboard">
          <span className="brand-mark" aria-hidden="true">M</span><span><strong>Mercocamp</strong><small>Hub Comercial</small></span>
        </button>
        <nav aria-label="Navegação principal" className="main-nav">
          <button className={`nav-item ${view === 'dashboard' || view === 'detail' || view === 'wizard' ? 'active' : ''}`} type="button" onClick={() => navigate('dashboard')}><span>P</span>Propostas</button>
          <button className={`nav-item ${view === 'catalog' ? 'active' : ''}`} type="button" onClick={() => navigate('catalog')}><span>C</span>Catálogo</button>
          <button className={`nav-item ${view === 'detail' && detailTab === 'Auditoria' ? 'active' : ''}`} type="button" onClick={() => { navigate('detail'); setDetailTab('Auditoria'); }}><span>A</span>Auditoria</button>
          <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} type="button" onClick={() => navigate('settings')}><span>•</span>Configurações</button>
        </nav>
        <div className="sidebar-note"><span className="note-dot" /><p><strong>Catálogo sincronizado</strong><br />65 itens · fonte de 24/08/2026</p></div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">Grupo Mercocamp · Comercial</p><h1>{title}</h1></div>
          <div className="topbar-actions">
            {view === 'dashboard' && <label className="search-field"><span className="sr-only">Buscar propostas</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, código ou trader" /></label>}
            <button className="primary-button" type="button" onClick={startNewProposal}>+ Nova proposta</button>
            <label className="role-switcher"><span>Perfil</span><select value={role} onChange={(event) => setRole(event.target.value as UserRole)}><option>Trader</option><option>Aprovador</option><option>Administrador</option></select></label>
            <button className="user-chip" type="button" aria-label={`Perfil de ${displayName}`}><span>{initials || 'ML'}</span><span><strong>{displayName}</strong><small>{authenticatedUser?.email || 'Conta local de demonstração'}</small></span></button>
          </div>
        </header>
        <div className="page-content">
          {view === 'dashboard' && renderDashboard()}
          {view === 'wizard' && renderWizard()}
          {view === 'detail' && renderDetail()}
          {view === 'catalog' && renderCatalog()}
          {view === 'settings' && renderSettings()}
        </div>
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
