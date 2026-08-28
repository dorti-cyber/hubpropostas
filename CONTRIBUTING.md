# Como contribuir

## Preparação

1. Use Node.js 22.13.0 ou superior.
2. Instale as dependências com `npm ci`.
3. Inicie o ambiente local com `npm run dev`.

## Fluxo de trabalho

1. Crie uma branch curta e descritiva a partir de `main`.
2. Faça alterações pequenas e focadas.
3. Não versione `.env`, `.wrangler`, builds ou dependências locais.
4. Antes de abrir um pull request, execute:

   ```text
   npm test
   npm run lint
   npm run build
   ```

5. Descreva no pull request o que mudou, como foi validado e eventuais impactos nas regras comerciais.

## Pontos de atenção

- Não altere snapshots congelados nem o histórico de versões.
- Preserve os códigos do catálogo e documente qualquer mudança de classificação.
- Mudanças no PDF devem ser revisadas separadamente das alterações de campos e regras.
- Não conecte integrações externas nem credenciais reais em branches de desenvolvimento.
