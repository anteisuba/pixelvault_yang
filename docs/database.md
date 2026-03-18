# Database

PostgreSQL (Neon) accessed via Prisma 7 with PrismaPg Driver Adapter.

Schema: `prisma/schema.prisma`
Generated client: `src/lib/generated/prisma/`

## Models

### User

Core identity, synced from Clerk via webhook.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| clerkId | String | Unique, from Clerk |
| email | String | Unique |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

Relations: `generations[]`, `userApiKeys[]`, `generationJobs[]`, `apiUsageLedger[]`

### Generation

Every AI-generated image, stored permanently.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| outputType | Enum | IMAGE / VIDEO / AUDIO |
| status | Enum | PENDING / COMPLETED / FAILED |
| url | String | R2 permanent URL |
| storageKey | String | R2 bucket path |
| mimeType | String | Default: `image/png` |
| width / height | Int | Default: 1024 |
| duration | Float? | Video only (seconds) |
| prompt | Text | User's prompt |
| negativePrompt | Text? | Optional |
| model | String | AI model ID (maps to `AI_MODELS` enum) |
| provider | String | Provider name |
| requestCount | Int | API calls consumed |
| isPublic | Boolean | Default: true |
| userId | String? | FK → User |

Indexes: `[userId]`, `[outputType, isPublic, createdAt DESC]`

### GenerationJob

Async job tracking for generation queue.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| userId | String | FK → User |
| generationId | String? | Unique FK → Generation |
| status | Enum | QUEUED / RUNNING / COMPLETED / FAILED |
| requestCount | Int | API calls made |
| errorMessage | Text? | On failure |

### ApiUsageLedger

Per-request usage tracking for billing and analytics.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| userId | String | FK → User |
| generationId | String? | FK → Generation |
| generationJobId | String? | FK → GenerationJob |
| adapterType | String | huggingface / gemini / openai |
| requestCount | Int | Requests in this entry |
| wasSuccessful | Boolean | Default: true |

### UserApiKey

User-managed API routes for custom model endpoints.

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| userId | String | FK → User |
| modelId | String | Target model ID |
| adapterType | String | huggingface / gemini / openai |
| providerConfig | Json | `{ label, baseUrl }` |
| label | String | User-facing route name |
| encryptedKey | String | Encrypted API key |
| isActive | Boolean | Default: true |

## Migration Workflow

```bash
# After changing schema.prisma:
npx prisma migrate dev --name <description>
npx prisma generate
```

Never manually edit `src/lib/generated/prisma/`.
