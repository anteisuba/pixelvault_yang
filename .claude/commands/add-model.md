Add a new AI model to the platform: $ARGUMENTS

Follow this checklist:

1. **`src/constants/models.ts`**
   - Add entry to `AI_MODELS` enum
   - Add entry to `MODEL_OPTIONS` array with: id, adapterType, providerConfig, label key
   - Add `getModelMessageKey()` mapping if needed

2. **`src/constants/providers.ts`**
   - Add provider config if this is a new provider

3. **`src/messages/en.json`, `zh.json`, `ja.json`**
   - Add `Models.<key>.label` and `Models.<key>.description` in all three locales

4. **`src/services/generation.service.ts`**
   - Verify the adapter handles this model's API format
   - Add adapter implementation if it's a new provider type

5. **`src/constants/config.ts`**
   - Set `DEFAULT_REQUESTS_PER_GENERATION` for this model if different from default

6. **Verify**
   - Run `npx next build` to confirm no type errors
   - Check Studio model selector renders the new model correctly
