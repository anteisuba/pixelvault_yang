import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

function readMetaImage(html: string): string {
  const tags = html.match(/<meta\s+[^>]*>/gi) ?? []

  for (const key of ['og:image', 'twitter:image']) {
    const tag = tags.find((candidate) => candidate.toLowerCase().includes(key))
    const content = tag?.match(/content=["']([^"']+)["']/i)?.[1]
    if (content) return content.replaceAll('&amp;', '&')
  }

  return ''
}

async function main() {
  const { getAvailableModels } = await import('../src/constants/models')

  const results = await Promise.all(
    getAvailableModels().map(async (model) => {
      if (!model.officialUrl) {
        return [model.id, 'NO_URL', ''] as const
      }

      try {
        const response = await fetch(model.officialUrl, {
          redirect: 'follow',
          headers: { 'user-agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(15_000),
        })
        const html = await response.text()
        return [model.id, String(response.status), readMetaImage(html)] as const
      } catch (error) {
        return [
          model.id,
          'ERROR',
          error instanceof Error ? error.message : String(error),
        ] as const
      }
    }),
  )

  for (const result of results) {
    console.log(result.join('\t'))
  }
}

void main()
