# FORMULA_STANDARD.md

Use this standard for future Apps Script formula injection:

- Use `range.setFormula()`.
- Use English function names such as `SUMIFS`, `IF`, `DATEDIF`, `TODAY`, and `XLOOKUP`.
- Use semicolon `;` as argument separator.
- Do not use localized function names.
- Do not use `setValue()` for formulas unless explicitly re-tested.
- Do not use temp-cell copy patterns for formulas.

