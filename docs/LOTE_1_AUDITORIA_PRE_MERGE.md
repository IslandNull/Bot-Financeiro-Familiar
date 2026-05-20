# Auditoria pre-merge do lote 1

Data: 2026-05-20

Escopo verificado:

- Comparativo amplo pedido: `git diff main...codex/v55-bot-ux-refactor`
- Comparativo isolado do lote 1: `git diff HEAD~1..HEAD`
- Validacao local: `npm run check`
- Busca de chamadas remanescentes para funcoes removidas: `rg` no repo, excluindo `private/`

## Achados principais

### P1 - O delta contra `main` nao representa somente o lote 1

`main...codex/v55-bot-ux-refactor` mostra 17 arquivos alterados e `apps-script/Code.js` com `1995` insercoes e `234` remocoes. Isso e acumulado da branch inteira, nao do lote 1.

O lote 1 isolado (`HEAD~1..HEAD`) mudou 6 arquivos:

- `apps-script/Code.js`: `0` insercoes, `48` remocoes.
- `docs/PLANILHA_DIAGNOSTICO.md`: novo.
- `docs/REFATORAMENTO_DIAGNOSTICO.md`: novo.
- `docs/REFATORAMENTO_PLANO.md`: novo.
- `docs/SPREADSHEET_SNAPSHOT.md`: timestamp e numeros redigidos atualizados.
- `test/domain.test.js`: `36` insercoes.

Conclusao: qualquer avaliacao de "aumento grande em Code.js" precisa ser atribuida aos commits anteriores da branch, nao ao lote 1. O lote 1 reduziu `Code.js`.

### P1 - Branch inteira precisa revisao antes de merge pronto

Contra `main`, `Code.js` cresceu muito e adicionou comandos, safe questions, reparos operacionais, resumo novo, validacao de saldo, fluxo de fonte/cartao, drill-downs, actions de reparo e migracao de visibilidade. Isso pode estar testado localmente, mas e alteracao operacional ampla em sistema financeiro real.

Conclusao: seguro para PR draft, nao seguro para merge direto.

### P2 - O lote 1 criou documentacao util, mas parte e diagnostico manual

Os docs novos sao bons como inventario e plano, mas algumas afirmacoes sao inferencias de auditoria, nao garantias automatizadas. Exemplos:

- "todas as colunas sao usadas" e verdadeiro como `HEADERS`, mas nem todas tem uso financeiro semantico forte.
- "nao ha abas extras" depende do snapshot redigido, nao de auditoria independente de celulas/formulas.
- "funcoes privadas com zero referencias" e busca estatica; nao prova ausencia absoluta de uso via editor Apps Script se fossem globais. Neste caso elas eram privadas dentro de `V55`, reduzindo o risco.

### P2 - Testes novos sao reais, mas parciais

Os testes novos em `test/domain.test.js` chamam funcoes reais (`assignInvoiceCycle`, `assignInstallmentCycles`, `validateParsedEvent`). Nao sao mocks. Ainda assim, eles testam contratos locais, nao o runtime Apps Script diretamente.

Risco: se `apps-script/Code.js` divergir de `src/card-cycle.js`, esses testes nao pegam a divergencia. Ja existe cobertura runtime grande, mas o lote 1 adicionou cobertura local, nao cross-check local/runtime.

## Respostas objetivas

### 1. Quais mudancas foram realmente feitas em `apps-script/Code.js`?

No lote 1 isolado:

- Remocao de `sumPilotInvoiceExposure_`.
- Remocao de `friendlyDestination_`.
- Remocao de `isPilotMarketText_`.
- Remocao de `isPilotPharmacyCardText_`.
- Remocao de `friendlyEventType_`.

Nao houve insercao em `Code.js` no lote 1.

No comparativo contra `main`, ha muitas alteracoes anteriores ao lote 1: novos comandos read-only, novas actions repair/record/migrate, novo resumo, validacao de saldo/fonte, tratamento de faturas atuais e drill-downs.

### 2. Por que `Code.js` teve aumento grande de linhas?

Porque `main...branch` inclui commits anteriores ao lote 1:

- `style(v55): unify telegram message layout`
- `feat(v55): add decision finance ux commands`
- `fix(v55): confirm current invoices and simplify summary`
- `fix(v55): repair may cash account launches`
- `feat(v55): add category drilldowns and restore financing debts`
- `Hardens house obligation and balance checks`

Esses commits adicionaram a maior parte das `1995` linhas em `Code.js`.

### 3. Esse aumento e justificavel?

Parcialmente. O aumento entrega funcionalidades reais e cobertas por testes, mas concentra ainda mais responsabilidade em `Code.js`, que ja era o arquivo mais critico. Como engenharia, o aumento e funcionalmente explicavel; como arquitetura, precisa revisao antes de merge pronto.

Classificacao: precisa revisao.

### 4. Alguma logica financeira foi alterada direta ou indiretamente?

No lote 1 isolado: nao encontrei alteracao direta de logica financeira. Foram removidas funcoes sem chamadas e adicionados testes.

Na branch contra `main`: sim. O resumo de faturas, pagamentos efetivos, visibilidade, saldo/fonte, fatura fechada como autoridade e obrigacoes de casa alteram comportamento operacional. Reparos historicos de maio foram removidos do runtime no lote de limpeza posterior.

### 5. Alguma funcao nova duplica responsabilidade ja existente?

No lote 1: nao, nenhuma funcao nova.

Na branch contra `main`: sim, ha ampliacao de duplicidade ja existente:

- ciclo/calculo de fatura em `src/card-cycle.js` e `Code.js`;
- resumo financeiro em `src/domain.js`/`src/reporting` e `Code.js`;
- schema em `src/schema.js` e `Code.js`;
- validacao/canonicalizacao de evento em `src/validator.js` e `Code.js`.

### 6. Alguma funcao removida poderia estar sendo chamada indiretamente?

Risco baixo.

Evidencia:

- `rg` encontrou os nomes removidos apenas em docs do plano, nao em codigo.
- As funcoes removidas eram privadas dentro do IIFE `V55`, nao wrappers globais Apps Script.
- Nenhuma era exposta em `return { ... }`.
- Nenhuma action `doGet` usava esses nomes.

Risco residual:

- Se algum trecho usasse `eval` interno com nomes privados, a busca deveria encontrar as strings; nao encontrou.
- Menus/triggers/botoes de Apps Script so chamam funcoes globais, e essas nao foram removidas.

### 7. Os testes novos testam comportamento real ou mockam demais?

Testam comportamento real local. Eles chamam diretamente funcoes reais exportadas por `src/index.js`.

Nao mockam rede, planilha ou Apps Script. Para esses casos, isso e correto porque os cenarios sao puros: ciclo de cartao e validacao de contrato.

### 8. Os testes novos poderiam estar acoplados a implementacao atual?

Sim, parcialmente.

- O teste de parcelamento atravessando ano fixa competencias e vencimentos especificos. Isso e bom para regressao, mas acopla ao algoritmo atual de ciclo.
- O teste de dado invalido vindo da planilha usa `id_categoria: 42`; valida contrato local, mas nao simula uma linha real lida via `readRowsAsObjects_`.

### 9. Existe risco de falso positivo nos testes?

Sim.

- `test/domain.test.js` pode passar mesmo se a versao Apps Script do ciclo divergir.
- Muitos testes de `test/apps-script-runtime.test.js` no delta amplo usam fake harness e strings de resposta. Eles pegam regressao de texto/fluxo, mas podem nao provar comportamento real de Google Sheets.
- `npm run check` nao chama Telegram real, OpenAI real, nem planilha real para mutacao.

### 10. O deploy `@124` alterou comportamento operacional?

No lote 1 esperado: nao deveria alterar comportamento observado, pois so removeu funcoes privadas sem chamadas.

Fato operacional: `@124` publicou novo `Code.js`, entao o web app passou a rodar uma versao nova. Se a busca estatica estiver correta, o comportamento operacional fica igual ao `@123` para usuarios.

Validado depois do deploy no lote anterior:

- `npm run summary` retornou `ok: true`.
- `npm run selftest` retornou `ok: true`.
- `npm run snapshot` retornou `ok: true` e atualizou o snapshot redigido.

### 11. Alguma action historica ficou no runtime?

Nao neste lote de limpeza. As actions historicas de reparo/setup foram removidas de `doGet`, exports, wrappers globais e testes acoplados. O registro resumido esta em `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`.

### 12. Alguma documentacao criada afirma algo que o codigo ainda nao garante?

Sim, em nivel de rigor:

- `docs/PLANILHA_DIAGNOSTICO.md` diz que nao ha abas extras com base no snapshot. Isso e verdadeiro para o snapshot, mas nao e uma garantia continua.
- `docs/REFATORAMENTO_DIAGNOSTICO.md` lista cobertura de testes como "coberto/parcial/ausente"; parte dessa classificacao e interpretacao humana.
- `docs/REFATORAMENTO_PLANO.md` marca alguns itens como concluido no lote local, mas isso nao significa cobertura runtime completa.

Nada disso bloqueia PR draft, mas precisa ser lido como relatorio de auditoria, nao como especificacao executavel.

### 13. A planilha real foi modificada ou apenas inspecionada?

Pela evidencia dos comandos do lote:

- `npm run snapshot`: leitura da planilha e escrita local em `docs/SPREADSHEET_SNAPSHOT.md`.
- `npm run summary`: leitura.
- `npm run selftest`: comando `/help`, sem mutacao financeira.
- `npm run push` e `clasp deploy`: alteraram Apps Script/deploy, nao linhas da planilha.

Nao ha evidencia de limpeza ou mutacao direta da planilha real no lote 1.

Observacao: o snapshot mudou porque o estado real da planilha ja tinha mudado antes ou fora do lote, com `Saldos_Fontes` de 2 para 3 e reserva/saldos atualizados.

### 14. Ha risco de divergencia entre schema documentado e schema real?

Sim, mas o snapshot atual reduz o risco:

- Snapshot redigido informa 13 abas e headers `YES`.
- `SHEET_SCHEMA.md` inclui `parcelas` em `Lancamentos`.
- `Code.js` e `src/schema.js` tambem incluem `parcelas`.

Risco residual:

- Enums reais como `cancelado_revisao` aparecem em dados, mas enums locais ainda documentam `cancelado`.
- Snapshot nao audita formulas, celulas extras fora do range esperado, validacao de dados ou referencias quebradas.

### 15. O lote esta seguro para abrir PR?

Sim, como PR draft ou PR explicitamente marcado para revisao critica.

O lote 1 isolado e pequeno em codigo, tem relatorios uteis, passou `npm run check`, e nao removeu wrappers globais nem actions.

### 16. O lote esta seguro para merge?

Nao como merge direto.

Motivo: o PR contra `main` inclui a branch inteira, com mudancas operacionais grandes em `Code.js` e `test/apps-script-runtime.test.js`, nao apenas o lote 1. Precisa revisao humana/tecnica dos commits anteriores ou PR fatiado.

### 17. O que precisa ser corrigido antes do merge?

Obrigatorio antes de merge pronto:

1. Separar escopo do PR: lote 1 isolado ou branch inteira.
2. Se for branch inteira, revisar explicitamente que as actions historicas seguem fora do runtime.
3. Atualizar `scripts/clasp-run.js` usage para listar todas as actions remotas atuais ou deixar claro que e lista parcial.
4. Criar auditor read-only para planilha antes de qualquer limpeza real.
5. Adicionar check local/runtime para ciclo de fatura, evitando divergencia entre `src/card-cycle.js` e `assignPilotInvoiceCycle_`.
6. Revisar docs novos para trocar "VERIFIED" por "VERIFIED no snapshot" quando a garantia depender de snapshot.
7. Decidir se `migrateV55Parcelas()` fica, e se ficar, documentar como funcao manual perigosa.

## Classificacao por arquivo alterado em `main...branch`

| Arquivo | Classificacao | Motivo |
| --- | --- | --- |
| `DOMAIN_RULES.md` | seguro | Alinha `resumo` como legado; coerente com testes de seed e migracao. |
| `EXECUTION_PLAN.md` | precisa revisao | Registra muitos estados operacionais; pode estar defasado porque Current State ainda diz 2026-05-19 e nao menciona @124. |
| `PRODUCT_SPEC.md` | seguro | Documenta comandos deterministicos e limites de budget ainda nao ativo. |
| `README.md` | seguro | Atualiza escopo e comandos; nao altera comportamento. |
| `SHEET_SCHEMA.md` | seguro | Adiciona `parcelas`, coerente com `Code.js`, `src/schema.js` e snapshot. |
| `apps-script/Code.js` | precisa revisao | Lote 1 removeu codigo morto, mas branch inteira adiciona muita logica operacional e actions de reparo. |
| `docs/CODE_MAP.md` | precisa revisao | Atualiza mapa, mas usage/scripts nao listam todas as actions novas. |
| `docs/DECISIONS.md` | seguro | Registra decisao de UX/visibilidade; coerente com branch. |
| `docs/PLANILHA_DIAGNOSTICO.md` | precisa revisao | Util como diagnostico, mas algumas garantias dependem do snapshot, nao de auditoria automatica. |
| `docs/REFATORAMENTO_DIAGNOSTICO.md` | precisa revisao | Bom inventario; mistura evidencias e inferencias, precisa linguagem mais precisa antes de merge pronto. |
| `docs/REFATORAMENTO_PLANO.md` | precisa revisao | Plano util; itens "CONCLUIDO" sao locais/parciais, nao cobertura runtime completa. |
| `docs/SPREADSHEET_SNAPSHOT.md` | seguro | Snapshot redigido gerado por comando; nao contem IDs privados. |
| `scripts/clasp-run.js` | precisa revisao | Usage adiciona uma action, mas nao acompanha todas as actions remotas disponiveis. |
| `src/seed.js` | precisa revisao | Mudancas de visibilidade podem afetar privacidade/relatorios; parecem intencionais, mas sao regra de dominio. |
| `test/apps-script-runtime.test.js` | precisa revisao | Boa cobertura, mas muito grande, textual e acoplada ao harness fake. |
| `test/domain.test.js` | seguro | Testes novos sao puros e de comportamento real local. |
| `test/seed.test.js` | seguro | Cobre ausencia de active `resumo`; coerente com regra nova. |

## Recomendacao final

A) pode abrir PR como draft.

Nao recomendo PR pronto para revisao final nem merge direto enquanto a branch inteira estiver agrupada. O lote 1 isolado e aceitavel como auditoria inicial, mas o delta contra `main` contem mudancas operacionais grandes que precisam revisao propria.
