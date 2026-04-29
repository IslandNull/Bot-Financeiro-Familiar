# DECISIONS.md

## V55-D001 - Clean Family Cash Start

Status: Accepted
Date: 2026-04-29

Decision:
Create V55 as a clean project using the V54 repository only as technical reference. Do not migrate V53 or V54 architecture, sheets, docs, or historical compatibility.

Reason:
The product center changed from person-to-person settlement to Caixa Familiar Integrado: family cash, solvency, net worth, surplus, and destination of money.

Rejected:
- Refactoring V54 as the primary path.
- Copying V54 architecture into the new project.
- Preserving old settlement sheets, fields, reports, or language.

## V55-D002 - Local Contracts Before Apps Script

Status: Accepted
Date: 2026-04-29

Decision:
Build and test pure Node.js contracts before Apps Script, Google Sheets setup, Telegram routing, OpenAI parser calls, or real spreadsheet mutation.

Reason:
The main risk is wrong financial semantics, not syntax. Local deterministic tests make the domain reviewable before any external service is involved.

## V55-D003 - New Spreadsheet

Status: Accepted
Date: 2026-04-29

Decision:
Use a new spreadsheet for V55. The current V54 spreadsheet remains untouched until a future reviewed setup task.

Reason:
This prevents old schema and data from shaping the clean V55 domain.

