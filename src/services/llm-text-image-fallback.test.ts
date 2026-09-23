import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LLM_TEXT_MODEL_IDS } from '@/constants/config'
import { AI_ADAPTER_TYPES } from '@/constants/providers'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/lib/crypto', () => ({
  decryptApiKey: vi.fn().mockReturnValue('user-key'),
}))
vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn().mockReturnValue(null),
}))

const mockKeyFindFirst = vi.fn()
const mockGenerationFindUnique = vi.fn()
const mockGenerationUpdate = vi.fn()
vi.mock('@/lib/db', () => ({
  db: {
    userApiKey: {
      findFirst: (...a: unknown[]) => mockKeyFindFirst(...a),
    },
    generation: {
      findUnique: (...a: unknown[]) => mockGenerationFindUnique(...a),
      update: (...a: unknown[]) => mockGenerationUpdate(...a),
    },
  },
}))
vi.mock('@/services/user.service', () => ({
  ensureUser: vi.fn().mockResolvedValue({ id: 'db_user_1' }),
}))
vi.mock('@/services/user-preference.service', () => ({
  updatePreferenceOnSatisfied: vi.fn(),
}))
vi.mock('@/services/storage/r2', () => ({
  fetchAsBuffer: vi.fn(),
  uploadToR2: vi.fn(),
}))
vi.mock('@/services/image/image-edit.service', () => ({
  upscaleImage: vi.fn(),
}))

import sharp from 'sharp'

import { evaluateGeneration } from '@/services/generation-evaluator.service'
import { inspect3DSourceImageQuality } from '@/services/image/image-3d-prep.service'
import { fetchAsBuffer } from '@/services/storage/r2'

const EVALUATION_JSON = JSON.stringify({
  subjectMatch: 8,
  styleMatch: 8,
  compositionMatch: 8,
  artifactScore: 9,
  promptAdherence: 8,
  overall: 8,
  detectedIssues: [],
  suggestedFixes: [],
})

/**
 * The user's only text key is one of these. With no apiKeyId the route
 * auto-fallback lands on it, so it has to be able to read the image.
 */
const ONLY_KEY_CASES = [
  {
    adapterType: AI_ADAPTER_TYPES.ANTHROPIC,
    respond: (text: string) => ({
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    }),
    imageParts: (body: Record<string, unknown>) =>
      (body.messages as Array<{ content: Array<{ type: string }> }>)[0].content,
    imagePartType: 'image',
    expectedModel: LLM_TEXT_MODEL_IDS.CLAUDE_OPUS_5_5,
  },
  {
    adapterType: AI_ADAPTER_TYPES.DEEPSEEK,
    respond: (text: string) => ({
      choices: [{ message: { content: text }, finish_reason: 'stop' }],
    }),
    imageParts: (body: Record<string, unknown>) =>
      (body.messages as Array<{ content: Array<{ type: string }> }>)[1].content,
    imagePartType: 'image_url',
    expectedModel: LLM_TEXT_MODEL_IDS.DEEPSEEK_FLASH,
  },
] as const

function readRequestBody(
  fetchMock: ReturnType<typeof vi.fn>,
): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
  if (typeof init?.body !== 'string') {
    throw new Error('Expected a JSON request body')
  }
  return JSON.parse(init.body) as Record<string, unknown>
}

describe.each(ONLY_KEY_CASES)(
  'only a $adapterType text key, no apiKeyId, image input',
  ({ adapterType, respond, imageParts, imagePartType, expectedModel }) => {
    let fetchMock: ReturnType<typeof vi.fn>

    function mockProviderReply(text: string) {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(respond(text)), { status: 200 }),
      )
    }

    beforeEach(() => {
      vi.clearAllMocks()
      mockKeyFindFirst.mockImplementation(
        async (args: { where: { adapterType?: string } }) =>
          args.where.adapterType === adapterType
            ? { id: 'key_1', adapterType, encryptedKey: 'enc', isActive: true }
            : null,
      )
      fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('generation evaluator sends the image and stores the evaluation', async () => {
      mockGenerationFindUnique.mockResolvedValue({
        id: 'gen_1',
        url: 'data:image/png;base64,iVBORw0KGgo=',
        prompt: 'a cat',
        snapshot: null,
        evaluation: null,
        userId: 'db_user_1',
      })
      mockProviderReply(EVALUATION_JSON)

      const result = await evaluateGeneration('clerk_1', 'gen_1')

      expect(result?.overall).toBe(8)
      const body = readRequestBody(fetchMock)
      expect(body.model).toBe(expectedModel)
      expect(imageParts(body)[0].type).toBe(imagePartType)
    })

    it('3D source semantic inspection sends the image and reads the issues', async () => {
      const png = await sharp({
        create: {
          width: 1024,
          height: 1024,
          channels: 4,
          background: { r: 1, g: 2, b: 3, alpha: 1 },
        },
      })
        .png()
        .toBuffer()
      vi.mocked(fetchAsBuffer).mockResolvedValue({
        buffer: png,
        mimeType: 'image/png',
      })
      mockProviderReply('{"issues":["busy_background"]}')

      const report = await inspect3DSourceImageQuality(
        'https://cdn.test/a.png',
        { userId: 'db_user_1' },
      )

      expect(report.blockingIssues).toEqual(['busy_background'])
      const body = readRequestBody(fetchMock)
      expect(body.model).toBe(expectedModel)
      expect(imageParts(body)[0].type).toBe(imagePartType)
    })
  },
)
