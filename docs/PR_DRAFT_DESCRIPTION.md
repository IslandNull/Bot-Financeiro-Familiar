# PR draft description

Data: 2026-05-20

Base comparada: `main...codex/v55-bot-ux-refactor`

## 1. Titulo sugerido do PR

Draft: endurecer UX financeira V55 e limpar runtime historico

## 2. Resumo executivo

Este PR deve abrir como draft. Ele nao e um refatoramento completo e nao prova que a planilha real esta limpa.

O delta total da branch contra `main` e amplo: 22 arquivos alterados, 4121 insercoes e 2072 remocoes. O principal ponto de revisao e `apps-script/Code.js`, com 1356 insercoes e 1451 remocoes no comparativo amplo (reducao liquida de linhas).

A branch inclui melhorias reais de UX Telegram, perguntas financeiras deterministicas, validacoes de saldo/fonte, testes locais, documentacao de auditoria, a remocao completa de `migrateV55Parcelas()` e a limpeza de actions historicas do runtime Apps Script.

## 3. O que mudou

- `apps-script/Code.js`: mantem os fluxos vivos de Telegram, resumo familiar, perguntas seguras, agenda/revisao mensal, validacoes de saldo/fonte, faturas, saldos e fechamento; remove a migracao `migrateV55Parcelas()` e as actions historicas de reparo/setup do runtime, organizando as secoes em blocos funcionais (`INFRA`, `PARSER`, `DOMAIN`, `READ_ONLY`, `MUTATION`).
- `test/apps-script-runtime.test.js`: amplia bastante o harness local do runtime Apps Script e congela varios textos/fluxos operacionais.
- `test/domain.test.js`: adiciona testes locais para fevereiro bissexto, parcelamento atravessando ano, dado invalido vindo da planilha e valor negativo indevido.
- `test/seed.test.js`: garante que o seed canonico nao crie categorias ativas com visibilidade `resumo`.
- `src/seed.js`: migra visibilidades padrao de categorias ativas, usando `detalhada` para categorias familiares e `privada` para categorias pessoais.
- `SHEET_SCHEMA.md`: garante `parcelas` na definicao de `Lancamentos`.
- `DOMAIN_RULES.md`: redefine `resumo` como valor legado de visibilidade.
- `scripts/clasp-run.js`: altera parcialmente a mensagem de uso das actions remotas vivas.
- `docs/REFATORAMENTO_DIAGNOSTICO.md`: registra diagnostico tecnico inicial.
- `docs/PLANILHA_DIAGNOSTICO.md`: registra diagnostico da planilha com base em schema, snapshot e referencias no codigo.
- `docs/REFATORAMENTO_PLANO.md`: registra plano faseado de refatoramento seguro.
- `docs/LOTE_1_AUDITORIA_PRE_MERGE.md`: audita criticamente o lote final antes de PR/merge.
- `docs/CODE_CLEANUP_SUMMARY.md`: sumario de-para da limpeza das actions e wrappers.
- `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`: log consolidado listando as actions historicas e wrappers removidos do runtime.
- `docs/SPREADSHEET_SNAPSHOT.md`, `EXECUTION_PLAN.md`, `docs/CODE_MAP.md`, `docs/DECISIONS.md`, `README.md` e `PRODUCT_SPEC.md`: atualizam estado operacional, mapa, decisoes e documentacao.

## 4. O que NAO mudou

- Nao houve merge para `main`.
- Nao houve limpeza automatica da planilha real.
- Nao ha afirmacao de que a planilha real esta limpa.
- Nao ha prova de equivalencia plena entre runtime Apps Script em producao e testes locais.
- Nao ha modularizacao completa de `apps-script/Code.js`.
- Nao ha implementacao completa de orcamentos/envelopes por categoria.
- Actions historicas de reparo/setup e o wrapper `migrateV55Parcelas()` foram removidos do runtime; o registro de arquivamento ficou em `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`.
- Nao ha garantia automatizada de formulas, validacoes de dados ou celulas extras fora do snapshot.

## 5. Escopo real da branch

Escopo verificado por `git diff --stat main...codex/v55-bot-ux-refactor`:

- 22 arquivos alterados.
- 4121 insercoes.
- 2072 remocoes.
- `apps-script/Code.js`: 1356 insercoes e 1451 remocoes no numstat (reducao liquida de linhas).
- `test/apps-script-runtime.test.js`: 1330 insercoes e 489 remocoes no numstat.
- Novos documentos e logs de limpeza: `docs/LOTE_1_AUDITORIA_PRE_MERGE.md`, `docs/PLANILHA_DIAGNOSTICO.md`, `docs/REFATORAMENTO_DIAGNOSTICO.md`, `docs/REFATORAMENTO_PLANO.md`, `docs/CODE_CLEANUP_SUMMARY.md`, `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`.

Conclusao: o PR da branch inteira nao e apenas o lote de auditoria/refatoramento final. Ele inclui uma sequencia maior de commits de UX, comportamento operacional, testes, organizacao de codigo e posterior remocao de reparos historicos e migracoes jah aplicadas.

## 6. Por que o PR deve ser draft

- `apps-script/Code.js` foi reestruturado em secoes e teve o wrapper de migracao `migrateV55Parcelas()` removido, mas continua concentrando HTTP, parser, regras financeiras, formatacao Telegram e acesso a Sheets.
- As actions historicas de reparo/setup foram completamente limpas.
- Os testes locais sao relevantes, mas usam harness/fakes e nao provam equivalencia total com Google Apps Script, Google Sheets, Telegram e OpenAI reais.
- A documentacao nova e util como diagnostico, mas parte dela depende de snapshot e leitura humana, nao de auditoria automatica continua.
- O script `scripts/clasp-run.js` lista apenas as actions remotas vivas expostas por `doGet`.
- A branch altera regras de visibilidade de categorias e comportamento de resumo/perguntas, o que impacta privacidade e leitura financeira.

## 7. Arquivos de maior risco

- `apps-script/Code.js`: principal ponto de revisao. Contem a maior parte do comportamento operacional e das secoes estruturadas do bot.
- `test/apps-script-runtime.test.js`: cobertura importante, mas grande, textual e acoplada ao harness local.
- `src/seed.js`: altera visibilidade padrao de categorias, com impacto em privacidade e detalhamento de relatorios.
- `scripts/clasp-run.js`: usage acompanha as actions vivas aceitas por `doGet`.
- `docs/SPREADSHEET_SNAPSHOT.md`: evidencia redigida do estado real, nao contrato permanente.
- `docs/PLANILHA_DIAGNOSTICO.md`: diagnostico depende de snapshot e referencias em codigo; nao substitui auditoria de celulas/formulas.

## 8. Checklist antes de marcar como ready for review

- Revisar `apps-script/Code.js` por blocos: `doGet`, `doPost`, comandos Telegram, perguntas seguras, resumo, faturas, saldos e fechamento.
- Confirmar que as actions vivas de `doGet` exigem `WEBHOOK_SECRET` valido.
- Confirmar que a migracao `migrateV55Parcelas()` e as actions historicas de fato nao possuem mais impactos residuais (VERIFIED: schema validado e coluna `parcelas` ja presente na planilha real em producao).
- Revisar textos dos docs para separar evidencia verificada, inferencia e risco residual.
- Comparar regras de ciclo de fatura entre `src/card-cycle.js` e `assignPilotInvoiceCycle_`/helpers do Apps Script.
- Validar que a mudanca de `resumo` para `detalhada`/`privada` nas categorias preserva privacidade esperada.
- Rodar `npm run check` na branch atual.

## 9. Checklist antes de merge

- Concluir revisao tecnica do PR draft ou fatiar a branch em PRs menores.
- Manter as actions historicas e o wrapper `migrateV55Parcelas()` fora do runtime, salvo nova decisao explicita.
- Nao fazer limpeza de planilha real sem backup, dry-run e plano reversivel.
- Rodar `npm run check` com sucesso.
- Confirmar que o deploy versao **@126** (ou posterior de validacao) foi efetuado, rodando `npm run push`, `clasp deploy -i $DEPLOY_ID`, `npm run snapshot`, `npm run summary` e `npm run selftest`.
- Confirmar que nenhum segredo, ID privado, token, webhook ou dump financeiro foi commitado.
- Confirmar que a documentacao nao promete garantias que o codigo/testes ainda nao entregam.
- Confirmar que o estado de `EXECUTION_PLAN.md` esta atual no momento do merge.

## 10. Testes executados

VERIFIED no estado final da branch:

- `npm run check` (linter + suite completa de testes locais com 103 testes passando).
- `npm run push` + `clasp deploy -i $DEPLOY_ID` → Deploy versao **@126** efetuado com sucesso.
- `npm run snapshot` atualizou o snapshot redigido e retornou `ok: true` com a versao @126.
- `npm run summary` retornou o sumario financeiro com sucesso com a versao @126.
- `npm run selftest` retornou a estrutura de menu/comandos corretos no Apps Script em producao.

Observacao: estes comandos nao provam equivalencia plena entre Apps Script real e harness local. Eles tambem nao provam que a planilha esta limpa.

## 11. Riscos conhecidos

- Risco de regressao operacional em `apps-script/Code.js` por tamanho, acoplamento e volume de mudancas.
- Risco de falso positivo em testes locais por uso de harness/fakes.
- Risco residual de alguma manutencao futura precisar de script auditado ou da migracao manual de parcelas (atenuado: a coluna `parcelas` ja existe na planilha real).
- Risco de divergencia entre schema documentado, snapshot redigido e estado real futuro da planilha.
- Risco de docs serem lidos como garantia automatica, quando parte do conteudo e diagnostico manual.
- Risco de privacidade se alguma categoria pessoal ficar com visibilidade incorreta.
- Risco de calculo se `Faturas` misturar linhas previstas, linhas fechadas autoritativas e pagamentos sem convencao mais explicita.
- Risco de drift entre contratos locais em `src/` e comportamento real em `apps-script/Code.js`.

## 12. Perguntas abertas

- A branch deve ser revisada inteira em um PR draft ou fatiada antes de review formal?
- `migrateV55Parcelas()` foi removido com base na validacao de schema real (coluna ja existe); ha algum outro wrapper que precise de auditoria parecida?
- O projeto precisa de um auditor read-only de planilha antes de qualquer proxima limpeza?
- `Telegram_Send_Log` deve ser ativado no runtime real ou removido de escopo futuro?
- Qual convencao formal deve separar fatura prevista por parcela, fatura fechada autoritativa, fatura paga e linha cancelada por revisao?

## 13. Plano recomendado: revisar branch inteira ou fatiar PR

Recomendacao objetiva: abrir PR como draft, nao como pronto para revisao final.

Plano preferido: fatiar antes de merge, se o custo operacional for aceitavel.

Sugestao de fatias:

1. UX/read-only Telegram: comandos, textos, `/resumo`, `/agenda`, `/revisar_mes` e perguntas seguras.
2. Regras operacionais financeiras: faturas, saldos/fonte, validacao de caixa, exposicao de cartao e resumo.
3. Limpeza runtime: actions historicas e `migrateV55Parcelas()` removidas e arquivadas.
4. Schema/seed/docs/testes: `parcelas`, visibilidade, diagnosticos, plano e auditoria.

Se a branch nao for fatiada, o PR draft deve exigir revisao integral de `apps-script/Code.js` antes de ficar ready for review.

## Recomendacao final

A) pode abrir PR como draft.

Nao recomendo marcar como ready for review nem fazer merge sem nova revisao de `apps-script/Code.js` e do resumo em `docs/CODE_CLEANUP_SUMMARY.md`.
