# AGENTS.md

## Project

Bot Financeiro Familiar V55 — Google Apps Script, Telegram, Google Sheets.

## Mandatory Startup

Before changing code:

1. Run: `git status`, `git branch --show-current`, `ls`
2. Read: `EXECUTION_PLAN.md` (the single operational authority)
3. Read: `docs/CODE_MAP.md` (file map, source modules, Code.js architecture)
4. For formula or spreadsheet tasks, also read: `docs/FORMULA_STANDARD.md`
5. For domain questions, read: `DOMAIN_RULES.md` and `SHEET_SCHEMA.md`
6. Do not claim a feature exists unless verified in files or command output.

## Truth Policy

- VERIFIED: confirmed in code, terminal output, tests, or spreadsheet snapshot.
- UNVERIFIED: claimed but not confirmed.
- ASSUMPTION: inferred but not proven.
- TODO: planned work.

Never write "completed" or "implemented" unless verified.

## V55 Domain Boundary

The V55 domain is Caixa Familiar Integrado: family cash, solvency, net worth, surplus, and suggested destination of money. Do not introduce couple-settlement language, debt language between Gustavo and Luana, or columns that compute what one person owes the other.

## Sensitive Data

Never commit: `.env`, Telegram token, OpenAI API key, spreadsheet ID, webhook URLs, chat/user IDs, or full financial dumps.

## Workflow Rules For AI

- **Batch changes.** Group related changes into a single batch. Do not ask for approval between micro-steps of the same feature.
- **Test once.** Run `npm run check` once at the end of a batch, not between each micro-change.
- **Deploy with clasp.** Use `npm run push` then `clasp deploy -i $DEPLOY_ID` (from `.env`) to update the web app. Do not ask the user to manually copy-paste code.
- **Sync spreadsheet state.** Run `npm run snapshot` to auto-generate `docs/SPREADSHEET_SNAPSHOT.md`. Do not ask the user to describe changes.
- **Schema-driven validation.** When adding a new event type or category, follow the existing schema validation pattern. Do not create a new formal decision document for each event type.
- **Compact docs.** Keep `EXECUTION_PLAN.md` under 100 lines. Record state, not history.
- **Trust the owner.** The user is the project owner and only user. Do not add security barriers against the project owner. Pilot safety gates are for protecting the spreadsheet from bugs, not from the user.
- **Minimize token usage.** Avoid re-reading entire files that haven't changed. Avoid verbose verification reports. State what changed and what was tested — skip the narrative.
- **Always commit.** After verified changes, run `git add -A && git commit && git push`. Never leave working tree dirty.
- **No single-use abstractions.** Do not add helpers, wrappers, maps, or validation layers unless they clearly reduce complexity and are used in more than one place.
- **Match validation to risk.** Skip `npm run check` for documentation-only changes (README, EXECUTION_PLAN, markdown docs). State plainly that validation was skipped and why.
- **Subagent discipline.** Use subagents only when they save context or time. Assign a narrow task and require: findings, files inspected/changed, validation run (or why skipped), and remaining risks. Avoid subagents for trivial work.
- **Correct the user.** The user is not a financial or programming expert. If the user suggests something technically wrong, architecturally harmful, or financially inaccurate, say so directly and explain why. Do not silently comply with a bad idea.

## Validation

After code changes:

1. Show changed files.
2. State what was verified (command output).
3. State what remains unverified.
4. Update `EXECUTION_PLAN.md` only if the project state or next step changed materially.
5. Update `docs/DECISIONS.md` only for actual architectural decisions, not per-event-type gates.
