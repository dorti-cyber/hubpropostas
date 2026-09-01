# Hub de Propostas Comerciais — Grupo Mercocamp

Protótipo funcional para estruturar propostas, precificar por modalidade, congelar versões, aprovar exceções e gerar PDFs consistentes. Todos os clientes, contatos e valores do ambiente inicial estão identificados como demonstração.

## Abrir localmente

1. Abra um terminal nesta pasta.
2. Use Node.js 22.13.0 ou superior e execute `npm ci`.
3. Execute `npm run dev`.
4. Acesse `http://localhost:3000`.

Não há senha de demonstração. No ambiente local, use o seletor **Perfil** no cabeçalho para conferir as permissões de Trader, Aprovador e Administrador.

## O que está incluído

- Dashboard de propostas com busca, filtros e dados fictícios.
- Formulário em 8 etapas com autosave, checklist e regras condicionais para B2C, B2B e Crossdocking.
- Título automático por modalidade e cliente, validade inicial de 30 dias e dados editáveis do vendedor.
- 14 condições comerciais completas, com regras de exclusividade por modalidade e seletores catalogados.
- 27 materiais e 23 serviços completos, pré-selecionados em novas propostas.
- Catálogo mestre importado da aba `Padrão Comercial`, preservando os seis campos originais.
- Defaults homologáveis apenas por Administrador e overrides por versão com motivo obrigatório.
- Versões congeladas, comparação V01/V02, hash de conteúdo e auditoria append-only.
- Aprovação segregada e configurável.
- Prévia com marca d’água e PDF final pelo mesmo renderizador.
- Banco D1 para dados estruturados e R2 para PDFs; ambos operam localmente no modo de desenvolvimento.
- Autenticação preparada para o ambiente Sites e perfis locais limitados a `localhost`.

## Regras sensíveis adotadas

- A base percentual de Crossdocking inicia como **Requer validação** em novas propostas e bloqueia o PDF final até homologação.
- Crossdocking puro não mostra recebimento/descarga convencional nem espera por doca.
- Valor vazio não entra no PDF; zero consciente aparece como **Incluso**.
- O código `700303` começa selecionado com R$ 35,00 como sugestão provisória e bloqueia a emissão até confirmação.
- Uma versão congelada nunca é sobrescrita. Qualquer alteração abre uma nova versão com vínculo e justificativa.
- Tributação, tolerâncias de aprovação, SLAs não homologados e textos jurídicos permanecem explícitos e configuráveis.

## Verificação

- `npm test` — 20 cenários automatizados de regras e versionamento.
- `npm run lint` — análise de qualidade do código.
- `npm run build` — compilação completa para Sites.
- `npm run db:generate` — gera a migração do banco a partir do esquema versionado.

## Fase 2 preparada, mas desligada

As configurações já reservam feature flags para Pipefy, contratos, assinatura e onboarding. Nenhuma integração externa, publicação ou envio de dados foi ativado.

## Colaboração

O fluxo recomendado é criar uma branch por alteração, executar as verificações locais e abrir um pull request. Consulte [CONTRIBUTING.md](CONTRIBUTING.md) para o passo a passo.
