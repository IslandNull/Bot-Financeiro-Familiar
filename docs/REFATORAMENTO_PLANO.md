# Plano de refatoramento seguro

Data: 2026-05-20

Objetivo: reduzir complexidade e fragilidade sem alterar silenciosamente resultado financeiro, historico, faturas, saldos, patrimonio ou fechamento.

Regra central: toda mudanca de comportamento financeiro exige teste antes/depois. Mudancas destrutivas em planilha real exigem confirmacao humana e plano reversivel.

## Fase 1. Seguranca e testes

- Objetivo: preservar uma linha de base confiavel.
- Arquivos afetados: `test/*.js`, possivel novo script de auditoria read-only.
- Risco: baixo.
- Como testar: `npm run check`; para remoto, `npm run snapshot`, `npm run summary`, `npm run selftest`.
- Criterio de aceite: comandos passam ou falhas sao documentadas com causa.
- Rollback: reverter commits de testes/scripts; nenhuma planilha real modificada.

Tarefas:

- Registrar baseline de comandos e snapshot.
- Adicionar testes minimos faltantes para fevereiro bissexto, valores negativos, dados faltantes da planilha, recorrencias e protecao de historico.
- Criar um auditor read-only de planilha antes de qualquer limpeza real.

## Fase 2. Remocao de codigo morto comprovado

- Objetivo: remover sobras que nao participam de nenhum fluxo.
- Arquivos afetados: `apps-script/Code.js`, `test/apps-script-runtime.test.js` se algum teste mencionar string antiga.
- Risco: baixo para funcoes privadas sem chamadas; medio para wrappers globais.
- Como testar: `npm run check`.
- Criterio de aceite: comportamento coberto continua verde; diff contem apenas remocao sem efeito.
- Rollback: `git revert` do commit.

Candidatos:

- CONCLUIDO neste lote: remover apenas funcoes privadas com chamada estatica zero alem da definicao: `isPilotMarketText_`, `isPilotPharmacyCardText_`, `sumPilotInvoiceExposure_`, `friendlyDestination_`, `friendlyEventType_`.
- Nao remover `migrateV55Parcelas()` sem decisao humana, porque e wrapper global de Apps Script e altera schema se invocado.

## Fase 3. Consolidacao de regras financeiras

- Objetivo: reduzir divergencia entre `src/` e Apps Script.
- Arquivos afetados: `src/domain.js`, `src/card-cycle.js`, `apps-script/Code.js`, testes locais.
- Risco: alto.
- Como testar: testes especificos de ciclo de fatura, parcelamento, fatura paga, pagamentos parciais, mes fechado e resumo.
- Criterio de aceite: nenhum total financeiro muda sem teste que explicite a mudanca.
- Rollback: reverter commit da fase.

Tarefas:

- Congelar testes de `assignPilotInvoiceCycle_` vs `src/card-cycle.js`.
- Extrair pequenas funcoes puras de Apps Script para espelhar contratos locais somente quando houver equivalencia provada.
- Documentar divergencias necessarias entre local e runtime.

## Fase 4. Normalizacao do acesso a planilha

- Objetivo: tornar leitura/escrita e validacao de schema menos espalhadas.
- Arquivos afetados: `apps-script/Code.js`, possivel `scripts/sheet-audit.js`, docs.
- Risco: medio.
- Como testar: `npm run check`, `npm run snapshot`, `npm run selftest`.
- Criterio de aceite: auditor aponta abas/colunas/status/referencias sem alterar planilha.
- Rollback: reverter scripts e helpers.

Tarefas:

- Criar auditor read-only para abas esperadas, cabecalhos, colunas extras, status desconhecidos, referencias quebradas e faturas duplicadas.
- Manter `verifySheetHeaders_` fail-fast.
- Evitar qualquer limpeza automatica ate revisao humana.

## Fase 5. Limpeza de nomes, arquivos e responsabilidades

- Objetivo: reduzir o tamanho cognitivo de `Code.js`.
- Arquivos afetados: inicialmente docs e testes; depois `apps-script/Code.js`.
- Risco: medio/alto por Apps Script nao usar bundler neste repo.
- Como testar: `node --check apps-script/Code.js`, harness de Apps Script, deploy controlado se houver mudanca runtime.
- Criterio de aceite: fluxos existentes continuam iguais; nenhuma action some sem registro.
- Rollback: reverter commit.

Tarefas:

- Separar por comentarios/blocos internos antes de extrair arquivos.
- Se for criado bundling futuro, documentar decisao em `docs/DECISIONS.md`.
- Remover wrappers globais apenas com confirmacao humana.

## Fase 6. Validacao de calculos

- Objetivo: cobrir regras criticas antes de alterar calculo.
- Arquivos afetados: `test/domain.test.js`, `test/event-planner.test.js`, `test/apps-script-runtime.test.js`.
- Risco: baixo para testes, alto para implementacao.
- Como testar: `npm run check`.
- Criterio de aceite: casos criticos do pedido existem e falham se a regra quebrar.
- Rollback: reverter testes se incorretos; nao alterar codigo financeiro sem novo baseline.

Casos obrigatorios:

- Compra antes, no dia e depois do fechamento.
- Fechamento e vencimento em mes curto.
- CONCLUIDO neste lote: fevereiro bissexto.
- CONCLUIDO neste lote: parcelamento atravessando ano.
- Receita recorrente e despesa recorrente.
- Categoria invalida.
- PARCIAL neste lote: dados vindos da planilha com tipo invalido.
- Duplicidade de lancamento.
- CONCLUIDO neste lote: valores negativos indevidos no contrato local.
- Arredondamento monetario.
- Gustavo vs Luana.
- Protecao contra alteracao indevida de historico.

## Fase 7. Documentacao final e deploy

- Objetivo: deixar estado do projeto auditavel.
- Arquivos afetados: `EXECUTION_PLAN.md`, `docs/CODE_MAP.md`, `docs/REFATORAMENTO_DIAGNOSTICO.md`, `docs/PLANILHA_DIAGNOSTICO.md`, `docs/REFATORAMENTO_PLANO.md`.
- Risco: baixo.
- Como testar: docs-only nao exige `npm run check`; se houver codigo, rodar `npm run check`, `npm run push`, `clasp deploy -i $DEPLOY_ID`, `npm run snapshot`, `npm run summary`, `npm run selftest`.
- Criterio de aceite: docs refletem o estado atual e proximas decisoes humanas.
- Rollback: reverter commit.

## Decisoes humanas pendentes

- Remover ou manter `migrateV55Parcelas()` e actions de reparo historico ja aplicadas.
- Definir se `Faturas` deve continuar com linhas granulares por parcela mais linhas fechadas autoritativas, ou se precisa de uma convencao explicita.
- Decidir se `Telegram_Send_Log` deve ser ativado no runtime real ou removido do escopo.
- Confirmar politica de limpeza para linhas `cancelado_revisao`.
- Confirmar limites/orcamentos por categoria antes de implementar envelopes.
