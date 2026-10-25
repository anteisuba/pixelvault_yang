/**
 * 把 `DanbooruTagName` 整张表算进语义检索（`workers/semantic-index`），标签库与助手查标签才能按意思找。
 *
 * Usage:
 *   npx tsx --conditions=react-server --tsconfig tsconfig.json \
 *     scripts/index-danbooru-tag-meanings.ts                 # 默认只出报告，不写
 *   … --apply               # ⚠ 写进线上向量库（SEMANTIC_INDEX_URL / SEMANTIC_INDEX_TOKEN）
 *   … --apply --from <tag>  # 中途断了：从这个 tag（按名字排序）接着写
 *
 * ⚠ `--conditions=react-server` 不是装饰：`semantic-search.service` 顶着 `import 'server-only'`。
 *
 * 什么时候跑：首次上线一次；`import-danbooru-tag-names.ts --apply` 重新导入之后再跑一次。
 * 重跑安全：同一个 tag 覆盖写。14.8 万条约 450 万 token，Workers AI 约 $0.05。
 * 删掉的 tag 不会从向量库里消失（重新导入只增不减时无所谓）；要清就新建一个库整份重算。
 */
import process from 'node:process'

const PAGE = 5000

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const fromIndex = process.argv.indexOf('--from')
  let cursor = fromIndex > 0 ? (process.argv[fromIndex + 1] ?? '') : ''

  const { db } = await import('../src/lib/db')
  const { SEMANTIC_SEARCH } = await import('../src/constants/semantic-search')
  const { danbooruTagMeaningText } =
    await import('../src/lib/danbooru-tag-meaning')
  const { storeByMeaning } =
    await import('../src/services/semantic-search.service')

  const total = await db.danbooruTagName.count({
    where: { tag: { gt: cursor } },
  })
  console.log(
    `要算 ${total} 个标签${cursor ? `（从 ${cursor} 之后）` : ''}${apply ? '' : ' · 没写（加 --apply 才写）'}`,
  )
  let done = 0
  for (;;) {
    const rows = await db.danbooruTagName.findMany({
      where: { tag: { gt: cursor } },
      orderBy: { tag: 'asc' },
      take: PAGE,
      select: {
        tag: true,
        category: true,
        count: true,
        zh: true,
        ja: true,
        zhNote: true,
      },
    })
    if (!rows.length) break
    const items = rows.map((row) => ({
      kind: SEMANTIC_SEARCH.KINDS.DANBOORU_TAG,
      key: row.tag,
      text: danbooruTagMeaningText(row),
      meta: { category: row.category, count: row.count },
    }))
    if (!apply) {
      console.log(
        items
          .slice(0, 3)
          .map((item) => item.text)
          .join('\n'),
      )
      break
    }
    await storeByMeaning(items)
    done += rows.length
    cursor = rows[rows.length - 1].tag
    console.log(`${done} / ${total}（到 ${cursor}）`)
  }
  await db.$disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
