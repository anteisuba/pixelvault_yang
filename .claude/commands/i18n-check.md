Check i18n translation consistency across all three locale files. $ARGUMENTS

Steps:

1. The locale files are 350–440KB each — don't read them into context. Run `npm run test:run -- src/i18n/completeness.test.ts` first: it already checks missing/extra keys across locales and static `t()` calls to nonexistent keys.
2. Script what the test doesn't cover — ICU placeholder mismatches (e.g. `{count}` in en but missing in zh) and empty-string values — with a short node script that walks all three files.
3. Report findings grouped by:
   - **Missing keys** — keys that exist in en.json but not in zh/ja (or vice versa)
   - **Placeholder mismatches** — ICU message format variables differ between locales
   - **Empty values** — keys with empty string `""` that need translation
4. Suggest fixes for each issue found
