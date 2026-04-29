# AGENTS.md

## Project

Bot financeiro familiar V55 em Google Apps Script, Telegram e Google Sheets.

## Mandatory Startup

Before changing code, inspect the real repository state:

1. Run:
   - `git status`
   - `git branch --show-current`
   - `cat package.json`
   - `ls`
2. Read:
   - `PRODUCT_SPEC.md`
   - `DOMAIN_RULES.md`
   - `SHEET_SCHEMA.md`
   - `docs/DECISIONS.md`
3. For formula, spreadsheet, setup, seed, Apps Script mutation, or reporting tasks, also read:
   - `docs/FORMULA_STANDARD.md`
4. Do not claim a feature exists unless verified in files or command output.

## Truth Policy

Use these labels when reporting status:

- VERIFIED: confirmed in code, terminal output, tests, or spreadsheet snapshot.
- UNVERIFIED: claimed but not confirmed.
- ASSUMPTION: inferred but not proven.
- TODO: planned work.

Never write "completed", "implemented", or "pushed" unless verified.

## V55 Domain Boundary

The V54 repository is a technical reference only, not an architectural base.

Do not introduce couple-settlement language, debt language between Gustavo and Luana, or columns that compute what one person owes the other. The V55 domain is Caixa Familiar Integrado: family cash, solvency, net worth, surplus, and suggested destination of money.

## Sensitive Data

Never commit:

- `.env`
- Telegram token
- OpenAI API key
- Spreadsheet ID if considered private
- full financial transaction dumps with real values

## Validation

After code changes:

1. Show changed files.
2. Explain what was verified.
3. Explain what remains unverified.
4. Update `docs/DECISIONS.md` if a technical or domain decision changed.

