'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProposalSnapshot, UserRole } from '../../lib/domain';
import { versionLabel } from '../../lib/domain';
import { buildProposalPdf } from '../../lib/pdf';
import { contentFingerprint, validateProposal } from '../../lib/rules';

type Props = {
  snapshot: ProposalSnapshot;
  role: UserRole;
  approvalGate: boolean;
  compact?: boolean;
};

function safeFilePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', copy.buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

export function PdfPanel({ snapshot, role, approvalGate, compact = false }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [renderState, setRenderState] = useState<'rendering' | 'ready' | 'error'>('rendering');
  const [artifactState, setArtifactState] = useState('');
  const issues = useMemo(() => validateProposal(snapshot), [snapshot]);
  const blocking = issues.filter((issue) => issue.severity === 'blocking');
  const isFinalAllowed = !blocking.length && (!approvalGate || snapshot.status === 'Aprovada') && snapshot.frozen;
  const isDraft = !isFinalAllowed;
  const fingerprint = contentFingerprint(snapshot);

  const renderPdf = useCallback(async () => {
    setRenderState('rendering');
    try {
      const bytes = await buildProposalPdf(snapshot, { draft: isDraft });
      const blob = new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfBytes(bytes);
      setPdfUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
      setRenderState('ready');
    } catch (error) {
      console.error(error);
      setRenderState('error');
    }
  }, [snapshot, isDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => void renderPdf(), 180);
    return () => window.clearTimeout(timer);
  }, [renderPdf, fingerprint]);

  useEffect(() => () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  async function downloadPdf() {
    if (!pdfBytes) return;
    const client = safeFilePart(snapshot.client.tradeName || snapshot.client.legalName || 'Cliente');
    const fileName = `${snapshot.code}_${client}_${versionLabel(snapshot.version)}${isDraft ? '_RASCUNHO' : ''}.pdf`;
    const blob = new Blob([Uint8Array.from(pdfBytes)], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);

    if (!isFinalAllowed) {
      setArtifactState('Prévia baixada com marca d’água. O arquivo não foi registrado como oficial.');
      return;
    }

    setArtifactState('Registrando PDF imutável…');
    try {
      const hash = await sha256Hex(pdfBytes);
      const body = new FormData();
      body.set('proposalId', snapshot.id);
      body.set('version', String(snapshot.version));
      body.set('contentHash', fingerprint);
      body.set('fileHash', hash);
      body.set('file', new File([Uint8Array.from(pdfBytes)], fileName, { type: 'application/pdf' }));
      const response = await fetch('/api/artifacts', {
        method: 'POST',
        headers: { 'x-demo-role': role },
        body,
      });
      if (!response.ok) throw new Error(await response.text());
      setArtifactState('PDF canônico registrado com hash e sem sobrescrever versões anteriores.');
    } catch {
      setArtifactState('PDF baixado. O registro local do artefato ficou pendente; tente novamente com o servidor ativo.');
    }
  }

  return (
    <section className={`pdf-panel ${compact ? 'pdf-panel-compact' : ''}`} aria-label="Prévia fiel do PDF">
      <div className="pdf-toolbar">
        <div>
          <p className="eyebrow">Mesmo renderizador</p>
          <strong>{isDraft ? 'Prévia com marca d’água' : 'PDF final elegível'}</strong>
          <small>{renderState === 'rendering' ? 'Atualizando documento…' : renderState === 'ready' ? `${fingerprint} · ${versionLabel(snapshot.version)}` : 'Falha ao renderizar'}</small>
        </div>
        <div className="pdf-toolbar-actions">
          <button className="ghost-button" type="button" onClick={() => void renderPdf()}>Atualizar prévia</button>
          <button className="primary-button" type="button" onClick={() => void downloadPdf()} disabled={!pdfBytes || renderState !== 'ready'}>
            {isFinalAllowed ? 'Baixar e registrar PDF' : 'Baixar prévia'}
          </button>
        </div>
      </div>

      {blocking.length > 0 && (
        <div className="pdf-blocker" role="alert">
          <strong>{blocking.length} {blocking.length === 1 ? 'pendência bloqueia' : 'pendências bloqueiam'} o PDF final.</strong>
          <span>{blocking.slice(0, 2).map((issue) => issue.message).join(' · ')}</span>
        </div>
      )}
      {!blocking.length && approvalGate && snapshot.status !== 'Aprovada' && (
        <div className="pdf-blocker warning" role="status">
          <strong>Aguardando aprovação.</strong>
          <span>A prévia está disponível; o PDF final será liberado quando a versão congelada for aprovada.</span>
        </div>
      )}
      {artifactState && <p className="artifact-state" role="status">{artifactState}</p>}

      <div className="pdf-frame-shell">
        {pdfUrl ? (
          <iframe title={`Prévia ${snapshot.code} ${versionLabel(snapshot.version)}`} src={pdfUrl} className="pdf-frame" />
        ) : (
          <div className="pdf-loading">{renderState === 'error' ? 'Não foi possível gerar a prévia.' : 'Gerando páginas…'}</div>
        )}
      </div>
    </section>
  );
}
