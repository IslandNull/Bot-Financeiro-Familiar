# AGENTS.md

## Project

Bot Financeiro Familiar V55 — Google Apps Script, Telegram and Google Sheets.

This is a personal finance system for Gustavo and Luana. The main goals are reliability, clarity, low operational risk and low code entropy.

The codebase must clearly separate living product code from historical repair code.

## Copilot Product Direction

V56 direction is a Telegram-first financial copilot, not another passive dashboard.

The system should help Gustavo and Luana understand:
- what needs attention now;
- where spending is drifting from limits;
- what decision protects invoices, obligations and reserve;
- what not to do yet;
- what data is missing before a confident recommendation.

Prefer decision cards, next actions, and explainable recommendations over generic summaries.

Default proactive behavior:
- weekly digest;
- high-signal alerts for risk or clear opportunity;
- no daily nagging unless explicitly requested;
- no spreadsheet mutation from proactive flows.

Keep the detailed roadmap in `docs/COPILOTO_FINANCEIRO_V56_PLAN.md`. Keep `EXECUTION_PLAN.md` compact.

## Core Operating Principle

Work in useful batches, not micro-steps.

The owner does not want token-expensive bureaucratic loops. Do not ask for approval between obvious steps inside the same requested task. Ask only when proceeding could change financial meaning, delete uncertain live data, mutate the real spreadsheet in a destructive way, merge into `main`, or choose between two valid product behaviors.

Prefer:
- execute the requested batch;
- use technical judgment;
- test proportionally to risk;
- publish runtime changes when verified;
- commit and push verified work;
- summarize briefly.

Avoid:
- long narrative reports;
- repeated “human decision required” for low-risk cleanup;
- creating docs instead of solving the code problem;
- preserving dead code because of vague fear;
- single-use abstractions;
- cosmetic refactors that make the system larger.

## Mandatory Startup

Before code changes:

1. Run:
   - `git status`
   - `git branch --show-current`

2. Read only what is relevant:
   - Always read `EXECUTION_PLAN.md`.
   - Read `docs/CODE_MAP.md` when touching architecture, Apps Script runtime or `apps-script/Code.js`.
   - Read `DOMAIN_RULES.md` and `SHEET_SCHEMA.md` when touching finance logic, categories, faturas, lançamentos, saldos, patrimônio, dívidas, fechamento or spreadsheet schema.
   - Spreadsheet-format tasks must follow the formula notes in `SHEET_SCHEMA.md`.
   - Do not re-read large unchanged files unless needed.

3. Do not claim a feature, invariant, command or test exists unless verified in code, command output, tests or snapshot.

## Truth Policy

Use these labels when reporting:

- VERIFIED: confirmed in code, terminal output, tests or spreadsheet snapshot.
- UNVERIFIED: claimed but not confirmed.
- ASSUMPTION: inferred but not proven.
- RISK: possible failure mode.
- TODO: planned or recommended work.

Never write “completed”, “implemented”, “safe” or “verified” unless actually verified.

## Domain Boundary

The V55 domain is Caixa Familiar Integrado:

- family cash;
- solvency;
- net worth;
- surplus;
- suggested destination of money;
- faturas;
- lançamentos;
- fontes;
- patrimônio;
- dívidas;
- fechamento familiar.

Do not introduce couple-settlement language, debt language between Gustavo and Luana, or columns that compute what one person owes the other.

## Deterministic AI Policy

Financial calculations, recommendations, limits, safe-to-spend, reserve status, debt readiness and investment blockers must come from deterministic, tested code.

The LLM may:
- parse user text inside the existing guarded parser boundary;
- phrase deterministic insight payloads in friendlier language;
- help resolve conversational context when the runtime has enough evidence.

The LLM must not:
- invent financial numbers;
- create new financial rules;
- decide whether to invest, amortize or spend without deterministic evidence;
- expose private personal line items;
- replace tests for finance behavior.

Every copilot insight must carry evidence, confidence and privacy level. If data is missing, say what is missing instead of guessing.

## Living Code vs Historical Code

Classify code before preserving it.

### Living product code

Keep code that is currently needed for:

- Telegram commands used by the bot;
- parsing current user messages;
- reading/writing the current spreadsheet schema;
- faturas, lançamentos, saldos, patrimônio, dívidas and fechamento;
- current Apps Script entry points;
- tests that protect active financial behavior;
- scripts used by current npm workflows;
- stable operational flows documented as current behavior.

### Historical/runtime fossil code

Remove from runtime when evidence supports it:

- date-specific repair actions;
- one-off `repair_*`, `record_*`, `reset_*` or already-applied `migrate_*`;
- wrappers created only to run a past repair manually;
- helpers used only by historical repair actions;
- tests that only keep historical repair code alive;
- docs that describe obsolete operational state;
- command usage entries for actions no longer available.

Examples of likely historical code:

- April/May 2026 repair actions;
- one-off notebook/card/fatura repairs;
- duplicate debt repair routines after the data has been fixed;
- old visibility migrations after the schema/data has been updated.

If a removed historical action is useful as a record, summarize it in:

`docs/archive/HISTORICAL_REPAIR_ACTIONS.md`

Do not keep executable fossil code in `apps-script/Code.js`.

## Cleanup Policy

When asked for cleanup, refactor or simplification:

1. Prefer actual deletion over protective wrappers.
2. Prefer removing dead runtime code over documenting it.
3. Remove dispatcher cases, wrappers, private functions and tests together.
4. Preserve shared utilities still used by living code.
5. Do not create single-use abstractions.
6. Do not replace messy direct code with abstract messy code.
7. Do not perform a total rewrite unless explicitly requested.
8. Continue through small uncertainties using technical judgment.
9. Mark as REVIEW_LATER only when removal could break living behavior or financial meaning.

Good cleanup reduces:

- line count;
- dispatcher surface;
- duplicate branches;
- obsolete helpers;
- ambiguous actions;
- stale docs;
- tests for dead behavior.

Bad cleanup adds:

- new layers without reducing complexity;
- wrappers around dead code;
- generic frameworks used once;
- documentation instead of deletion;
- more indirection without smaller runtime.

## Workflow Rules For AI

- Batch related changes into a single useful batch.
- Do not ask for approval between micro-steps of the same feature.
- Minimize token usage.
- Avoid verbose verification reports.
- State what changed, what was tested and what remains risky.
- Trust the owner as the project owner and only user.
- Pilot safety gates are for protecting the spreadsheet from bugs, not for blocking the owner.
- Correct the owner directly if a request is technically harmful, financially wrong or architecturally expensive.
- Do not silently comply with bad ideas.
- Use subagents only when they save context or time.

## Runtime Publish Policy

The owner accepts automatic Apps Script publishing for verified runtime code changes.

When a task changes `apps-script/Code.js` or any source bundled into Apps Script runtime, and validation passes, run:

- `npm run push`
- `clasp deploy -i $DEPLOY_ID`

Do not ask the user to manually copy-paste code.

Do not deploy for documentation-only changes.

Do not deploy if validation fails.

Report the deploy output or deploy ID in the final summary.

## Risk Gates

Never do these unless explicitly requested by the owner:

- merge into `main`;
- change secrets;
- commit `.env`;
- expose tokens, spreadsheet IDs, webhook URLs, chat IDs or full financial dumps;
- mutate the real spreadsheet with destructive repair/reset/migration actions unless the task explicitly asks for it;
- alter financial rules without tests.

Deploying Apps Script after verified runtime code changes is allowed and expected.

Git commit and push after verified work are allowed and expected.

## Validation Policy

Match validation to risk.

### Documentation-only change

No test required.

State:

- validation skipped;
- reason: docs only.

No `npm run push`.
No `clasp deploy`.

### Code change without financial behavior change

Run:

- `npm run check`

If Apps Script runtime changed and validation passed, also run:

- `npm run push`
- `clasp deploy -i $DEPLOY_ID`
- `npm run smoke`

### Finance logic, parser, fatura, saldo, dívida, patrimônio or fechamento change

Run:

- `npm run check`

Also add or update focused tests when behavior changes.

If Apps Script runtime changed and validation passed, also run:

- `npm run push`
- `clasp deploy -i $DEPLOY_ID`
- `npm run smoke`

### Spreadsheet/schema inspection

Run:

- `npm run check`
- `npm run snapshot` only if the task requires reading current spreadsheet state.

Do not mutate the real spreadsheet unless explicitly instructed.

### Smoke and remote evidence

- `npm run smoke` is quick remote smoke only: no local tests and no snapshot.
- Use `npm run verify` when a single command should run local validation plus quick remote smoke.
- Use `npm run smoke:full` for heavier remote smoke/audit.
- Use `npm run snapshot` only when a task requires current spreadsheet evidence.
- Do not treat smoke as a substitute for `npm run check` before runtime deploy.

### Destructive spreadsheet mutation

Only run if explicitly instructed.

Before running, verify:

- target action;
- target competência/data;
- expected affected sheets;
- available test or dry-run, if present.

Report exactly what was mutated.

## Git Policy

After a verified non-trivial code or docs batch:

1. Show changed files.
2. Commit with a clear message.
3. Push the current branch.

Use:

- `git add -A`
- `git commit -m "<message>"`
- `git push`

Do not leave the working tree dirty unless blocked.

If blocked, report exactly why.

Automatic commit and push are expected after successful verified work.

## Documentation Policy

Keep documentation useful and compact.

- `EXECUTION_PLAN.md` is the operational authority.
- Keep `EXECUTION_PLAN.md` under 100 lines.
- Record current state, not long history.
- Update `docs/DECISIONS.md` only for actual architectural or domain decisions.
- Do not create a new decision document for every event type or minor cleanup.
- Do not use documentation as a substitute for deleting dead runtime code.
- Archive historical repair information only when it has future audit value.

## Prompt Economy

The owner prefers high-leverage execution over token-heavy process.

Do:

- batch related changes;
- make reasonable technical judgments;
- continue through small uncertainties;
- summarize briefly;
- state remaining risks;
- remove proven dead code.

Do not:

- stop for every minor ambiguity;
- create a report when code cleanup is requested;
- perform repeated micro-validations;
- write long explanations of obvious changes;
- ask the owner to provide information already available in the repo, tests or snapshot.

## Question Policy

Ask a question only if proceeding could:

- change financial meaning;
- delete uncertain live code;
- mutate production data destructively;
- merge into `main`;
- require choosing between two valid product behaviors;
- break a current user command.

Otherwise, proceed with best technical judgment and document the assumption.

## Sensitive Data

Never commit:

- `.env`;
- Telegram token;
- OpenAI API key;
- spreadsheet ID;
- webhook URLs;
- chat/user IDs;
- full financial dumps;
- unredacted personal financial data.

Snapshots and docs must stay redacted.

## Subagent Policy

Use subagents only when they save context or time.

A subagent task must be narrow and return:

- files inspected;
- findings;
- files changed, if any;
- validation run or skipped reason;
- remaining risks.

Do not use subagents for trivial edits.

## Reporting Format

Final response should be short:

- changed files;
- what changed;
- validation run;
- deploy run, if applicable;
- commit hash, if committed;
- risks remaining;
- next recommended step.

Skip the essay unless explicitly requested.

## Owner Interaction

The owner is technical enough to make product decisions but does not want ceremony.

Correct the owner directly if a request is technically harmful, financially wrong or architecturally expensive.

Be concise, critical and useful.
