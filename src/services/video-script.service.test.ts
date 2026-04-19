import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ───────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  db: {
    videoScript: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    videoScriptScene: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (cb: unknown) => {
      if (typeof cb === 'function') {
        return (cb as (tx: unknown) => unknown)({
          videoScriptScene: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
            createMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
          videoScript: {
            update: vi.fn(),
          },
        })
      }
    }),
    generation: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/with-retry', () => ({
  withRetry: vi.fn(
    async (fn: () => Promise<unknown>, opts?: { maxAttempts?: number }) => {
      const max = opts?.maxAttempts ?? 1
      let lastErr: unknown
      for (let i = 0; i < max; i++) {
        try {
          return await fn()
        } catch (e) {
          lastErr = e
        }
      }
      throw lastErr
    },
  ),
}))

vi.mock('@/services/apiKey.service', () => ({
  findActiveKeyForAdapter: vi.fn(),
}))

vi.mock('@/lib/platform-keys', () => ({
  getSystemApiKey: vi.fn(() => null),
}))

vi.mock('@/services/llm-text.service', () => ({
  llmTextCompletion: vi.fn(),
}))

// ─── Imports (after mocks) ───────────────────────────────────────

import { db } from '@/lib/db'
import { findActiveKeyForAdapter } from '@/services/apiKey.service'
import { llmTextCompletion } from '@/services/llm-text.service'
import {
  confirmScript,
  deleteScript,
  generateScript,
  getById,
  listByUser,
  updateScenes,
  VideoScriptNotFoundError,
} from '@/services/video-script.service'
import { AI_ADAPTER_TYPES } from '@/constants/providers'
import {
  VideoScriptSceneStatus,
  VideoScriptStatus,
} from '@/lib/generated/prisma/client'
import type { CreateVideoScriptInput } from '@/types/video-script'

// ─── Fixtures ────────────────────────────────────────────────────

const USER_ID = 'user-1'
const SCRIPT_ID = 'script-1'

const VALID_INPUT: CreateVideoScriptInput = {
  topic: 'A cat learns to fly',
  targetDuration: 30,
  consistencyMode: 'first_frame_ref',
  videoModelId: 'seedance-2-fast',
}

const VALID_LLM_OUTPUT_5_SCENES = JSON.stringify({
  scenes: [
    {
      orderIndex: 0,
      duration: 6,
      cameraShot: 'wide',
      action: 'A small orange cat stands on a hilltop at sunrise.',
      dialogue: null,
      transition: 'cut',
    },
    {
      orderIndex: 1,
      duration: 6,
      cameraShot: 'medium',
      action: 'The cat eyes a bird gliding overhead.',
      dialogue: null,
      transition: 'cut',
    },
    {
      orderIndex: 2,
      duration: 6,
      cameraShot: 'close-up',
      action: 'Cat flaps its paws experimentally.',
      dialogue: null,
      transition: 'cut',
    },
    {
      orderIndex: 3,
      duration: 6,
      cameraShot: 'wide',
      action: 'Cat leaps off the hill, paws outstretched.',
      dialogue: null,
      transition: 'cut',
    },
    {
      orderIndex: 4,
      duration: 6,
      cameraShot: 'establishing',
      action: 'Cat glides over the valley, amazed.',
      dialogue: null,
      transition: 'cut',
    },
  ],
})

function fakeKey(adapterType: AI_ADAPTER_TYPES) {
  return {
    id: `key-${adapterType}`,
    modelId: 'some-model',
    adapterType,
    providerConfig: { label: adapterType, baseUrl: 'https://x' },
    label: adapterType,
    keyValue: 'sk-test',
  }
}

function fakeDbScript(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SCRIPT_ID,
    userId: USER_ID,
    topic: VALID_INPUT.topic,
    targetDuration: 30,
    totalScenes: 5,
    status: VideoScriptStatus.DRAFT,
    consistencyMode: 'first_frame_ref',
    characterCardId: null,
    styleCardId: null,
    videoModelId: 'seedance-2-fast',
    finalVideoUrl: null,
    createdAt: new Date('2026-04-19'),
    updatedAt: new Date('2026-04-19'),
    scenes: Array.from({ length: 5 }).map((_, i) => ({
      id: `scene-${i}`,
      scriptId: SCRIPT_ID,
      orderIndex: i,
      duration: 6,
      cameraShot: 'wide',
      action: `action ${i}`,
      dialogue: null,
      transition: 'cut',
      frameGenerationId: null,
      clipGenerationId: null,
      status: VideoScriptSceneStatus.PENDING,
      errorMessage: null,
      createdAt: new Date('2026-04-19'),
      updatedAt: new Date('2026-04-19'),
    })),
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('video-script.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // default: Gemini key available, OpenAI absent
    vi.mocked(findActiveKeyForAdapter).mockImplementation(
      async (_u, adapter) =>
        adapter === AI_ADAPTER_TYPES.GEMINI ? fakeKey(adapter) : null,
    )
    vi.mocked(db.videoScript.create).mockResolvedValue(fakeDbScript() as never)
  })

  describe('generateScript', () => {
    it('succeeds on first Gemini call, persists VideoScript + scenes', async () => {
      vi.mocked(llmTextCompletion).mockResolvedValueOnce(
        VALID_LLM_OUTPUT_5_SCENES,
      )

      const result = await generateScript(VALID_INPUT, USER_ID)

      expect(llmTextCompletion).toHaveBeenCalledTimes(1)
      expect(db.videoScript.create).toHaveBeenCalledTimes(1)
      expect(result.id).toBe(SCRIPT_ID)
      expect(result.scenes).toHaveLength(5)
      expect(result.status).toBe(VideoScriptStatus.DRAFT)
    })

    it('strips markdown code fences from LLM output', async () => {
      vi.mocked(llmTextCompletion).mockResolvedValueOnce(
        '```json\n' + VALID_LLM_OUTPUT_5_SCENES + '\n```',
      )
      const result = await generateScript(VALID_INPUT, USER_ID)
      expect(result.scenes).toHaveLength(5)
    })

    it('rejects non-JSON LLM output', async () => {
      vi.mocked(llmTextCompletion).mockResolvedValueOnce(
        'I apologize, but I cannot help with this.',
      )
      await expect(generateScript(VALID_INPUT, USER_ID)).rejects.toThrow(
        /not valid JSON|All LLM providers failed/,
      )
    })

    it('rejects scene count mismatch', async () => {
      const wrong = JSON.stringify({
        scenes: Array.from({ length: 3 }).map((_, i) => ({
          orderIndex: i,
          duration: 6,
          cameraShot: 'wide',
          action: `action ${i}`,
          transition: 'cut',
        })),
      })
      vi.mocked(llmTextCompletion).mockResolvedValueOnce(wrong)
      await expect(generateScript(VALID_INPUT, USER_ID)).rejects.toThrow(
        /3 scenes, expected 5|All LLM providers failed/,
      )
    })

    it('rejects when scene durations do not sum to target', async () => {
      const bad = JSON.stringify({
        scenes: Array.from({ length: 5 }).map((_, i) => ({
          orderIndex: i,
          duration: 7, // 5*7 = 35 ≠ 30
          cameraShot: 'wide',
          action: 'a',
          transition: 'cut',
        })),
      })
      vi.mocked(llmTextCompletion).mockResolvedValueOnce(bad)
      await expect(generateScript(VALID_INPUT, USER_ID)).rejects.toThrow(
        /sum to 35s, expected 30s|All LLM providers failed/,
      )
    })

    it('VS9: falls back to OpenAI when Gemini fails, succeeds', async () => {
      vi.mocked(findActiveKeyForAdapter).mockImplementation(async (_u, a) =>
        fakeKey(a),
      )
      vi.mocked(llmTextCompletion)
        .mockRejectedValueOnce(new Error('gemini down'))
        .mockRejectedValueOnce(new Error('gemini down'))
        .mockResolvedValueOnce(VALID_LLM_OUTPUT_5_SCENES)

      const result = await generateScript(VALID_INPUT, USER_ID)
      expect(llmTextCompletion).toHaveBeenCalledTimes(3)
      expect(result.scenes).toHaveLength(5)
    })

    it('VS9: throws when both providers fail', async () => {
      vi.mocked(findActiveKeyForAdapter).mockImplementation(async (_u, a) =>
        fakeKey(a),
      )
      vi.mocked(llmTextCompletion).mockRejectedValue(new Error('provider down'))

      await expect(generateScript(VALID_INPUT, USER_ID)).rejects.toThrow(
        /All LLM providers failed/,
      )
    })

    it('rejects input when character_card mode has no characterCardId', async () => {
      const invalid = {
        ...VALID_INPUT,
        consistencyMode: 'character_card' as const,
      }
      await expect(generateScript(invalid, USER_ID)).rejects.toThrow(
        /characterCardId is required/,
      )
    })
  })

  describe('updateScenes', () => {
    it('rejects with VideoScriptNotFoundError when user does not own script', async () => {
      vi.mocked(db.videoScript.findFirst).mockResolvedValueOnce(null)
      await expect(
        updateScenes(SCRIPT_ID, [], 'other-user'),
      ).rejects.toBeInstanceOf(VideoScriptNotFoundError)
    })

    it('replaces scenes for owned script', async () => {
      vi.mocked(db.videoScript.findFirst).mockResolvedValueOnce({
        id: SCRIPT_ID,
      } as never)

      const mockTxUpdate = vi.fn().mockResolvedValue(fakeDbScript())
      vi.mocked(db.$transaction).mockImplementationOnce(async (cb) => {
        if (typeof cb === 'function') {
          return (cb as (tx: unknown) => unknown)({
            videoScriptScene: {
              deleteMany: vi.fn().mockResolvedValue({ count: 5 }),
              createMany: vi.fn().mockResolvedValue({ count: 5 }),
            },
            videoScript: { update: mockTxUpdate },
          })
        }
      })

      const newScenes = Array.from({ length: 5 }).map((_, i) => ({
        orderIndex: i,
        duration: 6,
        cameraShot: 'wide' as const,
        action: `new action ${i}`,
        dialogue: null,
        transition: 'cut' as const,
      }))

      const result = await updateScenes(SCRIPT_ID, newScenes, USER_ID)
      expect(mockTxUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SCRIPT_ID } }),
      )
      expect(result.scenes).toHaveLength(5)
    })
  })

  describe('confirmScript', () => {
    it('advances status to SCRIPT_READY when owned', async () => {
      vi.mocked(db.videoScript.findFirst).mockResolvedValueOnce({
        id: SCRIPT_ID,
      } as never)
      vi.mocked(db.videoScript.update).mockResolvedValueOnce(
        fakeDbScript({ status: VideoScriptStatus.SCRIPT_READY }) as never,
      )

      const result = await confirmScript(SCRIPT_ID, USER_ID)
      expect(result.status).toBe(VideoScriptStatus.SCRIPT_READY)
      expect(db.videoScript.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: SCRIPT_ID },
          data: { status: VideoScriptStatus.SCRIPT_READY },
        }),
      )
    })

    it('throws VideoScriptNotFoundError when not owned', async () => {
      vi.mocked(db.videoScript.findFirst).mockResolvedValueOnce(null)
      await expect(confirmScript(SCRIPT_ID, USER_ID)).rejects.toBeInstanceOf(
        VideoScriptNotFoundError,
      )
    })
  })

  describe('listByUser', () => {
    it('returns paginated scripts with total', async () => {
      vi.mocked(db.videoScript.findMany).mockResolvedValueOnce([
        fakeDbScript(),
      ] as never)
      vi.mocked(db.videoScript.count).mockResolvedValueOnce(1)

      const result = await listByUser(USER_ID, { page: 1, size: 20 })
      expect(result.scripts).toHaveLength(1)
      expect(result.total).toBe(1)
      expect(db.videoScript.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID },
          skip: 0,
          take: 20,
        }),
      )
    })
  })

  describe('getById', () => {
    it('returns script when owned', async () => {
      vi.mocked(db.videoScript.findFirst).mockResolvedValueOnce(
        fakeDbScript() as never,
      )
      const result = await getById(SCRIPT_ID, USER_ID)
      expect(result.id).toBe(SCRIPT_ID)
    })

    it('throws VideoScriptNotFoundError when not owned', async () => {
      vi.mocked(db.videoScript.findFirst).mockResolvedValueOnce(null)
      await expect(getById(SCRIPT_ID, USER_ID)).rejects.toBeInstanceOf(
        VideoScriptNotFoundError,
      )
    })
  })

  describe('deleteScript (VS10)', () => {
    it('hard-deletes VideoScript and does NOT touch Generation records', async () => {
      vi.mocked(db.videoScript.findFirst).mockResolvedValueOnce({
        id: SCRIPT_ID,
      } as never)
      vi.mocked(db.videoScript.delete).mockResolvedValueOnce(
        fakeDbScript() as never,
      )

      await deleteScript(SCRIPT_ID, USER_ID)

      expect(db.videoScript.delete).toHaveBeenCalledWith({
        where: { id: SCRIPT_ID },
      })
      // VS10 invariant: no calls against generation table from this path
      expect(db.generation.findMany).not.toHaveBeenCalled()
    })

    it('throws VideoScriptNotFoundError when not owned', async () => {
      vi.mocked(db.videoScript.findFirst).mockResolvedValueOnce(null)
      await expect(deleteScript(SCRIPT_ID, USER_ID)).rejects.toBeInstanceOf(
        VideoScriptNotFoundError,
      )
      expect(db.videoScript.delete).not.toHaveBeenCalled()
    })
  })
})
