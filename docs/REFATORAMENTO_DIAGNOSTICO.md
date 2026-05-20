# Diagnostico tecnico de refatoramento

Data: 2026-05-20

## Estado inicial verificado

- Branch: `codex/v55-bot-ux-refactor`.
- Working tree inicial: limpo.
- Comandos obrigatorios executados: `git status`, `git branch --show-current`, `Get-ChildItem -Force`.
- Arquivos de autoridade lidos: `EXECUTION_PLAN.md`, `docs/CODE_MAP.md`, `docs/FORMULA_STANDARD.md`, `DOMAIN_RULES.md`, `SHEET_SCHEMA.md`.
- Validacao inicial: `npm run check` passou antes de qualquer edicao.
- Snapshot atualizado: `npm run snapshot` gerou `docs/SPREADSHEET_SNAPSHOT.md` em 2026-05-20T10:12:17Z.

## 1. Mapa da arquitetura atual

VERIFIED:

```text
Telegram -> Val Town proxy -> Apps Script doPost -> OpenAI parser -> Google Sheets
                                      |
                                      +-> deterministic read-only commands
                                      +-> operational doGet actions
                                      +-> local contract mirror in src/
```

- `val-town/telegram-proxy.ts`: recebe webhook Telegram, responde HTTP 200, encaminha para Apps Script e devolve `sendMessage` quando seguro.
- `apps-script/Code.js`: runtime de producao com 6.251 linhas. Concentra HTTP, autorizacao, parser OpenAI, canonicalizacao, validacao, calculos de resumo, reparos, setup, escrita em Sheets e export de snapshot.
- `src/*.js`: contratos locais puros, testados em Node.js.
- `test/*.js`: testes locais deterministas; nao chamam Google Sheets, Telegram, OpenAI ou rede.
- `scripts/*.js`: execucao remota via web app e validacao/escrita historica.
- `apps-script/appsscript.json`: manifesto V8, timezone `America/Sao_Paulo`, web app anonimo executando como usuario que fez deploy.

## 2. Principais fluxos do sistema

- Telegram read-only: `/help`, `/resumo`, `/agenda`, `/revisar_mes`, perguntas seguras deterministicamente respondidas.
- Telegram mutacao: texto natural -> OpenAI Responses API -> `normalizeParsedEvent_` -> canonicalizacao -> validacao por tipo -> idempotencia -> append/update em Sheets.
- Lancamento historico revisado: JSONL local -> `scripts/historical-validate.js` -> POST `historical_import_reviewed` -> validacao completa antes de escrita.
- Fechamento mensal: `closing_draft` grava draft em `Fechamento_Familiar`; `closing_close` fecha apenas draft revisado e bloqueia mes atual/futuro.
- Snapshot: `exportSnapshotV55()` le a planilha e gera evidencia redigida em Markdown.
- Reparos historicos: removidos do `doGet` neste lote; ver `docs/archive/HISTORICAL_REPAIR_ACTIONS.md`.

## 3. Pontos de entrada

- Apps Script globais: `doGet(e)`, `doPost(e)`, `runHelpSmokeSelfTest()`, `runTelegramWebhookSetupApply()`, `runTelegramWebhookSetupDryRun()`, `runWebhookSecretNegativeSelfTest()`, `exportSnapshotV55()`, `exportPilotFamilySummaryV55()`, `writeDraftFamilyClosingV55()`, `migrateV55Parcelas()`.
- Node scripts: `npm run check`, `npm run snapshot`, `npm run summary`, `npm run selftest`, `npm run historical:validate`, `npm run historical:write`, `npm run push`.
- Val Town: default exported async function in `val-town/telegram-proxy.ts`.

## 4. Dependencias externas

- Google Apps Script: `SpreadsheetApp`, `PropertiesService`, `LockService`, `UrlFetchApp`, `ContentService`, `Utilities`, `Logger`.
- Google Sheets: 13 abas V55.
- Telegram Bot API: webhook e resposta `sendMessage`.
- OpenAI Responses API: parser de texto natural, atualmente modelo default `gpt-5-nano`.
- Val Town/Deno runtime: proxy HTTP.
- `clasp`: deploy/push Apps Script.
- Node.js built-ins: `fs`, `path`, `https`, `http`, `crypto`, `assert`.

## 5. Arquivos criticos

- `apps-script/Code.js`: maior risco operacional; qualquer mudanca pode afetar planilha real.
- `src/domain.js`: regras de DRE, caixa, patrimonio, faturas, obrigacoes, reserva e destino sugerido.
- `src/card-cycle.js`: ciclo de fatura, fechamento, vencimento, meses curtos e parcelamentos.
- `src/validator.js`: contrato de evento parseado.
- `src/event-planner.js`: mapeia evento para linhas de planilha.
- `src/write-adapter.js` e `src/idempotency.js`: atomicidade local e duplicidade.
- `src/schema.js` e `SHEET_SCHEMA.md`: autoridade estrutural.
- `docs/SPREADSHEET_SNAPSHOT.md`: evidencia redigida da planilha real.
- `scripts/historical-write.js`: caminho de escrita remota de historico.

## 6. Codigo morto ou aparentemente nao usado

VERIFIED por busca estatica em `apps-script/Code.js`:

- `isPilotMarketText_` e `isPilotPharmacyCardText_`: aparecem apenas na propria definicao. Parecem sobras de piloto antigo.
- `sumPilotInvoiceExposure_`: aparece apenas na propria definicao. Ha calculos ativos em `summarizePilotInvoiceExposure_`.
- `friendlyDestination_` e `friendlyEventType_`: aparecem apenas na propria definicao.
- `migrateV55Parcelas()`: wrapper global chama `V55.migrateV55Parcelas_()`, mas nao aparece no `doGet`, em scripts npm, docs operacionais atuais ou testes como action normal. E uma migracao manual de schema que insere coluna em `Lancamentos`; precisa de decisao humana antes de remocao por ser destrutiva se invocada em ambiente real.

UNVERIFIED:

- Nao foi provado que funcoes globais manuais de Apps Script nao sejam usadas pelo proprietario no editor Apps Script.

## 7. Codigo duplicado

- `SHEETS` e `HEADERS` existem em `src/schema.js` e duplicados manualmente em `apps-script/Code.js`.
- Ciclo de fatura existe em `src/card-cycle.js` e em `assignPilotInvoiceCycle_`/`invoiceCycleForCompetencia_` no Apps Script.
- `stableId`/`stableId_`, `rowFor`/`appendRow_`, normalizacao de dinheiro/data e planejamento de linhas existem em versoes locais e runtime.
- Parser prompt local (`src/parser-contract.js`) e prompt runtime (`buildParserPrompt_`) nao sao equivalentes; o runtime tem regras operacionais adicionais.
- Testes de Apps Script incluem um harness grande em `test/apps-script-runtime.test.js`, com muita fixture inline.

## 8. Funcoes grandes ou responsabilidades misturadas

- `apps-script/Code.js` mistura infraestrutura, regras financeiras, UX Telegram, parser, planilha e reparos. Esta e a principal causa raiz estrutural.
- `handleTelegramUpdate_` decide comandos, gates, parser, validacao e roteamento de mutacao.
- `buildParserPrompt_` mistura contrato de parser, exemplos canonicos, defaults e dados runtime.
- `computePilotFamilySummary_` e formatadores proximos misturam calculo financeiro e apresentacao.
- `recordPilot*` repetem padrao de idempotencia, lock, append, erro e resposta.

## 9. Regras financeiras espalhadas

- `DOMAIN_RULES.md`: regra conceitual.
- `src/domain.js`: calculo local de DRE, caixa, patrimonio, reserva, destino.
- `src/validator.js`: regras por tipo.
- `src/card-cycle.js`: ciclo de fatura.
- `src/event-planner.js`: linhas planejadas.
- `apps-script/Code.js`: regras runtime, canonicalizacao, overrides deterministicos, validacao de fonte, fatura e periodo fechado.
- `test/apps-script-runtime.test.js`: muitos comportamentos financeiros estao congelados em testes, mas como fixtures grandes.

## 10. Riscos de calculo incorreto

- `Faturas` guarda muitas linhas por parcela/exposicao, e tambem linhas `fechada` com `valor_previsto=0`; o resumo precisa evitar dupla contagem.
- Pagamento de fatura depende de reconciliacao entre linhas de fatura e lancamentos de pagamento.
- `margem_pos_obrigacoes` mudou materialmente apos snapshot: reserva e saldos atualizados alteraram destino sugerido para `reforcar_reserva`.
- Mes curto e ano bissexto dependem de `buildClampedUtcDate_`/`assignInvoiceCycle`; qualquer divergencia entre local e runtime e critica.
- `status` de lancamentos e faturas e usado como filtro; valores como `cancelado_revisao` aparecem no snapshot mas nao estao no enum local canonico.
- `Dividas` mistura saldo devedor patrimonial e obrigacao mensal; falta de juros/sistema bloqueia amortizacao, mas o risco de leitura errada permanece.

## 11. Riscos de alucinacao ou interpretacao errada por LLM

- LLM so deveria classificar/estruturar evento, mas o prompt contem exemplos financeiros detalhados e defaults runtime; se a categoria ficar ambigua, o runtime precisa bloquear.
- Riscos ja mitigados: JSON estrito, campos permitidos, ids canonicos, bloqueio de dinheiro ambiguo no historico, payable invoice allowlist, overrides deterministicos.
- Riscos restantes: categorias similares, fonte vs cartao, "pela Conta" vs "no cartao", transferencia de terceiros para obrigacao da casa, beneficio convertido sem DRE.

## 12. Partes frageis da integracao com planilha

- `verifySheetHeaders_` exige ordem exata de colunas. Bom para seguranca, fragil para edicoes manuais.
- `readRowsAsObjects_` normaliza booleanos em portugues e ingles, mas nao valida todos os enums ao ler planilha.
- `appendRow_` usa append simples; updates pontuais usam `getRange().setValue()` por coluna.
- Snapshot e relatorios dependem de agregacoes redigidas; nao ha export de diagnostico de colunas extras fora do prefixo esperado alem de `MISMATCH`.
- Actions de reparo continuam disponiveis no runtime e podem tocar dados reais.

## 13. Testes ausentes

Mapeamento contra a lista critica do pedido:

- Coberto: compra antes/no/depois do fechamento; mes curto; vencimento em mes curto; parcelamento atravessando ano; categoria invalida; duplicidade; arredondamento; Gustavo vs Luana; periodo fechado via ajuste.
- Parcial: receita recorrente, despesa recorrente, dados faltantes da planilha, valores negativos indevidos.
- Ausente ou fraco: protecao contra alteracao indevida de historico fora de fechamento; validacao de colunas extras/abas extras na planilha real; teste de fevereiro bissexto explicitamente nomeado; simulacoes de recorrencia operacional no Apps Script.

## 14. Testes quebrados

VERIFIED: nenhum teste local quebrado no inicio. `npm run check` passou.

## 15. Divida tecnica prioritaria

1. Separar reparos/migracoes operacionais do runtime principal ou isola-los atras de action explicitamente auditada.
2. Remover funcoes privadas comprovadamente sem uso.
3. Centralizar schema e ciclo de fatura para reduzir divergencia entre `src/` e `Code.js`.
4. Criar diagnostico de planilha que detecte abas extras, colunas extras e enums fora do contrato.
5. Extrair calculo financeiro runtime para modulos locais testaveis antes de mexer em resultado.
6. Reduzir fixtures gigantes de `test/apps-script-runtime.test.js` com builders claros, sem perder cobertura.
7. Revisar encoding dos textos do Apps Script: a saida lida no terminal aparece mojibake; pode ser problema de console, mas precisa verificacao no arquivo/deploy antes de qualquer alteracao de UX.

## Execucao controlada iniciada

VERIFIED neste lote:

- Removidas de `apps-script/Code.js` apenas funcoes privadas com zero referencias restantes apos busca estatica: `isPilotMarketText_`, `isPilotPharmacyCardText_`, `sumPilotInvoiceExposure_`, `friendlyDestination_`, `friendlyEventType_`.
- Mantido `migrateV55Parcelas()` por seguranca: e um wrapper global manual que altera schema e precisa de decisao humana.
- Adicionados testes explicitos em `test/domain.test.js` para fevereiro bissexto, parcelamento atravessando ano, dado de planilha com tipo invalido e valor negativo.
