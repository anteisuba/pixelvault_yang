Check i18n translation consistency across all three locale files. $ARGUMENTS

Steps:

1. Read `src/messages/en.json`, `src/messages/zh.json`, `src/messages/ja.json`
2. Compare key structures:
   - Find keys present in one locale but missing in others
   - Find keys with placeholder mismatches (e.g. `{count}` in en but missing in zh)
   - Find empty string values that should have translations
3. Report findings grouped by:
   - **Missing keys** — keys that exist in en.json but not in zh/ja (or vice versa)
   - **Placeholder mismatches** — ICU message format variables differ between locales
   - **Empty values** — keys with empty string `""` that need translation
4. Suggest fixes for each issue found
