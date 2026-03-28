# LoRA Support — Card System Integration Guide

> Status: **IMPLEMENTED** (Backend + UI) | Date: 2026-03-28

## Overview

LoRA (Low-Rank Adaptation) support has been integrated into the card system at **two levels**:

1. **Model Card** — style/model-level LoRAs (e.g., "3D anime render" style) stored in `advancedParams.loras`
2. **Character Card** — character-specific LoRAs (e.g., "女漂泊者" character) stored in dedicated `loras` field

The **Recipe Compiler** automatically merges LoRAs from both sources when compiling a recipe.

---

## Architecture: How LoRA Flows Through the System

```
┌─────────────────┐
│ Character Card  │
│                 │
│ loras: [        │──────┐
│   {url, scale}  │      │
│ ]               │      │
└─────────────────┘      │
                         ▼
┌─────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  Model Card │     │  Card Recipe │     │   Recipe Compiler     │
│             │     │              │     │                       │
│ advancedParams:   │ modelCardId  │────>│ 1. Load all cards     │
│   loras: [  │────>│ charCardId   │     │ 2. Merge LoRAs:       │
│     {url,   │     │ styleCardId  │     │    char[] + model[]   │
│      scale} │     │ bgCardId     │     │ 3. Return merged      │
│   ]         │     │ freePrompt   │     │    advancedParams     │
└─────────────┘     └──────────────┘     └──────────┬───────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │ generateImage()  │
                                           │                  │
                                           │ advancedParams   │
                                           │   .loras ────────┼──> FAL:  body.loras = [{path, scale}]
                                           │                  │    REP:  input.hf_lora + lora_scale
                                           └──────────────────┘
```

### Key Design

LoRA sources are separated by semantic role:

- **Character Card `.loras`** — "who" (character-specific LoRA, e.g., trained on a specific character)
- **Model Card `.advancedParams.loras`** — "how" (style/rendering LoRA, e.g., 3D anime style)

The **Recipe Compiler** merges both arrays: `[...charLoras, ...modelLoras]` and passes the combined set to the provider adapter.

### Data Flow

1. **CharacterCard** stores `loras` in a dedicated Prisma `Json?` field
2. **ModelCard** stores `loras` inside `advancedParams` (also `Json?`)
3. **Recipe Compiler** loads both, merges LoRA arrays, returns unified `advancedParams`
4. **Generation Service** forwards merged `advancedParams` to the provider adapter
5. **Provider Adapter** (FAL/Replicate) extracts `loras` and maps to provider-specific API format

---

## Changed Files

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Added `loras Json?` field to `CharacterCard` model |
| `src/types/index.ts` | Added `LoraSchema`, `loras` to `AdvancedParamsSchema`, `CharacterCardRecord`, `UpdateCharacterCardSchema` |
| `src/constants/provider-capabilities.ts` | Added `'lora'` capability, `loraScale` range, `maxLoras` for FAL(5) and Replicate(1) |
| `src/constants/models.ts` | Added `FLUX_LORA` model enum + model option (fal-ai/flux-lora) |
| `src/services/providers/fal.adapter.ts` | Maps `loras` → `body.loras = [{path, scale}]` |
| `src/services/providers/replicate.adapter.ts` | Maps first LoRA → `input.hf_lora` + `input.lora_scale` |
| `src/services/character-card.service.ts` | Added `loras` to DB row mapping and update handler |
| `src/services/recipe-compiler.service.ts` | Loads character LoRAs, merges with model LoRAs in `compileRecipe()` |
| `src/components/business/AdvancedSettings.tsx` | Added LoRA UI section (URL input, scale slider, add/remove) |
| `src/messages/{en,ja,zh}.json` | Added `fluxLora` model + LoRA UI i18n translations |

---

## Type Definitions

### LoRA Schema (Zod)

```typescript
// src/types/index.ts
export const LoraSchema = z.object({
  url: z.string().url().max(500),   // HuggingFace, Civitai, or direct URL
  scale: z.number().min(0.1).max(2).optional(),  // default: 1.0
})

// Inside AdvancedParamsSchema:
loras: z.array(LoraSchema).max(5).optional()
```

### TypeScript Type (inferred)

```typescript
interface Lora {
  url: string      // LoRA model URL
  scale?: number   // 0.1–2.0, default 1.0
}

// AdvancedParams now includes:
interface AdvancedParams {
  // ... existing fields ...
  loras?: Lora[]
}
```

---

## Provider Capability Matrix

| Provider | LoRA Support | Max LoRAs | Scale Range | API Format |
|----------|-------------|-----------|-------------|------------|
| **FAL** | Yes | 5 | 0.1–2.0 | `body.loras = [{path: url, scale}]` |
| **Replicate** | Yes | 1 | 0.1–2.0 | `input.hf_lora = url`, `input.lora_scale = scale` |
| HuggingFace | No | — | — | — |
| NovelAI | No | — | — | — |
| OpenAI | No | — | — | — |
| Gemini | No | — | — | — |
| VolcEngine | No | — | — | — |

### Checking LoRA Support in UI

```typescript
import { hasCapability, getCapabilityConfig } from '@/constants/provider-capabilities'

// Check if adapter supports LoRA
if (hasCapability(adapterType, 'lora')) {
  const config = getCapabilityConfig(adapterType)
  const maxLoras = config.maxLoras ?? 1
  const scaleRange = config.loraScale  // { min: 0.1, max: 2, step: 0.05, default: 1 }
}
```

---

## Model Card Creation Example

### API: Create a 3D Anime Model Card

```json
POST /api/model-cards
{
  "name": "3D Anime Style (FLUX LoRA)",
  "description": "3D rendered anime with cel shading and cinematic lighting",
  "modelId": "flux-lora",
  "adapterType": "fal",
  "advancedParams": {
    "guidanceScale": 7.5,
    "steps": 30,
    "loras": [
      {
        "url": "https://civitai.com/api/download/models/XXXXX",
        "scale": 0.85
      }
    ]
  },
  "tags": ["3d", "anime", "lora"]
}
```

### Recipe Using This Model Card

```json
POST /api/card-recipes
{
  "name": "3D Anime Character Scene",
  "characterCardId": "char_xxx",
  "backgroundCardId": "bg_xxx",
  "styleCardId": "style_xxx",
  "modelCardId": "model_xxx_3d_anime",
  "freePrompt": "standing on a rooftop at sunset, wind blowing through hair"
}
```

### Compile → Generate

```json
POST /api/card-recipes/{id}/compile
// Response:
{
  "compiledPrompt": "A girl with black hair and golden eyes, wearing a military cap...",
  "modelId": "flux-lora",
  "adapterType": "fal",
  "advancedParams": {
    "guidanceScale": 7.5,
    "steps": 30,
    "loras": [{ "url": "https://civitai.com/...", "scale": 0.85 }]
  },
  "referenceImages": ["https://r2.example.com/char_ref.png"]
}
```

The compiled result can be sent directly to `/api/generate` — the FAL adapter will automatically include the LoRA configuration in the API call.

---

## UI Integration Points

### 1. Generation Form — Advanced Params (IMPLEMENTED)

`AdvancedSettings.tsx` now renders a LoRA section when `hasCapability(adapterType, 'lora')` is true:

- **"+ Add" button** — Adds a new LoRA entry (up to `maxLoras`)
- **URL input** — Monospace text field for HuggingFace/Civitai URL
- **Weight slider** — Per-LoRA scale from `loraScale.min` to `loraScale.max`
- **Remove button** — X icon to delete individual LoRA entries
- Each LoRA entry is wrapped in a bordered card for visual grouping
- Full i18n support (en/ja/zh)

The LoRA section automatically appears when user selects FLUX LoRA or any other LoRA-capable model (FAL/Replicate).

### 2. Model Card Creator — LoRA Section (TODO: Card UI)

When the Model Card creation UI is built, it should reuse the same `AdvancedSettings` component, which already handles LoRA rendering. The saved `advancedParams.loras` will persist in the ModelCard's JSON field.

### 3. Recipe Builder — Model Card Preview (TODO: Card UI)

When a Model Card with LoRA is selected, show:
- LoRA badge/indicator on the card
- LoRA count (e.g., "2 LoRAs applied")
- Tooltip with LoRA details

---

## LoRA URL Sources

Users can get LoRA URLs from:

| Source | URL Format | Notes |
|--------|-----------|-------|
| **Civitai** | `https://civitai.com/api/download/models/{id}` | Largest LoRA community |
| **HuggingFace** | `https://huggingface.co/{user}/{repo}` | Direct model repo URL |
| **Direct URL** | Any HTTPS `.safetensors` link | Self-hosted LoRAs |

FAL supports all three formats natively. Replicate primarily supports HuggingFace URLs.

---

## Style Card + LoRA Synergy

The most powerful pattern for achieving "3D anime" consistently:

```
Style Card: "3D anime render, cel shading, subsurface scattering, cinematic lighting, depth of field"
    +
Model Card: FLUX LoRA + 3D anime LoRA (scale: 0.85) + guidance_scale: 7.5
    +
Character Card: "black haired girl with golden eyes, military cap, glasses"
    +
Free Prompt: "standing on a rooftop, sunset, wind"
    ↓
Recipe Compiler (LLM fusion, model-aware)
    ↓
Final optimized prompt + LoRA config → FAL API
```

The Style Card handles the **prompt-level** style description, while the Model Card's LoRA handles the **model-level** style weights. Together they produce consistent, high-quality 3D anime output.

---

## Testing

### Quick Smoke Test

```bash
# 1. Create a Model Card with LoRA
curl -X POST /api/model-cards \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test LoRA",
    "modelId": "flux-lora",
    "adapterType": "fal",
    "advancedParams": {
      "loras": [{"url": "https://huggingface.co/example/lora", "scale": 1.0}]
    }
  }'

# 2. Create a recipe using this model card
# 3. Compile the recipe → verify advancedParams includes loras
# 4. Generate → verify FAL request includes body.loras
```

### Validation

The Zod schema enforces:
- `url` must be a valid URL (max 500 chars)
- `scale` must be 0.1–2.0
- Max 5 LoRAs per request
- Invalid LoRA data is rejected at API validation layer

---

## Future Enhancements

1. **LoRA Gallery/Presets** — Curated list of popular LoRAs (3D anime, watercolor, pixel art)
2. **LoRA Preview Images** — Fetch and display sample outputs from Civitai API
3. **LoRA Validation** — Verify URL accessibility before saving to Model Card
4. **Multi-LoRA Blending UI** — Visual weight mixer for combining multiple LoRAs
5. **HuggingFace Integration** — Browse/search LoRAs directly from the app
