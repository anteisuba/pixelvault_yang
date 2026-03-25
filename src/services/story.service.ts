import 'server-only'

import { db } from '@/lib/db'
import type { StoryRecord, StoryListItem, NarrativeTone } from '@/types'
import {
  llmTextCompletion,
  resolveLlmTextRoute,
} from '@/services/llm-text.service'
import { ensureUser } from '@/services/user.service'

// ─── Narrative Prompts ───────────────────────────────────────────

const TONE_SYSTEM_PROMPTS: Record<NarrativeTone, string> = {
  humorous: `You are a witty storyteller. Given a sequence of AI-generated image descriptions, create a humorous narrative that connects them into a fun, lighthearted story. For each image, provide a short caption (max 15 words, like a comic speech bubble) and a brief narration (1-2 sentences connecting to the next image). Return JSON array: [{"index": 0, "caption": "...", "narration": "..."}]`,

  dramatic: `You are a dramatic storyteller. Given a sequence of AI-generated image descriptions, create an intense, emotionally charged narrative. For each image, provide a dramatic caption (max 15 words) and a compelling narration (1-2 sentences). Return JSON array: [{"index": 0, "caption": "...", "narration": "..."}]`,

  poetic: `You are a poetic storyteller. Given a sequence of AI-generated image descriptions, create a lyrical, beautiful narrative with evocative language. For each image, provide a poetic caption (max 15 words) and a flowing narration (1-2 sentences). Return JSON array: [{"index": 0, "caption": "...", "narration": "..."}]`,

  adventure: `You are an adventure storyteller. Given a sequence of AI-generated image descriptions, create an exciting quest narrative with action and discovery. For each image, provide an adventurous caption (max 15 words) and an action-packed narration (1-2 sentences). Return JSON array: [{"index": 0, "caption": "...", "narration": "..."}]`,
}

// ─── Helpers ─────────────────────────────────────────────────────

function mapStory(story: {
  id: string
  title: string
  displayMode: string
  isPublic: boolean
  createdAt: Date
  updatedAt: Date
  panels: Array<{
    id: string
    generationId: string | null
    orderIndex: number
    caption: string | null
    narration: string | null
    generation: {
      id: string
      url: string
      prompt: string
      model: string
    } | null
  }>
}): StoryRecord {
  return {
    id: story.id,
    title: story.title,
    displayMode: story.displayMode,
    isPublic: story.isPublic,
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
    panels: story.panels.map((p) => ({
      id: p.id,
      generationId: p.generationId,
      orderIndex: p.orderIndex,
      caption: p.caption,
      narration: p.narration,
      generation: p.generation
        ? {
            id: p.generation.id,
            url: p.generation.url,
            prompt: p.generation.prompt,
            model: p.generation.model,
          }
        : null,
    })),
  }
}

const STORY_INCLUDE = {
  panels: {
    include: {
      generation: {
        select: { id: true, url: true, prompt: true, model: true },
      },
    },
    orderBy: { orderIndex: 'asc' as const },
  },
}

// ─── CRUD ────────────────────────────────────────────────────────

export async function createStory(
  clerkId: string,
  title: string,
  generationIds: string[],
): Promise<StoryRecord> {
  const dbUser = await ensureUser(clerkId)

  // Verify all generation IDs belong to this user
  const ownedCount = await db.generation.count({
    where: { id: { in: generationIds }, userId: dbUser.id },
  })
  if (ownedCount !== generationIds.length) {
    throw new Error('One or more generations not found or not owned by you')
  }

  const story = await db.story.create({
    data: {
      userId: dbUser.id,
      title,
      panels: {
        create: generationIds.map((genId, index) => ({
          generationId: genId,
          orderIndex: index,
        })),
      },
    },
    include: STORY_INCLUDE,
  })

  return mapStory(story)
}

export async function getStoryById(
  storyId: string,
  clerkId: string,
): Promise<StoryRecord | null> {
  const dbUser = await ensureUser(clerkId)

  const story = await db.story.findUnique({
    where: { id: storyId },
    include: STORY_INCLUDE,
  })

  if (!story || story.userId !== dbUser.id) return null
  return mapStory(story)
}

/**
 * Get a public story by ID (no auth required).
 * Returns null if the story does not exist or is not public.
 */
export async function getPublicStoryById(
  storyId: string,
): Promise<StoryRecord | null> {
  const story = await db.story.findUnique({
    where: { id: storyId },
    include: STORY_INCLUDE,
  })

  if (!story || !story.isPublic) return null
  return mapStory(story)
}

export async function listStories(clerkId: string): Promise<StoryListItem[]> {
  const dbUser = await ensureUser(clerkId)

  const stories = await db.story.findMany({
    where: { userId: dbUser.id },
    include: {
      panels: {
        include: {
          generation: { select: { url: true } },
        },
        orderBy: { orderIndex: 'asc' },
        take: 1,
      },
      _count: { select: { panels: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return stories.map((s) => ({
    id: s.id,
    title: s.title,
    displayMode: s.displayMode,
    isPublic: s.isPublic,
    panelCount: s._count.panels,
    coverImageUrl: s.panels[0]?.generation?.url ?? null,
    createdAt: s.createdAt,
  }))
}

export async function updateStory(
  storyId: string,
  clerkId: string,
  data: { title?: string; displayMode?: string; isPublic?: boolean },
): Promise<StoryRecord> {
  const dbUser = await ensureUser(clerkId)

  const existing = await db.story.findUnique({ where: { id: storyId } })
  if (!existing || existing.userId !== dbUser.id) {
    throw new Error('Story not found')
  }

  const story = await db.story.update({
    where: { id: storyId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.displayMode !== undefined && { displayMode: data.displayMode }),
      ...(data.isPublic !== undefined && { isPublic: data.isPublic }),
    },
    include: STORY_INCLUDE,
  })

  return mapStory(story)
}

export async function deleteStory(
  storyId: string,
  clerkId: string,
): Promise<void> {
  const dbUser = await ensureUser(clerkId)

  const existing = await db.story.findUnique({ where: { id: storyId } })
  if (!existing || existing.userId !== dbUser.id) {
    throw new Error('Story not found')
  }

  await db.story.delete({ where: { id: storyId } })
}

export async function reorderPanels(
  storyId: string,
  clerkId: string,
  panelIds: string[],
): Promise<StoryRecord> {
  const dbUser = await ensureUser(clerkId)

  const existing = await db.story.findUnique({ where: { id: storyId } })
  if (!existing || existing.userId !== dbUser.id) {
    throw new Error('Story not found')
  }

  // Update orderIndex for each panel using a unique temporary offset to avoid constraint conflicts
  const offset = 10000
  for (let i = 0; i < panelIds.length; i++) {
    await db.storyPanel.update({
      where: { id: panelIds[i] },
      data: { orderIndex: offset + i },
    })
  }

  for (let i = 0; i < panelIds.length; i++) {
    await db.storyPanel.update({
      where: { id: panelIds[i] },
      data: { orderIndex: i },
    })
  }

  const story = await db.story.findUnique({
    where: { id: storyId },
    include: STORY_INCLUDE,
  })

  return mapStory(story!)
}

// ─── Narrative Generation ────────────────────────────────────────

export async function generateNarrative(
  storyId: string,
  clerkId: string,
  tone: NarrativeTone,
): Promise<Array<{ id: string; narration: string; caption: string }>> {
  const dbUser = await ensureUser(clerkId)

  const story = await db.story.findUnique({
    where: { id: storyId },
    include: {
      panels: {
        include: {
          generation: { select: { prompt: true } },
        },
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  if (!story || story.userId !== dbUser.id) {
    throw new Error('Story not found')
  }

  const route = await resolveLlmTextRoute(dbUser.id)
  const imageDescriptions = story.panels
    .map(
      (p, i) => `Image ${i + 1}: ${p.generation?.prompt ?? 'No description'}`,
    )
    .join('\n')

  const rawResponse = await llmTextCompletion({
    systemPrompt: TONE_SYSTEM_PROMPTS[tone],
    userPrompt: `Here are the image descriptions in order:\n\n${imageDescriptions}\n\nGenerate the narrative JSON array.`,
    adapterType: route.adapterType,
    providerConfig: route.providerConfig,
    apiKey: route.apiKey,
  })

  // Parse JSON from response
  const jsonMatch = rawResponse.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('Failed to parse narrative response')

  const narrativeItems = JSON.parse(jsonMatch[0]) as Array<{
    index: number
    caption: string
    narration: string
  }>

  // Update panels with generated narrative
  const results: Array<{ id: string; narration: string; caption: string }> = []

  for (const item of narrativeItems) {
    const panel = story.panels[item.index]
    if (!panel) continue

    await db.storyPanel.update({
      where: { id: panel.id },
      data: {
        caption: item.caption,
        narration: item.narration,
      },
    })

    results.push({
      id: panel.id,
      narration: item.narration,
      caption: item.caption,
    })
  }

  return results
}
