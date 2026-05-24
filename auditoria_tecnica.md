# Auditoria de bugs do código

## Resumo executivo

| ID | Severidade | Tipo | Área afetada | Impacto | Status | Recomendação |
|---|---|---|---|---|---|---|
| **BUG-001** | Crítica | Cartão/fatura | Cálculo de ciclos de parcelamento | Faturas terão parcelas somadas incorretamente, repetindo em alguns meses e pulando outros. | Comprovado | Corrigir a lógica de progressão de meses no parcelamento. |
| **BUG-002** | Alta | Dinheiro | Cálculos financeiros base (`domain.js`) | Perda silenciosa de centavos em divisão de despesas e margens devido a falha de ponto flutuante. | Comprovado | Adicionar `Number.EPSILON` no `roundMoney` do `domain.js`. |
| **BUG-003** | Crítica | Estado e idempotência | Webhook do Telegram | Edição de mensagem duplica a transação na planilha ao invés de corrigir ou ignorar. | Comprovado | Ignorar edições no Webhook ou alterar chave de idempotência. |
| **PROV-001** | Média | UX/LLM | Captura de mensagens | Recibos enviados como foto com legenda ("mercado 50") são ignorados. | Provável | Checar `message.caption` como fallback de `message.text`. |
| **PROV-002** | Baixa | UX/LLM | Prompt de parser | Prompt restringe vírgulas sem ordenar a conversão, podendo fazer o LLM falhar requisições válidas. | Provável | Ajustar o prompt para ordenar conversão em vez de proibição. |

---

## Bugs comprovados

### BUG-001 — Cálculo incorreto de meses em parcelas que caem após o fechamento
- **Severidade:** Crítica
- **Tipo:** Datas / Cartão e Fatura
- **Arquivos/funções:** `src/card-cycle.js` -> `assignInstallmentCycles`
- **Evidência no código:** Ao iterar nas parcelas, o código obtém a data da parcela (`offsetDate`) e chama novamente `assignInvoiceCycle(dateStr, card)`. Se a data base da compra já sofreu rolagem de fechamento, aplicar a rolagem iterativamente aos "dias" desalinha o mês destino.
- **Cenário de reprodução:**
  - Compra: `2026-01-31`
  - Fechamento: dia 28 do mês
  - Parcelas: 3
- **Resultado atual (comprovado por teste diagnóstico):**
  - Parcela 1 -> 2026-02-28 (Fatura 2026-02)
  - Parcela 2 -> 2026-02-28 (Fatura 2026-02) **DUPLICADO**
  - Parcela 3 -> 2026-04-28 (Fatura 2026-04) **PULOU O MÊS 03**
- **Resultado esperado:** Parcela 1 em 2026-02, Parcela 2 em 2026-03, Parcela 3 em 2026-04.
- **Impacto financeiro:** O bot concentra parcelas múltiplas no mesmo mês da fatura (inflando indevidamente a obrigação) e ignora as parcelas nos meses seguintes.
- **Teste sugerido:** Validar `assignInstallmentCycles` com uma data pós-fechamento e garantir que os `competencia` retornados sejam estritamente crescentes sem duplicatas.
- **Correção recomendada:** Descobrir o primeiro ciclo (`assignInvoiceCycle`) para a Parcela 1 e, para as parcelas seguintes, iterar apenas incrementando o mês do próprio ciclo (adicionando meses ao `data_fechamento` já validado), em vez de invocar a regra de negócio de clamping para a data da compra original iterada.
- **Risco de regressão:** Alto se não testar limites de fevereiro.

### BUG-002 — Perda silenciosa de centavos em arredondamentos
- **Severidade:** Alta
- **Tipo:** Dinheiro
- **Arquivos/funções:** `src/domain.js` -> `roundMoney`
- **Evidência no código:** A função usa `Math.round((Number(value) || 0) * 100) / 100`. No JavaScript, números de ponto flutuante resultam em perdas na representação. Exemplo: `1.015 * 100` é `101.49999999999999`, que `Math.round` converte para `101`, devolvendo `1.01`. (O `validator.js` não tem esse bug pois inclui `+ Number.EPSILON`).
- **Cenário de reprodução:** Chamar `roundMoney(1.015)` durante cálculo de parcela de divisão de despesa, cálculo de margem segura, ou juros de dívida.
- **Entrada:** `1.015`
- **Resultado atual:** `1.01`
- **Resultado esperado:** `1.02`
- **Impacto financeiro:** Centavos se perdem aleatoriamente no cálculo de saldos da DRE e Fechamento. Ao longo do ano, isso desalinha os saldos do bot dos saldos reais.
- **Teste sugerido:** Asserir `roundMoney(1.015) === 1.02` e `roundMoney(1.005) === 1.01`.
- **Correção recomendada:** Mudar para `Math.round((Number(value) || 0 + Number.EPSILON) * 100) / 100`.
- **Risco de regressão:** Baixo.

### BUG-003 — Transação duplicada ao editar mensagem
- **Severidade:** Crítica
- **Tipo:** Estado e idempotência
- **Arquivos/funções:** `src/telegram-handler.js` -> `buildTelegramRequest`
- **Evidência no código:** A chave de idempotência é construída usando `update.update_id`. Ao mesmo tempo, o código checa `const message = update.message || update.edited_message;`.
- **Cenário de reprodução:**
  1. Usuário envia "Mercado 50" (`update_id: 101`, `message_id: 200`). Bot cadastra 50.
  2. Usuário percebe que errou e **edita** a mensagem no Telegram para "Mercado 60" (`update_id: 102`, `message_id: 200`).
- **Resultado atual:** Como o `update_id` muda (a API do Telegram envia novos update_ids para edições), a `idempotency_key` será `telegram:102:200`. O bot enxerga como nova requisição e **insere outra compra de R$ 60**, totalizando R$ 110.
- **Resultado esperado:** O bot não deve aceitar transações a partir de mensagens editadas sem um mecanismo explícito de `UPDATE`, ou deve rejeitá-las com mensagem explicativa.
- **Impacto financeiro:** Dinheiro duplicado. Todo erro de digitação do usuário que ele tentar corrigir com "Editar Mensagem" gera duplicata.
- **Teste sugerido:** Simular um `update.edited_message` para testar comportamento.
- **Correção recomendada:** Se `update.edited_message` existir, interromper e retornar mensagem "Não suporto edição de mensagem. Para corrigir, envie um estorno ou ajuste", OU ignorar silenciosamente e retornar ok.
- **Risco de regressão:** Baixo (evita corrupção).

---

## Bugs prováveis

### PROV-001 — Legendas de fotos ignoradas ("caption")
- **Severidade:** Média
- **Arquivos:** `src/telegram-webhook.js`
- **Problema:** O código mapeia o texto do usuário com `const text = message && typeof message.text === 'string' ? message.text.trim() : '';`. Caso o usuário envie a foto de uma nota fiscal com a legenda "Mercado 40", o texto vem em `message.caption`. A transação será falhada por falta de texto.
- **Impacto:** Atrito UX. Usuário precisará reenviar.

### PROV-002 — Prompt frágil sobre vírgulas
- **Severidade:** Baixa
- **Arquivos:** `src/parser-contract.js`
- **Problema:** O prompt instrui: `"STRICTLY PROHIBIT comma money formats like '12,34' or any other non-dot-decimal formats."`. Isso diz para o LLM não usá-las na saída, mas pode levar o LLM a falhar a extração achando que a entrada é ilegal, em vez de ativamente converter "12,34" para "12.34".
- **Impacto:** Usuários digitam valores com vírgula instintivamente e podem receber rejeição falsa pelo LLM.

---

## Comportamentos ambíguos

1. **Responsabilidade cruzada de faturas compartilhadas pagas com caixa familiar:**
   - **Regra inferida:** Faturas (`pagamento_fatura`) pagas por transferência familiar saem do "Caixa Familiar".
   - **Impacto:** O cartão é individual (ex: Titular Gustavo), mas a compra é `escopo: Familiar`. Quando a fatura fecha, não há rastreamento parcial de qual montante é obrigação familiar e qual é gasto pessoal do Gustavo na mesma fatura.
   - **Decisão humana:** Decidir se faturas mescladas serão divididas pro-rata na hora do pagamento ou se cartões pessoais estão bloqueados para despesas familiares no sistema.

2. **Edição retroativa de linhas (`ajuste`):**
   - **Regra inferida:** O validador não permite gravar despesas retroativas após 365 dias, mas permite `ajuste` para conciliar saldos de meses fechados.
   - **Impacto:** O bot permite que um ajuste seja feito, mas não há um hook ligando isso para recalcular o relatório final do fechamento mensal de meses passados caso os dados sejam corrompidos.
   - **Decisão humana:** Determinar se fechamentos passados travam a planilha permanentemente para edições via Telegram.

---

## Lacunas de teste

| Domínio | Caso não coberto | Risco | Teste recomendado | Prioridade |
|---|---|---|---|---|
| Dinheiro | Arredondamento ponto flutuante (.5) em cálculos puros | Perda de centavos | Asserir se `roundMoney(1.015)` é `1.02`. | Alta |
| Parcelamento | Compra em mês longo parcelado em mês curto (fevereiro) pós data fechamento. | Faturas duplicadas | Validar array resultante de ciclos retornados de `assignInstallmentCycles` para compra 31/01 c/ fechamento dia 28. | Crítica |
| Estado / Webhook | Update Telegram do tipo "edited_message". | Duplicação | Passar objeto de update contendo `edited_message` e outro `update_id` para o webhook e certificar recusa/sucesso. | Alta |
| Captura Telegram | Mensagem contendo foto (caption ao invés de text) | Rejeição UX | Simular requisição de imagem com caption "Farmacia 25". | Média |

---

## Código morto ou suspeito

| Arquivo/Função | Por que parece suspeito | Risco de remover | Recomendação |
|---|---|---|---|
| Tratamento de `message.text` | Focado estritamente na string crua sem abstrair tipo de payload do Telegram. | Baixo | Adicionar extração de texto genérico independente de ser imagem/documento/texto puro. |
| `validator.js`: Validação excessiva de limites 2000..2100 | Datas futuras têm limite explícito e os validadores isIsoDate também. | Baixo | Pode simplificar removendo cheques irrelevantes de ano 2100, mantendo limite de 365 dias que já faz o papel prático. |

---

## Dívidas técnicas que aumentam risco de bug

1. **Implementação de `idempotency_key` sensível a updates lógicos do Telegram:** O acoplamento da infraestrutura do Telegram (`update_id`) com a identidade do lançamento contamina a base. A chave deve depender primariamente do `message_id` em combinação com `chat_id` e a transação em si, ou barrar edições ativamente.
2. **Duplicação de regras matemáticas core:** `validator.js` executa uma lógica de parsing financeiro (`+ Number.EPSILON`) separada do núcleo central `domain.js` (`roundMoney`). Isso abriu a porta para o bug de precisão de cálculos apontado.

---

## Plano de correção sugerido

### 1. Correções Críticas Imediatas
1. **BUG-001 (Faturas Duplicadas):** Reescrever `assignInstallmentCycles` para adicionar meses incrementalmente sobre o ciclo-base originado do dia da compra, em vez de simular uma nova compra no mês subsequente.
2. **BUG-003 (Duplicação por Edição):** Implementar rejeição imediata no `telegram-webhook.js` caso o update seja do tipo `edited_message`.
3. **BUG-002 (Arredondamento):** Modificar a função `roundMoney` do `domain.js` incorporando `Number.EPSILON`.

### 2. Testes de Regressão
- Codificar os testes sugeridos na Lacuna de Teste (destaque para Fev 28 vs 31 e o float epsilon) para solidificar o contrato.

### 3. Refactors Pequenos e Seguros
- Unificar o parsing de números do `validator.js` com a fundação contábil do `domain.js` exportando uma única função de conversão estrita dot-decimal do sistema.
- Ler `message.caption || message.text` ao recepcionar requisições.

---

## Critérios de aceite para correção

A auditoria será considerada resolvida quando:
1. `npm test` contar com os 3 testes adicionais (Data Fev/Parcela, Edição do Telegram, Epsilon).
2. O teste de Fev/Parcela passar sem duplicar id de faturas, respeitando a progressão temporal Mês+1, Mês+2.
3. Mensagens editadas no Telegram retornarem graciosamente em vez de acionar a `idempotency.js` falsamente ou inserirem dados duplicados no Caixa.
4. Nenhuma regressão for registrada em `npm test` durante essas aplicações.
