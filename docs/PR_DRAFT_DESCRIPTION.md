# PR draft description

Data: 2026-05-20

Base comparada: `main...codex/v55-bot-ux-refactor`

## 1. Titulo sugerido do PR

Draft: endurecer UX financeira V55 e limpar runtime historico

## 2. Resumo executivo

Este PR deve abrir como draft. Ele nao e um refatoramento completo e nao prova que a planilha real esta limpa.

O delta total da branch contra `main` e amplo: 18 arquivos alterados, 4373 insercoes e 359 remocoes. O principal ponto de revisao e `apps-script/Code.js`, com 1995 insercoes e 234 remocoes no comparativo amplo.

A branch inclui melhorias reais de UX Telegram, perguntas financeiras deterministicas, validacoes de saldo/fonte, testes locais, documentacao de auditoria e uma limpeza posterior que removeu actions historicas do runtime Apps Script.

## 3. O que mudou

- `apps-script/Code.js`: mantem os fluxos vivos de Telegram, resumo familiar, perguntas seguras, agenda/revisao mensal, validacoes de saldo/fonte, faturas, saldos e fechamento; remove actions historicas de reparo/setup do runtime.
- `test/apps-script-runtime.test.js`: amplia bastante o harness local do runtime Apps Script e congela varios textos/fluxos operacionais.
- `test/domain.test.js`: adiciona testes locais para fevereiro bissexto, parcelamento atravessando ano, dado invalido vindo da planilha e valor negativo indevido.
- `test/seed.test.js`: garante que o seed canonico nao crie categorias ativas com visibilidade `resumo`.
- `src/seed.js`: migra visibilidades padrao de categorias ativas, usando `detalhada` para categorias familiares e `privada` para categorias pessoais.
- `SHEET_SCHEMA.md`: adiciona `parcelas` em `Lancamentos`.
- `DOMAIN_RULES.md`: redefine `resumo` como valor legado de visibilidade.
- `scripts/clasp-run.js`: altera parcialmente a mensagem de uso das actions remotas.
- `docs/REFATORAMENTO_DIAGNOSTICO.md`: registra diagnostico tecnico inicial.
- `docs/PLANILHA_DIAGNOSTICO.md`: registra diagnostico da planilha com base em schema, snapshot e referencias no codigo.
- `docs/REFATORAMENTO_PLANO.md`: registra plano faseado de refatoramento seguro.
- `docs/LOTE_1_AUDITORIA_PRE_MERGE.md`: audita criticamente o lote final antes de PR/merge.
- `docs/SPREADSHEET_SNAPSHOT.md`, `EXECUTION_PLAN.md`, `docs/CODE_MAP.md`, `docs/DECISIONS.md`, `README.md` e `PRODUCT_SPEC.md`: atualizam estado operacional, mapa, decisoes e documentacao.

## 4. O que NAO mudou

- Nao houve merge para `main`.
- Nao houve limpeza automatica da planilha real.
- Nao ha afirmacao de que a planilha real esta limpa.
- Nao ha prova de equivalencia plena entre runtime Apps Script em producao e testes locais.
- Nao ha modularizacao completa de `apps-script/Code.js`.
- Nao ha implementacao completa de orcamentos/envelopes por categoria.
- Actions historicas de reparo/setup foram removidas do runtime; o registro ficou em `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`.
- Nao ha garantia automatizada de formulas, validacoes de dados ou celulas extras fora do snapshot.

## 5. Escopo real da branch

Escopo verificado por `git diff --stat main...codex/v55-bot-ux-refactor`:

- 18 arquivos alterados.
- 4373 insercoes.
- 359 remocoes.
- `apps-script/Code.js`: 2229 linhas de delta visual no stat, com 1995 insercoes e 234 remocoes no numstat.
- `test/apps-script-runtime.test.js`: 1544 linhas de delta visual no stat, com 1500 insercoes e 44 remocoes no numstat.
- Novos documentos: `docs/LOTE_1_AUDITORIA_PRE_MERGE.md`, `docs/PLANILHA_DIAGNOSTICO.md`, `docs/REFATORAMENTO_DIAGNOSTICO.md`, `docs/REFATORAMENTO_PLANO.md`.

Conclusao: o PR da branch inteira nao e apenas o lote de auditoria/refatoramento final. Ele inclui uma sequencia maior de commits de UX, comportamento operacional, testes e posterior remocao de reparos historicos do runtime.

## 6. Por que o PR deve ser draft

- `apps-script/Code.js` cresceu muito e continua concentrando HTTP, parser, regras financeiras, formatacao Telegram, acesso a Sheets e migracoes manuais remanescentes.
- As actions historicas de reparo/setup foram removidas do runtime nesta limpeza.
- Os testes locais sao relevantes, mas usam harness/fakes e nao provam equivalencia total com Google Apps Script, Google Sheets, Telegram e OpenAI reais.
- A documentacao nova e util como diagnostico, mas parte dela depende de snapshot e leitura humana, nao de auditoria automatica continua.
- O script `scripts/clasp-run.js` lista apenas as actions remotas vivas expostas por `doGet`.
- A branch altera regras de visibilidade de categorias e comportamento de resumo/perguntas, o que impacta privacidade e leitura financeira.

## 7. Arquivos de maior risco

- `apps-script/Code.js`: principal ponto de revisao. Contem a maior parte do comportamento operacional e das actions remotas.
- `test/apps-script-runtime.test.js`: cobertura importante, mas grande, textual e acoplada ao harness local.
- `src/seed.js`: altera visibilidade padrao de categorias, com impacto em privacidade e detalhamento de relatorios.
- `scripts/clasp-run.js`: usage acompanha as actions vivas aceitas por `doGet`.
- `docs/SPREADSHEET_SNAPSHOT.md`: evidencia redigida do estado real, nao contrato permanente.
- `docs/PLANILHA_DIAGNOSTICO.md`: diagnostico depende de snapshot e referencias em codigo; nao substitui auditoria de celulas/formulas.

## 8. Checklist antes de marcar como ready for review

- Revisar `apps-script/Code.js` por blocos: `doGet`, `doPost`, comandos Telegram, perguntas seguras, resumo, faturas, saldos e fechamento.
- Confirmar que as actions vivas de `doGet` exigem `WEBHOOK_SECRET` valido.
- Verificar se `migrateV55Parcelas()` deve continuar como wrapper global manual.
- Revisar textos dos docs para separar evidencia verificada, inferencia e risco residual.
- Comparar regras de ciclo de fatura entre `src/card-cycle.js` e `assignPilotInvoiceCycle_`/helpers do Apps Script.
- Validar que a mudanca de `resumo` para `detalhada`/`privada` nas categorias preserva privacidade esperada.
- Rodar `npm run check` na branch atual.

## 9. Checklist antes de merge

- Concluir revisao tecnica do PR draft ou fatiar a branch em PRs menores.
- Manter as actions historicas fora do runtime, salvo nova decisao explicita.
- Nao fazer limpeza de planilha real sem backup, dry-run e plano reversivel.
- Rodar `npm run check` com sucesso.
- Se houver novo deploy para validacao operacional, rodar `npm run push`, `clasp deploy -i $DEPLOY_ID`, `npm run snapshot`, `npm run summary` e `npm run selftest`.
- Confirmar que nenhum segredo, ID privado, token, webhook ou dump financeiro foi commitado.
- Confirmar que a documentacao nao promete garantias que o codigo/testes ainda nao entregam.
- Confirmar que o estado de `EXECUTION_PLAN.md` esta atual no momento do merge.

## 10. Testes executados

VERIFIED em `docs/LOTE_1_AUDITORIA_PRE_MERGE.md`:

- `npm run check` passou no lote auditado.
- `npm run summary` retornou `ok: true` apos deploy anterior.
- `npm run selftest` retornou `ok: true` apos deploy anterior.
- `npm run snapshot` retornou `ok: true` e atualizou snapshot redigido apos deploy anterior.

Observacao: estes comandos nao provam equivalencia plena entre Apps Script real e harness local. Eles tambem nao provam que a planilha esta limpa.

## 11. Riscos conhecidos

- Risco de regressao operacional em `apps-script/Code.js` por tamanho, acoplamento e volume de mudancas.
- Risco de falso positivo em testes locais por uso de harness/fakes.
- Risco residual de alguma manutencao futura precisar de script auditado em vez de action remota ja removida.
- Risco de divergencia entre schema documentado, snapshot redigido e estado real futuro da planilha.
- Risco de docs serem lidos como garantia automatica, quando parte do conteudo e diagnostico manual.
- Risco de privacidade se alguma categoria pessoal ficar com visibilidade incorreta.
- Risco de calculo se `Faturas` misturar linhas previstas, linhas fechadas autoritativas e pagamentos sem convencao mais explicita.
- Risco de drift entre contratos locais em `src/` e comportamento real em `apps-script/Code.js`.

## 12. Perguntas abertas

- A branch deve ser revisada inteira em um PR draft ou fatiada antes de review formal?
- `migrateV55Parcelas()` deve ser mantido como wrapper global manual, movido para action auditada ou removido apos decisao humana?
- O projeto precisa de um auditor read-only de planilha antes de qualquer proxima limpeza?
- `Telegram_Send_Log` deve ser ativado no runtime real ou removido de escopo futuro?
- Qual convencao formal deve separar fatura prevista por parcela, fatura fechada autoritativa, fatura paga e linha cancelada por revisao?

## 13. Plano recomendado: revisar branch inteira ou fatiar PR

Recomendacao objetiva: abrir PR como draft, nao como pronto para revisao final.

Plano preferido: fatiar antes de merge, se o custo operacional for aceitavel.

Sugestao de fatias:

1. UX/read-only Telegram: comandos, textos, `/resumo`, `/agenda`, `/revisar_mes` e perguntas seguras.
2. Regras operacionais financeiras: faturas, saldos/fonte, validacao de caixa, exposicao de cartao e resumo.
3. Limpeza runtime: actions historicas removidas e decisao separada sobre `migrateV55Parcelas()`.
4. Schema/seed/docs/testes: `parcelas`, visibilidade, diagnosticos, plano e auditoria.

Se a branch nao for fatiada, o PR draft deve exigir revisao integral de `apps-script/Code.js` antes de ficar ready for review.

## Recomendacao final

A) pode abrir PR como draft.

Nao recomendo marcar como ready for review nem fazer merge sem nova revisao de `apps-script/Code.js` e do resumo em `docs/CODE_CLEANUP_SUMMARY.md`.
