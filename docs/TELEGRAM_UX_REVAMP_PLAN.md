# TELEGRAM_UX_REVAMP_PLAN.md

Current Telegram UX contract for V55 inline navigation.

## Goals

- Keep natural language as the fastest path.
- Use inline buttons for navigation, read-only views, ambiguity resolution and confirmations.
- Keep all financial meaning inside existing deterministic parser, validation and mutation paths.
- Never expose private IDs, tokens, chat IDs or detailed private personal rows in logs or docs.

## Preserved Commands

- `/start`: Home menu.
- `/help`: short guided help menu.
- `/ajuda` and `/exemplos`: full practical examples.
- `/resumo`: read-only family summary.
- `/agenda`, `/faturas`, `/proximas_contas`: read-only upcoming invoices/obligations.
- `/revisar_mes`, `/revisao_mes`: read-only month-review checklist.
- `/orcamento`, `/orcamentos`, `/limites`: read-only budget report.
- `/limpar_contexto`: clears conversation state.

## Callback Namespaces

- Navigation: `nav:home`, `nav:help`, `nav:examples`, `nav:launch`, `nav:settings`.
- Read-only actions: `act:summary_current`, `act:agenda_current`, `act:review_month_current`, `act:budget_current`, `act:clear_context`.
- Guided flows: `flow:expense`, `flow:card_purchase`, `flow:invoice_payment`, `flow:transfer`, `flow:income`, `flow:source_balance`, `flow:asset_balance`, `flow:correction`, `flow:closing`.
- Selections: `sel:source:<token>`, `sel:card:<token>`, `sel:cat:<token>`, `sel:invoice:<token>`, `sel:tx:<token>`.
- Confirmation/cancel: `confirm:<token>`, `cancel:<token>`.

All `callback_data` values must stay within Telegram's 64-byte limit and must not contain financial payload JSON. Tokens map to data stored in `BFF_CONVERSATION_<chat_id>`.

## Telegram Response Contract

Apps Script may return:

- `responseText`: legacy text fallback.
- `reply_markup`: optional inline keyboard for legacy `sendMessage` fallback.
- `telegramActions`: ordered Bot API actions.

Supported `telegramActions`:

- `answerCallbackQuery`
- `sendMessage`
- `editMessageText`

Every callback returns `answerCallbackQuery`. Button navigation uses `editMessageText` when Telegram supplied a source message. Text commands keep using `sendMessage`.

## Screens

- Home: summary, agenda, launch, review month, help and correction entry points.
- Help: short operating model plus examples entry.
- Examples: practical natural-language examples.
- Launch: type picker; selecting a type asks for one natural-language detail message.
- Read-only views: summary, agenda, review month and budget reuse existing report builders.
- Correction: lists recent open-month transactions, asks for corrected text, validates with dry-run deletion, then requires confirmation.
- Closing: shows closing actions and requires explicit confirmation before draft/close mutation.

## State And Expiry

Conversation state remains in Script Properties under `BFF_CONVERSATION_<chat_id>`:

- `messages`: rolling 10-message context.
- `pending_intent`: existing parser-guided missing field flow.
- `pending_action`: button-guided action state.
- `last_success_ref`: last successful mutation reference.

`pending_action` stores only short-lived tokens and minimal payload. It expires after 30 minutes. `/limpar_contexto`, `act:clear_context` and `cancel:*` clear pending state.

## Error Policy

- Unauthorized callback: answer callback only with `Nao autorizado.`, no financial data.
- Unknown callback: edit to an explicit recovery screen with Home/Help.
- Missing source/card/category/fatura: keep existing actionable text and add safe selection buttons when reference data allows.
- Closed month correction: block direct correction and instruct adjustment-reviewed flow.
- Proxy logs only method/status summaries and redacted errors.

## Acceptance

- `npm run check` passes.
- Runtime changes are pushed with `npm run push`.
- Apps Script deployment succeeds with `clasp deploy -i $DEPLOY_ID`.
- Post-deploy smoke passes with `npm run smoke`.
- Text-first launching still works.
- Read-only callbacks do not mutate Sheets.
- Guided correction and closing mutate only after explicit confirmation.
