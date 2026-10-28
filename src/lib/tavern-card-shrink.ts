import { TAVERN_CARD } from '@/constants/cards/tavern-card'
import { compressImageToLimit } from '@/lib/compress-image'
import { addPngTextChunk } from '@/lib/png-text-chunks'
import { findTavernCardChunk } from '@/lib/tavern-card'

/**
 * **超过上限的 PNG 卡先在浏览器里缩**（owner 2026-10-28：chub 的高清立绘卡常过 3 MB）：
 * 拿出装卡的文本块 → 图按剩下的余量缩（`compressImageToLimit`，PNG 只缩尺寸）→ 文本块
 * 原样写回缩好的图。服务端照旧当一张 PNG 卡收，⛔ 另开接口。
 *
 * 结果：`file` = 缩好的卡；`notACard` = 图里没有卡；`tooLarge` = 图怎么缩都塞不进。
 */
export type ShrinkTavernCardResult =
  | { kind: 'file'; file: File }
  | { kind: 'notACard' }
  | { kind: 'tooLarge' }

export async function shrinkTavernCardPng(
  file: File,
): Promise<ShrinkTavernCardResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const chunk = findTavernCardChunk(bytes)
  if (!chunk) return { kind: 'notACard' }

  // 文本块头尾（长度 · 类型 · 关键字 · \0 · CRC）一共不到 64 字节。文本块本身最多 2 MB
  // 才认得出（`png-text-chunks`），所以图总还有 1 MB 上下的余量。
  const imageBudget = TAVERN_CARD.MAX_FILE_BYTES - chunk.payload.length - 64

  try {
    const { file: image } = await compressImageToLimit(file, {
      maxBytes: imageBudget,
    })
    const shrunk = addPngTextChunk(
      new Uint8Array(await image.arrayBuffer()),
      chunk.keyword,
      chunk.payload,
    )
    return {
      kind: 'file',
      file: new File([Uint8Array.from(shrunk)], file.name, {
        type: 'image/png',
      }),
    }
  } catch {
    return { kind: 'tooLarge' }
  }
}
