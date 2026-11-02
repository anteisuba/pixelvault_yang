/** 评测取 key：只读这位创作者那把 Anthropic key 的密文（Neon 的 SQL over HTTP）。⛔ 不打印。 */
export async function fetchEncryptedKey(userId: string): Promise<string> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  const response = await globalThis.fetch(`https://${new URL(url).host}/sql`, {
    method: 'POST',
    headers: { 'Neon-Connection-String': url },
    body: JSON.stringify({
      query: `select "encryptedKey" from "UserApiKey" where "userId" = $1 and "adapterType" = 'anthropic' and "isActive" order by "createdAt" desc limit 1`,
      params: [userId],
    }),
  })
  const { rows } = (await response.json()) as {
    rows: { encryptedKey: string }[]
  }
  if (!rows[0]) throw new Error('no active anthropic key for this creator')
  return rows[0].encryptedKey
}
