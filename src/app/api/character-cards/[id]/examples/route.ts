import 'server-only'

import { createApiPostByIdRoute } from '@/lib/api-route-factory'
import { addCharacterExample } from '@/features/cards/server'
import { CharacterExampleAddSchema } from '@/types'

export const POST = createApiPostByIdRoute({
  schema: CharacterExampleAddSchema,
  routeName: 'POST /api/character-cards/[id]/examples',
  handler: async (clerkId, id, data) => addCharacterExample(clerkId, id, data),
})
