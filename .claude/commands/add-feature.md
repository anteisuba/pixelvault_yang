Implement a new feature following the mandatory development order. The feature to implement: $ARGUMENTS

Follow this exact sequence:

1. **constants/** — Define all config variables, enums, route entries
2. **types/** — Define Zod schemas and TypeScript interfaces
3. **services/** — Write server-side business logic (if backend is involved)
4. **hooks/** — Write client-side state management
5. **components/** — Assemble the UI last

For each step:
- Check if existing constants/types/services can be reused before creating new ones
- Follow naming conventions from CLAUDE.md
- Add i18n keys to ALL THREE locale files (en.json, zh.json, ja.json)
- Use Zod schemas to derive types, never use `as` type assertions

After implementation, verify with `npx next build`.
