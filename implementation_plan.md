# Plano de Implementação: Correções Críticas (Bugs Pós-Auditoria)

Este plano delineia as correções para os três bugs críticos confirmados na auditoria e os pontos adicionais listados sobre o runtime do Google Apps Script (`apps-script/`). As correções atingirão os componentes do Node (`src/`) e as contrapartes do runtime para garantir paridade.

## User Review Required
Por favor, revise o mapeamento das alterações no plano abaixo. Uma vez aprovado, este plano será rigorosamente executado.

## Proposed Changes

---
### Parcelamento (BUG-001 e BUG-001B)
Corrigir a função de cálculo dos ciclos de parcelamento de faturas, garantindo que o primeiro ciclo seja calculado a partir da data da compra e que as parcelas seguintes simplesmente avancem em meses a partir da data de fechamento dessa primeira fatura.

#### [MODIFY] [src/card-cycle.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/src/card-cycle.js)
- Ajustar `assignInstallmentCycles` para basear iterações nas competências e meses pós primeiro ciclo, e não iterando a própria data de compra a cada mês.

#### [MODIFY] [apps-script/reporting.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/apps-script/reporting.js)
- Ajustar `recordPilotCardPurchase_` substituindo a chamada para `addUtcMonths_(parseIsoDateUtc_(event.data), pi)` pela progressão da competência a partir da primeira fatura calculada.

---
### Arredondamento Flutuante (BUG-002 e BUG-002B)
Inclusão do fator `Number.EPSILON` para evitar perda de precisão e queda de centavos em frações de centésimos (ex. `1.015`).

#### [MODIFY] [src/domain.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/src/domain.js)
- Corrigir a função `roundMoney` para instanciar o número e adicionar `Number.EPSILON` na base multiplicada: 
  `var n = Number(value); if (!isFinite(n)) return 0; return Math.round((n + Number.EPSILON) * 100) / 100;`

#### [MODIFY] [apps-script/infra.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/apps-script/infra.js)
- Fazer a mesma correção na função `roundMoney_`.

---
### Edição de Mensagens (BUG-003 e BUG-003B)
Remover suporte oficial a `edited_message` e construir guarda contra mensagens editadas.

#### [MODIFY] [apps-script/Code.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/apps-script/Code.js)
- Nas funções `runTelegramWebhookSetupDryRun` e `runTelegramWebhookSetupApply`, alterar os `allowed_updates` removendo `'edited_message'`.

#### [MODIFY] [apps-script/parser.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/apps-script/parser.js)
- Em `handleTelegramUpdate_`, adicionar um check defensivo imediato para `update.edited_message`, retornando: `ok: false, responseText: 'Não processo edição de mensagem para evitar duplicidade. Para corrigir, envie: corrigir último lançamento para ...'`.

#### [MODIFY] [src/telegram-handler.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/src/telegram-handler.js)
- Adicionar a mesma guarda defensiva contra `edited_message` e retornar uma instrução limpa de correção.

---
### Validação Avançada de Dry-run (PROV-003)
O dry-run não checa se uma fatura a ser estornada em caso de erro realmente existe e está em estado válido de cancelamento.

#### [MODIFY] [apps-script/mutation.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/apps-script/mutation.js)
- Retirar a busca/validação da fatura (`pagamento_fatura`) de dentro do bloco `if (!dryRun)` na função `deleteFinancialTransaction_` e falhar o dry-run preventivamente caso a fatura não seja encontrada.

---
### Melhorias de UX: Foto com Legenda e Prompt Decimal

#### [MODIFY] [src/telegram-webhook.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/src/telegram-webhook.js)
- Corrigir o tratamento de payload na extração inicial de texto no Node: `const text = message.text || message.caption || '';`.

#### [MODIFY] [src/parser-contract.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/src/parser-contract.js)
- Alterar as regras em inglês do Parser LLM de "STRICTLY PROHIBIT comma" para "Convert any comma money formats like '12,34' to dot-decimal '12.34'". 

#### [MODIFY] [apps-script/parser.js](file:///g:/Arquivos%20Gustavo/Documentos/Git/Bot-Financeiro-Familiar/apps-script/parser.js)
- Ajustar a mesma instrução textual (`buildParserPrompt_`) e corrigir extração `message.caption` se houver pré-processamento.


## Verification Plan
1. **Automated Tests:** Adicionar/atualizar testes do `npm run test` com os seguintes focos:
   - Data pós-fechamento no cálculo de parcelas (tanto pro `card-cycle.js` quanto simulando `recordPilotCardPurchase_`).
   - Rounding check validando precisões (e.g. `1.015 -> 1.02`).
   - Mock da request do Telegram enviando `edited_message` para certificar a interrupção.
   - Cenário dry-run sem `id_fatura` existente, capturando e validando falha antes da deleção.
2. **Runtime Code:** Compilar as mudanças em `apps-script` sem gerar quebra de runtime e rodar `npm run check`.
3. Não haverá deploy automático no ambiente de produção a não ser que os testes atestem o reparo sem efeitos colaterais.
