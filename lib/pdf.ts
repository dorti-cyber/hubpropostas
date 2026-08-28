import {
  degrees,
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import type { CommercialLine, ProposalItem, ProposalSnapshot } from './domain';
import {
  formatBRL,
  formatDateBR,
  formatPercent,
  versionLabel,
} from './domain';
import { pdfServiceRows, visibleCommercialLines } from './rules';

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 44;
const COLORS = {
  navy: rgb(0.027, 0.11, 0.176),
  navy2: rgb(0.043, 0.149, 0.239),
  teal: rgb(0.027, 0.604, 0.608),
  cyan: rgb(0.05, 0.72, 0.75),
  ink: rgb(0.082, 0.173, 0.243),
  muted: rgb(0.38, 0.47, 0.53),
  line: rgb(0.86, 0.9, 0.92),
  pale: rgb(0.95, 0.975, 0.98),
  mint: rgb(0.9, 0.965, 0.95),
  amber: rgb(0.93, 0.62, 0.15),
  amberPale: rgb(1, 0.96, 0.86),
  white: rgb(1, 1, 1),
};

type Fonts = { regular: PDFFont; bold: PDFFont };

function sanitizePdfText(value: string): string {
  return value
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\u2022/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200f\u202a-\u202e]/g, '');
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = sanitizePdfText(text).split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size = 9,
  color = COLORS.muted,
  lineHeight = size * 1.42,
): number {
  const lines = wrapText(text, font, size, width);
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: y - index * lineHeight, font, size, color });
  });
  return y - lines.length * lineHeight;
}

function drawInternalHeader(
  page: PDFPage,
  snapshot: ProposalSnapshot,
  fonts: Fonts,
  section: string,
): void {
  page.drawText('GRUPO MERCOCAMP', {
    x: MARGIN,
    y: 799,
    font: fonts.bold,
    size: 10,
    color: COLORS.navy,
  });
  page.drawText(section.toUpperCase(), {
    x: MARGIN,
    y: 783,
    font: fonts.bold,
    size: 6.8,
    color: COLORS.teal,
    characterSpacing: 1.2,
  });
  const right = `${snapshot.client.tradeName || snapshot.client.legalName}  |  ${snapshot.code}  |  ${versionLabel(snapshot.version)}`;
  page.drawText(sanitizePdfText(right), {
    x: A4[0] - MARGIN - fonts.regular.widthOfTextAtSize(sanitizePdfText(right), 6.8),
    y: 799,
    font: fonts.regular,
    size: 6.8,
    color: COLORS.muted,
  });
  page.drawLine({
    start: { x: MARGIN, y: 772 },
    end: { x: A4[0] - MARGIN, y: 772 },
    thickness: 1,
    color: COLORS.line,
  });
  page.drawLine({
    start: { x: MARGIN, y: 772 },
    end: { x: MARGIN + 82, y: 772 },
    thickness: 2.5,
    color: COLORS.teal,
  });
}

function drawWatermark(page: PDFPage, fonts: Fonts): void {
  page.drawText('RASCUNHO', {
    x: 98,
    y: 360,
    font: fonts.bold,
    size: 72,
    color: COLORS.navy,
    opacity: 0.055,
    rotate: degrees(32),
  });
}

function drawTitle(page: PDFPage, fonts: Fonts, eyebrow: string, title: string, subtitle?: string): number {
  page.drawText(eyebrow.toUpperCase(), {
    x: MARGIN,
    y: 737,
    font: fonts.bold,
    size: 7.2,
    color: COLORS.teal,
    characterSpacing: 1.1,
  });
  const titleLines = wrapText(title, fonts.bold, 24, 485);
  titleLines.forEach((line, index) => {
    page.drawText(line, { x: MARGIN, y: 711 - index * 28, font: fonts.bold, size: 24, color: COLORS.navy });
  });
  let y = 711 - titleLines.length * 28;
  if (subtitle) y = drawWrapped(page, subtitle, MARGIN, y + 3, 485, fonts.regular, 9.2, COLORS.muted, 13.2);
  return y - 15;
}

function drawSectionCard(
  page: PDFPage,
  fonts: Fonts,
  x: number,
  top: number,
  width: number,
  title: string,
  text: string,
  tone: 'white' | 'mint' | 'navy' | 'amber' = 'white',
): number {
  const titleLines = wrapText(title, fonts.bold, 10, width - 24);
  const bodyLines = wrapText(text, fonts.regular, 8.2, width - 24);
  const height = Math.max(72, 22 + titleLines.length * 13 + bodyLines.length * 11.2 + 12);
  const fill = tone === 'mint' ? COLORS.mint : tone === 'navy' ? COLORS.navy : tone === 'amber' ? COLORS.amberPale : COLORS.white;
  page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    color: fill,
    borderColor: tone === 'navy' ? COLORS.navy : COLORS.line,
    borderWidth: tone === 'navy' ? 0 : 0.8,
  });
  const textColor = tone === 'navy' ? COLORS.white : COLORS.ink;
  const bodyColor = tone === 'navy' ? rgb(0.72, 0.82, 0.86) : COLORS.muted;
  let y = top - 18;
  titleLines.forEach((line) => {
    page.drawText(line, { x: x + 12, y, font: fonts.bold, size: 10, color: textColor });
    y -= 13;
  });
  bodyLines.forEach((line) => {
    page.drawText(line, { x: x + 12, y, font: fonts.regular, size: 8.2, color: bodyColor });
    y -= 11.2;
  });
  return top - height;
}

function drawBulletList(
  page: PDFPage,
  fonts: Fonts,
  items: string[],
  x: number,
  top: number,
  width: number,
  color = COLORS.muted,
): number {
  let y = top;
  for (const item of items) {
    const lines = wrapText(item, fonts.regular, 8.5, width - 16);
    page.drawCircle({ x: x + 3, y: y + 2, size: 2.2, color: COLORS.teal });
    lines.forEach((line, index) => page.drawText(line, {
      x: x + 13,
      y: y - index * 11.5,
      font: fonts.regular,
      size: 8.5,
      color,
    }));
    y -= Math.max(16, lines.length * 11.5 + 4);
  }
  return y;
}

function commercialValue(line: CommercialLine): string {
  if (line.amountMinor === null) return 'A definir';
  if (line.kind === 'percentage' || line.kind === 'insurance') return formatPercent(line.amountMinor);
  return formatBRL(line.amountMinor);
}

function itemValue(item: ProposalItem): string {
  if (item.valueCents === null) return 'A definir';
  if (item.valueCents === 0 && item.explicitZero) return 'Incluso';
  return formatBRL(item.valueCents);
}

function drawTable(
  page: PDFPage,
  fonts: Fonts,
  top: number,
  headers: string[],
  rows: string[][],
  widths: number[],
): number {
  const x = MARGIN;
  const headerHeight = 25;
  const rowHeight = 32;
  page.drawRectangle({ x, y: top - headerHeight, width: widths.reduce((a, b) => a + b, 0), height: headerHeight, color: COLORS.navy });
  let cursorX = x;
  headers.forEach((header, index) => {
    page.drawText(header.toUpperCase(), { x: cursorX + 7, y: top - 16, font: fonts.bold, size: 6.4, color: COLORS.white });
    cursorX += widths[index];
  });
  let y = top - headerHeight;
  rows.forEach((row, rowIndex) => {
    page.drawRectangle({
      x,
      y: y - rowHeight,
      width: widths.reduce((a, b) => a + b, 0),
      height: rowHeight,
      color: rowIndex % 2 ? COLORS.pale : COLORS.white,
      borderColor: COLORS.line,
      borderWidth: 0.5,
    });
    cursorX = x;
    row.forEach((cell, index) => {
      const lines = wrapText(cell, index === row.length - 1 ? fonts.bold : fonts.regular, 7.3, widths[index] - 12).slice(0, 2);
      lines.forEach((line, lineIndex) => page.drawText(line, {
        x: cursorX + 7,
        y: y - 13 - lineIndex * 9,
        font: index === row.length - 1 ? fonts.bold : fonts.regular,
        size: 7.3,
        color: index === row.length - 1 ? COLORS.navy : COLORS.muted,
      }));
      cursorX += widths[index];
    });
    y -= rowHeight;
  });
  return y;
}

function addInternalPage(pdf: PDFDocument, snapshot: ProposalSnapshot, fonts: Fonts, section: string, draft: boolean): PDFPage {
  const page = pdf.addPage(A4);
  drawInternalHeader(page, snapshot, fonts, section);
  if (draft) drawWatermark(page, fonts);
  return page;
}

export async function buildProposalPdf(
  snapshot: ProposalSnapshot,
  options: { draft?: boolean } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const draft = options.draft ?? snapshot.status !== 'Aprovada';

  pdf.setTitle(`${snapshot.code} - ${snapshot.client.tradeName || snapshot.client.legalName} - ${versionLabel(snapshot.version)}`);
  pdf.setAuthor('Grupo Mercocamp');
  pdf.setCreator(`Hub de Propostas · ${snapshot.templateVersion}`);
  pdf.setSubject(snapshot.title);
  pdf.setKeywords(['proposta comercial', snapshot.code, versionLabel(snapshot.version), snapshot.templateVersion]);
  const issueDate = new Date(`${snapshot.issueDate}T12:00:00Z`);
  pdf.setCreationDate(issueDate);
  pdf.setModificationDate(issueDate);

  // 1. Capa
  const cover = pdf.addPage(A4);
  cover.drawRectangle({ x: 0, y: 0, width: 595.28, height: 841.89, color: COLORS.pale });
  cover.drawRectangle({ x: 0, y: 0, width: 355, height: 841.89, color: COLORS.navy });
  cover.drawRectangle({ x: 355, y: 0, width: 240, height: 841.89, color: COLORS.white });
  cover.drawCircle({ x: 480, y: 708, size: 142, color: COLORS.mint });
  cover.drawCircle({ x: 530, y: 635, size: 88, color: COLORS.teal, opacity: 0.82 });
  cover.drawRectangle({ x: 392, y: 126, width: 158, height: 250, color: COLORS.navy2, opacity: 0.95 });
  for (let i = 0; i < 5; i += 1) {
    cover.drawRectangle({ x: 410, y: 151 + i * 42, width: 124, height: 24, color: i % 2 ? COLORS.teal : COLORS.white, opacity: i % 2 ? 0.6 : 0.84 });
  }
  cover.drawText('GRUPO MERCOCAMP', { x: 46, y: 777, font: fonts.bold, size: 10, color: COLORS.white });
  cover.drawText('PROPOSTA COMERCIAL', { x: 46, y: 745, font: fonts.bold, size: 7.2, color: COLORS.cyan, characterSpacing: 1.4 });
  const coverTitle = wrapText(snapshot.title, fonts.bold, 28, 270);
  coverTitle.forEach((line, index) => cover.drawText(line, { x: 46, y: 660 - index * 33, font: fonts.bold, size: 28, color: COLORS.white }));
  let coverY = 660 - coverTitle.length * 33 - 22;
  coverY = drawWrapped(cover, snapshot.client.legalName, 46, coverY, 266, fonts.regular, 13, COLORS.white, 18) - 18;
  cover.drawLine({ start: { x: 46, y: coverY }, end: { x: 290, y: coverY }, thickness: 1, color: COLORS.teal });
  const coverMeta = [
    ['Responsável', snapshot.responsible.name],
    ['Proposta', snapshot.code],
    ['Versão', versionLabel(snapshot.version)],
    ['Emissão', formatDateBR(snapshot.issueDate)],
    ['Validade', formatDateBR(snapshot.validUntil)],
  ];
  coverMeta.forEach(([label, value], index) => {
    const y = coverY - 33 - index * 36;
    cover.drawText(label.toUpperCase(), { x: 46, y, font: fonts.bold, size: 6.2, color: COLORS.cyan, characterSpacing: 1 });
    cover.drawText(sanitizePdfText(value), { x: 46, y: y - 13, font: fonts.regular, size: 9, color: COLORS.white });
  });
  cover.drawText('DOCUMENTO CONFIDENCIAL', { x: 46, y: 45, font: fonts.bold, size: 6.5, color: rgb(0.56, 0.7, 0.76), characterSpacing: 1.1 });
  if (draft) drawWatermark(cover, fonts);

  // 2. Visão executiva e escopo
  const executive = addInternalPage(pdf, snapshot, fonts, 'Visão executiva', draft);
  let y = drawTitle(executive, fonts, '01 · Contexto', 'Uma proposta construída sobre uma única fonte de verdade.', snapshot.context);
  const cardGap = 12;
  const cardWidth = (A4[0] - MARGIN * 2 - cardGap) / 2;
  const leftBottom = drawSectionCard(executive, fonts, MARGIN, y, cardWidth, 'Necessidade principal', snapshot.need, 'mint');
  const rightBottom = drawSectionCard(executive, fonts, MARGIN + cardWidth + cardGap, y, cardWidth, 'Critério de sucesso', snapshot.successCriteria, 'white');
  y = Math.min(leftBottom, rightBottom) - 26;
  executive.drawText('ESCOPO CONTRATADO', { x: MARGIN, y, font: fonts.bold, size: 7.2, color: COLORS.teal, characterSpacing: 1.1 });
  y -= 22;
  y = drawBulletList(executive, fonts, snapshot.scopeIncluded, MARGIN, y, 485);
  y -= 8;
  executive.drawText('RESPONSABILIDADES DO CLIENTE', { x: MARGIN, y, font: fonts.bold, size: 7.2, color: COLORS.teal, characterSpacing: 1.1 });
  y -= 22;
  drawBulletList(executive, fonts, snapshot.clientResponsibilities, MARGIN, y, 485);

  // 3. Condições comerciais
  const pricing = addInternalPage(pdf, snapshot, fonts, 'Condições comerciais', draft);
  y = drawTitle(pricing, fonts, '02 · Investimento', 'Condições comerciais por modalidade.', 'Valores, bases e periodicidades permanecem separados para evitar totais incompatíveis.');
  const lines = visibleCommercialLines(snapshot).filter((line) => line.active && line.amountMinor !== null);
  const pricingRows = lines.map((line) => [
    line.code,
    line.name,
    line.basis || line.billingUnit,
    line.periodicity || line.billingUnit,
    commercialValue(line),
  ]);
  y = drawTable(pricing, fonts, y, ['Código', 'Condição', 'Base', 'Periodicidade', 'Valor'], pricingRows, [48, 182, 112, 72, 92]) - 18;
  drawSectionCard(pricing, fonts, MARGIN, y, 507, 'Leitura obrigatória', 'Não existe total geral: percentuais, mínimos, seguros e tarifas unitárias têm bases e unidades distintas. Valores desta proposta de demonstração são fictícios.', 'amber');

  // 4. Operação e SLAs
  const operation = addInternalPage(pdf, snapshot, fonts, 'Modelo operacional e SLAs', draft);
  y = drawTitle(operation, fonts, '03 · Operação', 'Compromissos claros para cada modalidade.', 'O SLA contratual é separado do fluxo operacional e das exceções.');
  for (const modality of snapshot.modalities) {
    const bottom = drawSectionCard(operation, fonts, MARGIN, y, 507, modality, snapshot.sla[modality], modality === 'Crossdocking' ? 'mint' : 'white');
    y = bottom - 13;
  }
  y -= 8;
  operation.drawText('FORA DO ESCOPO', { x: MARGIN, y, font: fonts.bold, size: 7.2, color: COLORS.teal, characterSpacing: 1.1 });
  y -= 22;
  drawBulletList(operation, fonts, snapshot.outOfScope, MARGIN, y, 485);

  // 5. Crossdocking condicional
  if (snapshot.modalities.includes('Crossdocking')) {
    const crossdock = addInternalPage(pdf, snapshot, fonts, 'Crossdocking', draft);
    y = drawTitle(crossdock, fonts, '04 · Fluxo dedicado', 'Crossdocking sem descarga convencional.', 'Etapas mantidas em bloco próprio para não confundir recebimento B2B/B2C com troca de notas.');
    snapshot.crossdockingFlow.forEach((step, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = MARGIN + column * 257;
      const top = y - row * 84;
      crossdock.drawRectangle({ x, y: top - 67, width: 242, height: 67, color: index % 2 ? COLORS.white : COLORS.pale, borderColor: COLORS.line, borderWidth: 0.7 });
      crossdock.drawCircle({ x: x + 22, y: top - 22, size: 11, color: COLORS.teal });
      const number = String(index + 1).padStart(2, '0');
      crossdock.drawText(number, { x: x + 15.5, y: top - 25, font: fonts.bold, size: 7.5, color: COLORS.white });
      drawWrapped(crossdock, step, x + 42, top - 18, 185, fonts.bold, 8.5, COLORS.ink, 11.2);
    });
    y -= Math.ceil(snapshot.crossdockingFlow.length / 2) * 84 + 15;
    drawSectionCard(crossdock, fonts, MARGIN, y, 507, 'Exceção operacional', snapshot.crossdockingException, 'amber');
  }

  // 6. Materiais e serviços
  const items = addInternalPage(pdf, snapshot, fonts, 'Materiais e serviços', draft);
  y = drawTitle(items, fonts, '05 · Itens aplicáveis', 'Somente o que foi selecionado entra no documento.', 'Valor zero definido conscientemente aparece como Incluso. Itens vazios desaparecem.');
  const materialRows = snapshot.materials.filter((item) => item.included).map((item) => [
    item.code,
    item.name,
    item.unit,
    item.overrideCents !== null ? 'Valor personalizado' : 'Valor da versão',
    itemValue(item),
  ]);
  if (materialRows.length) {
    items.drawText('MATERIAIS E INSUMOS', { x: MARGIN, y, font: fonts.bold, size: 7.2, color: COLORS.teal, characterSpacing: 1.1 });
    y = drawTable(items, fonts, y - 14, ['Código', 'Item', 'Unidade', 'Origem', 'Valor'], materialRows, [48, 178, 84, 104, 92]) - 20;
  }
  const serviceRows = pdfServiceRows(snapshot).map((item) => [item.code, item.name, item.unit, itemValue(item)]);
  if (serviceRows.length) {
    items.drawText('SERVIÇOS', { x: MARGIN, y, font: fonts.bold, size: 7.2, color: COLORS.teal, characterSpacing: 1.1 });
    y = drawTable(items, fonts, y - 14, ['Código', 'Serviço', 'Unidade', 'Valor'], serviceRows, [58, 236, 114, 98]) - 20;
  }
  drawSectionCard(items, fonts, MARGIN, y, 507, 'Auditoria da versão', `Template ${snapshot.templateVersion}. Cada código, unidade, default, override, fonte e observação foi congelado na fotografia comercial desta versão.`, 'mint');

  // 7. Condições gerais e premissas
  const terms = addInternalPage(pdf, snapshot, fonts, 'Condições gerais', draft);
  y = drawTitle(terms, fonts, '06 · Termos', 'Premissas comerciais versionadas.', 'Textos legais e tributários permanecem sujeitos à homologação dos perfis autorizados.');
  const termCards: Array<[string, string, 'white' | 'mint' | 'amber']> = [
    ['Pagamento', snapshot.paymentTerms, 'white'],
    ['Reajuste', snapshot.adjustmentRule, 'white'],
    ['Impostos', snapshot.taxes, 'amber'],
    ['Validade', `Esta versão foi emitida em ${formatDateBR(snapshot.issueDate)} e é válida até ${formatDateBR(snapshot.validUntil)}.`, 'mint'],
  ];
  for (const [title, text, tone] of termCards) {
    y = drawSectionCard(terms, fonts, MARGIN, y, 507, title, text, tone) - 12;
  }
  terms.drawText('PREMISSAS', { x: MARGIN, y, font: fonts.bold, size: 7.2, color: COLORS.teal, characterSpacing: 1.1 });
  drawBulletList(terms, fonts, snapshot.assumptions, MARGIN, y - 22, 485);

  // 8. Institucional
  const institutional = addInternalPage(pdf, snapshot, fonts, 'Grupo Mercocamp', draft);
  y = drawTitle(institutional, fonts, '07 · Capacidade', 'Estrutura preparada para acompanhar a operação.', 'Indicadores institucionais com vigência e versão para impedir divergências históricas.');
  const facts = [
    [String(snapshot.institutionalFacts.years), 'anos de experiência'],
    [String(snapshot.institutionalFacts.distributionCenters), 'centros de distribuição'],
    [snapshot.institutionalFacts.squareMeters, 'de estrutura logística'],
    [snapshot.institutionalFacts.clients, 'atendidos'],
  ];
  facts.forEach(([value, label], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * 257;
    const top = y - row * 126;
    institutional.drawRectangle({ x, y: top - 106, width: 242, height: 106, color: index === 0 ? COLORS.navy : index === 3 ? COLORS.mint : COLORS.white, borderColor: index === 0 ? COLORS.navy : COLORS.line, borderWidth: 0.8 });
    institutional.drawText(sanitizePdfText(value), { x: x + 18, y: top - 44, font: fonts.bold, size: 25, color: index === 0 ? COLORS.white : COLORS.navy });
    institutional.drawText(label, { x: x + 18, y: top - 68, font: fonts.regular, size: 9, color: index === 0 ? rgb(0.72, 0.82, 0.86) : COLORS.muted });
  });
  y -= 270;
  drawSectionCard(institutional, fonts, MARGIN, y, 507, 'Vigência institucional', `${snapshot.institutionalVersion} · dados vigentes em ${formatDateBR(snapshot.institutionalFacts.effectiveDate)}. Atualizações futuras não alteram esta proposta congelada.`, 'mint');

  // 9. Aceite
  const acceptance = addInternalPage(pdf, snapshot, fonts, 'Aceite', draft);
  y = drawTitle(acceptance, fonts, '08 · Formalização', 'Aceite vinculado à mesma versão da capa.', 'Este bloco referencia uma única fonte de cliente, código, versão e validade.');
  const identityBottom = drawSectionCard(acceptance, fonts, MARGIN, y, 507, snapshot.client.legalName, `${snapshot.code} · ${versionLabel(snapshot.version)} · válida até ${formatDateBR(snapshot.validUntil)} · ${snapshot.title}`, 'navy');
  y = identityBottom - 28;
  drawWrapped(acceptance, 'Ao formalizar o aceite, as partes reconhecem que condições, escopo, SLAs, materiais, serviços e premissas correspondem exclusivamente à versão identificada nesta página.', MARGIN, y, 507, fonts.regular, 9.2, COLORS.muted, 14);
  y -= 98;
  const signatureWidth = 220;
  acceptance.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + signatureWidth, y }, thickness: 0.8, color: COLORS.muted });
  acceptance.drawText('GRUPO MERCOCAMP', { x: MARGIN, y: y - 18, font: fonts.bold, size: 7.5, color: COLORS.ink });
  acceptance.drawText('Nome, cargo, data e assinatura', { x: MARGIN, y: y - 32, font: fonts.regular, size: 7.2, color: COLORS.muted });
  const rightX = A4[0] - MARGIN - signatureWidth;
  acceptance.drawLine({ start: { x: rightX, y }, end: { x: rightX + signatureWidth, y }, thickness: 0.8, color: COLORS.muted });
  acceptance.drawText(sanitizePdfText(snapshot.client.legalName), { x: rightX, y: y - 18, font: fonts.bold, size: 7.5, color: COLORS.ink });
  acceptance.drawText('Nome, cargo, data e assinatura', { x: rightX, y: y - 32, font: fonts.regular, size: 7.2, color: COLORS.muted });
  y -= 100;
  drawSectionCard(acceptance, fonts, MARGIN, y, 507, 'Registro do artefato', 'O sistema registra contentHash para o snapshot e fileHash para o PDF canônico. Tentativas técnicas permanecem auditáveis sem substituir documentos anteriores.', 'mint');

  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    const footerText = `Confidencial · ${snapshot.code} · ${versionLabel(snapshot.version)} · ${index + 1} / ${pages.length}`;
    if (index > 0) {
      page.drawLine({ start: { x: MARGIN, y: 35 }, end: { x: A4[0] - MARGIN, y: 35 }, thickness: 0.6, color: COLORS.line });
    }
    page.drawText(footerText, {
      x: index === 0 ? 375 : MARGIN,
      y: 20,
      font: fonts.regular,
      size: 6.5,
      color: index === 0 ? COLORS.muted : COLORS.muted,
    });
  });

  return pdf.save({ useObjectStreams: false, addDefaultPage: false });
}
