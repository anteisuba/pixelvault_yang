'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
} from 'react'

import { cn } from '@/lib/utils'

/** A reference name the editor should render as an atomic chip, with its kind
 *  driving the chip's port color + thumbnail shape (§9 V2-2). */
export interface MentionToken {
  name: string
  /**
   * `text` 是**第二个物种**（阶段 4，契约 §5.2）：它引用的是一个**文本节点**，
   * 发送时在胶囊所在位置展开成那段文字；其余六种引用的是二进制素材，只落槽、
   * 正文里不留字。两者在正文里的前缀也不同（`▤` vs `@`），见 `parseMentions`。
   */
  kind:
    | 'character'
    | 'background'
    | 'shot'
    | 'closeup'
    | 'voice'
    | 'video'
    | 'text'
  /** 16px thumbnail embedded in the chip — the node's image / videoThumbnail,
   *  or the voice cover. Falls back to a flat port-color chip when absent. */
  thumbnailUrl?: string
  /**
   * 胶囊上**显示**的文字 —— 位置标注（「图 3」），缺省才退回 `@名字`。
   *
   * ⚠ 显示与存储故意分开，两者各司其职：
   *   · **存储**仍是 `@名字`（序列化读 `data-mention` 属性，不看这里）——
   *     锚点必须稳，不能随连线增删而变。
   *   · **显示**用槽位序号 —— 它和发出去的 `@ImageN` 是同一个位置，用户看到的
   *     和模型收到的对得上；重名素材（三个「镜头1」）在正文里也终于分得清。
   *
   * 序号由调用方按当前载荷实时算（`sendPreview.images[].index`），槽位增删后
   * 下一次渲染自动更新，不会错位。
   */
  slotLabel?: string
}

export interface MentionInputHandle {
  /**
   * Insert an atomic chip at the caret (falls back to the end).
   * `kind` 决定前缀：`text` → `▤名字`（文本引用胶囊），其余 → `@名字`（素材引用）。
   * 省略时按素材处理，既有调用方不受影响。
   */
  insertToken(name: string, kind?: MentionToken['kind']): void
  /** Insert plain text at the caret — used by the 运镜语法 chips (§5 L1), which
   *  are film-language phrases, not @tokens. */
  insertText(text: string): void
  focus(): void
  getBoundingClientRect(): DOMRect | undefined
}

/** 素材引用的前缀。 */
const MENTION_PREFIX = '@'
/** 文本引用胶囊的前缀 —— 与 `lib/node-text-capsule` 的 `TEXT_CAPSULE_PREFIX` 同一个字。 */
const CAPSULE_PREFIX = '▤'

export type MentionPrefix = typeof MENTION_PREFIX | typeof CAPSULE_PREFIX

/**
 * 前缀**由 kind 推出**，调用方不自己拼 —— 两处各拼一遍迟早会分岔，而分岔的后果
 * 是序列化出来的字面量与 `parseMentions` 认的对不上，胶囊就变成一段裸文字。
 */
export function mentionPrefixOf(kind: MentionToken['kind']): MentionPrefix {
  return kind === 'text' ? CAPSULE_PREFIX : MENTION_PREFIX
}

type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'token'; name: string; prefix: MentionPrefix }

/**
 * Pure: split a plain-text prompt into text / token segments. A token is `@`
 * followed by one of `knownNames`, matched LITERALLY (longest match wins) so it
 * works for CJK names with no word boundaries. An `@` not followed by a known
 * name stays as text — this is what lets a renamed reference degrade to plain
 * text instead of a stale chip.
 *
 * 阶段 4 起还认第二种前缀 `▤`（`capsuleNames`）—— **文本引用胶囊**。两套分开是
 * 因为阶段 1 之后正文里的 `@xxx` 已经可能是**用户自己打的字**（素材 `@` 只落槽
 * 不留字），共用一个前缀会互相误伤。省略 `capsuleNames` 时行为与从前**逐字节
 * 一致**，所有既有调用方不受影响。
 */
export function parseMentions(
  value: string,
  knownNames: readonly string[],
  capsuleNames: readonly string[] = [],
): MentionSegment[] {
  // Longest first so "@角色A2" matches before "@角色A".
  const byPrefix: [MentionPrefix, string[]][] = [
    [
      MENTION_PREFIX,
      [...knownNames].filter(Boolean).sort((a, b) => b.length - a.length),
    ],
    [
      CAPSULE_PREFIX,
      [...capsuleNames].filter(Boolean).sort((a, b) => b.length - a.length),
    ],
  ]
  const segments: MentionSegment[] = []
  let text = ''
  let i = 0
  while (i < value.length) {
    const entry = byPrefix.find(([prefix]) => value[i] === prefix)
    if (entry) {
      const [prefix, names] = entry
      const match = names.find(
        (name) => value.slice(i + 1, i + 1 + name.length) === name,
      )
      if (match) {
        if (text) {
          segments.push({ type: 'text', text })
          text = ''
        }
        segments.push({ type: 'token', name: match, prefix })
        i += 1 + match.length
        continue
      }
    }
    text += value[i]
    i += 1
  }
  if (text) segments.push({ type: 'text', text })
  return segments
}

const CHIP_FILL: Record<MentionToken['kind'], string> = {
  character: 'bg-node-port-character/25',
  background: 'bg-node-port-background/25',
  shot: 'bg-node-port-image/25',
  closeup: 'bg-node-port-image/25',
  voice: 'bg-node-port-voice/25',
  video: 'bg-node-port-video/25',
  // 文本没有端口色 —— 它不是素材，用中性面，靠 ▤ 字形与其余六种分开。
  text: 'bg-node-panel-inner',
}
// The embedded 16px thumbnail's shape encodes the kind (§9 V2-2 token anatomy):
// circle = 角色/配音 (identity), square = 图/镜头/场景/视频. Placeholder tint uses
// the port color at higher opacity so a thumbless reference still reads as its kind.
const THUMB_SHAPE: Record<MentionToken['kind'], string> = {
  character: 'rounded-full',
  background: 'rounded-sm',
  shot: 'rounded-sm',
  closeup: 'rounded-sm',
  voice: 'rounded-full',
  video: 'rounded-sm',
  text: 'rounded-sm',
}
const THUMB_FILL: Record<MentionToken['kind'], string> = {
  character: 'bg-node-port-character/70',
  background: 'bg-node-port-background/70',
  shot: 'bg-node-port-image/70',
  closeup: 'bg-node-port-image/70',
  voice: 'bg-node-port-voice/70',
  video: 'bg-node-port-video/70',
  text: 'bg-node-subtle/40',
}
const CHIP_BASE =
  'mention-chip mx-0.5 inline-flex select-none items-center gap-1 rounded-full py-0.5 align-baseline text-node-foreground'
const MENTION_ATTR = 'data-mention'
/** @ 下拉一次最多列几条 —— 再多就该靠打字收窄，滚动一长列比重打两个字慢。 */
const MENTION_MAX_VISIBLE = 8
const SVG_NS = 'http://www.w3.org/2000/svg'

/** A centered ▶ overlay — the shape language marks a video reference apart from
 *  a still image (both square). White + drop-shadow so it reads on any frame. */
function buildPlayOverlay(doc: Document): HTMLSpanElement {
  const overlay = doc.createElement('span')
  overlay.className =
    'pointer-events-none absolute inset-0 flex items-center justify-center text-white drop-shadow'
  const svg = doc.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 10 10')
  svg.setAttribute('class', 'size-2.5')
  const poly = doc.createElementNS(SVG_NS, 'polygon')
  poly.setAttribute('points', '3,2 3,8 8,5')
  poly.setAttribute('fill', 'currentColor')
  svg.appendChild(poly)
  overlay.appendChild(svg)
  return overlay
}

/** The 16px thumbnail that leads each chip: real image when we have one, else a
 *  flat port-color box. Contributes no text so the chip's textContent stays the
 *  clean `@name` (serialization + the atomic-delete contract are unaffected). */
function buildThumb(
  doc: Document,
  kind: MentionToken['kind'],
  thumbnailUrl: string | undefined,
): HTMLSpanElement {
  const thumb = doc.createElement('span')
  thumb.className = cn(
    'mention-chip-thumb relative flex size-4 shrink-0 items-center justify-center overflow-hidden',
    THUMB_SHAPE[kind],
    !thumbnailUrl && THUMB_FILL[kind],
  )
  if (thumbnailUrl) {
    const img = doc.createElement('img')
    img.src = thumbnailUrl
    img.alt = ''
    img.className = 'size-full object-cover'
    thumb.appendChild(img)
  }
  if (kind === 'video') thumb.appendChild(buildPlayOverlay(doc))
  return thumb
}

function buildChip(
  doc: Document,
  name: string,
  prefix: MentionPrefix,
  token: MentionToken | undefined,
): HTMLSpanElement {
  const kind = token?.kind
  const chip = doc.createElement('span')
  /**
   * ⚠ 属性里存的是**完整字面量**（含前缀），不是裸名字。
   * 阶段 4 加了第二种前缀之后，只存名字就没法还原它是 `@小林` 还是 `▤小林` ——
   * 而序列化、光标偏移、原子删除三处都靠这个属性算长度，还原错一个字符，
   * 光标就会错位。
   */
  chip.setAttribute(MENTION_ATTR, `${prefix}${name}`)
  chip.setAttribute('contenteditable', 'false')
  chip.className = cn(
    CHIP_BASE,
    kind ? CHIP_FILL[kind] : 'bg-node-panel-inner',
    kind ? 'pl-0.5 pr-1.5' : 'px-1.5',
  )
  if (kind) chip.appendChild(buildThumb(doc, kind, token?.thumbnailUrl))
  const label = doc.createElement('span')
  label.className = 'mention-chip-label leading-none'
  // 显示位置（「图 3」），存储仍是字面量 —— 见 `MentionToken.slotLabel`。
  label.textContent = token?.slotLabel ?? `${prefix}${name}`
  chip.appendChild(label)
  return chip
}

/** Render `value` into `el`, replacing its content. Token names → atomic chips,
 *  everything else → text nodes (newlines preserved via white-space: pre-wrap). */
function renderInto(
  el: HTMLElement,
  value: string,
  knownNames: readonly string[],
  capsuleNames: readonly string[],
  tokenByLiteral: ReadonlyMap<string, MentionToken>,
): void {
  const doc = el.ownerDocument
  el.replaceChildren()
  for (const segment of parseMentions(value, knownNames, capsuleNames)) {
    if (segment.type === 'text') {
      el.appendChild(doc.createTextNode(segment.text))
    } else {
      // ⚠ 按**字面量**查而不是按名字：一个文本节点和一个角色可以同名（「小林」），
      // 只按名字查会把 ▤小林 渲染成角色 chip。
      el.appendChild(
        buildChip(
          doc,
          segment.name,
          segment.prefix,
          tokenByLiteral.get(`${segment.prefix}${segment.name}`),
        ),
      )
    }
  }
}

/** Serialize the editor DOM back to a plain-text prompt: text nodes contribute
 *  their text, chips contribute `@name`, block boundaries / <br> contribute a
 *  newline. Inverse of `renderInto` for well-formed content. */
export function serializeEditor(el: HTMLElement): string {
  let out = ''
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? ''
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement
        if (element.hasAttribute(MENTION_ATTR)) {
          out += element.getAttribute(MENTION_ATTR) ?? ''
        } else if (element.tagName === 'BR') {
          out += '\n'
        } else {
          // A contentEditable-produced block wrapper (DIV/P): its start is a
          // new line unless we're at the very start.
          if (out && !out.endsWith('\n')) out += '\n'
          walk(element)
        }
      }
    })
  }
  walk(el)
  return out
}

/**
 * 光标在**序列化文本**里的字符偏移；光标不在编辑器内时返回 null。
 *
 * 遍历口径与 `serializeEditor` 逐条对齐（胶囊记 `@名字` 的长度、`<br>` 记一个
 * 换行、块级包装补换行），否则算出来的偏移会和 `value` 的下标对不上。
 */
function getCaretOffset(el: HTMLElement): number | null {
  const selection = el.ownerDocument.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!el.contains(range.endContainer)) return null

  let offset = 0
  let found = false
  const walk = (node: Node) => {
    if (found) return
    node.childNodes.forEach((child) => {
      if (found) return
      if (child === range.endContainer) {
        offset += range.endOffset
        found = true
        return
      }
      if (child.nodeType === Node.TEXT_NODE) {
        offset += child.textContent?.length ?? 0
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement
        if (element.hasAttribute(MENTION_ATTR)) {
          offset += (element.getAttribute(MENTION_ATTR) ?? '').length
        } else if (element.tagName === 'BR') {
          offset += 1
        } else {
          if (offset > 0) offset += 1
          walk(element)
        }
      }
    })
  }
  walk(el)
  return found ? offset : null
}

/**
 * 把光标放回**序列化文本**里的第 `offset` 个字符处。
 *
 * 胶囊是原子的：偏移落在它中间时靠到它后面 —— 光标不能停在一个不可编辑块内部。
 */
function setCaretOffset(el: HTMLElement, offset: number): void {
  const doc = el.ownerDocument
  const selection = doc.getSelection()
  if (!selection) return
  const range = doc.createRange()

  let remaining = offset
  let placed = false
  const walk = (node: Node) => {
    if (placed) return
    node.childNodes.forEach((child) => {
      if (placed) return
      if (child.nodeType === Node.TEXT_NODE) {
        const length = child.textContent?.length ?? 0
        if (remaining <= length) {
          range.setStart(child, remaining)
          placed = true
          return
        }
        remaining -= length
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement
        if (element.hasAttribute(MENTION_ATTR)) {
          const length = (element.getAttribute(MENTION_ATTR) ?? '').length
          if (remaining <= length) {
            range.setStartAfter(element)
            placed = true
            return
          }
          remaining -= length
        } else if (element.tagName === 'BR') {
          if (remaining <= 1) {
            range.setStartAfter(element)
            placed = true
            return
          }
          remaining -= 1
        } else {
          if (remaining > 0) remaining -= 1
          walk(element)
        }
      }
    })
  }
  walk(el)

  if (!placed) {
    // 偏移超出了内容（外部把正文改短了）—— 落到末尾，别把光标丢在开头。
    // ⚠ 优先落在最后一个**文本节点**里：`selectNodeContents` + collapse 会把
    // 光标停在元素层，那时 `endOffset` 是子节点索引而不是字符偏移，后续任何按
    // 字符算位置的代码都会读到一个语义不同的数。
    const lastText = (() => {
      const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let last: Text | null = null
      while (walker.nextNode()) last = walker.currentNode as Text
      return last
    })()
    if (lastText) {
      range.setStart(lastText, lastText.length)
    } else {
      range.selectNodeContents(el)
      range.collapse(false)
    }
  }
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

function insertNodeAtCaret(el: HTMLElement, node: Node): void {
  const doc = el.ownerDocument
  const selection = doc.getSelection()
  const win = doc.defaultView
  // Insert at the caret when it's inside the editor; otherwise append at the end.
  if (
    selection &&
    selection.rangeCount > 0 &&
    el.contains(selection.getRangeAt(0).commonAncestorContainer)
  ) {
    const range = selection.getRangeAt(0)
    range.deleteContents()
    range.insertNode(node)
    range.setStartAfter(node)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
  } else {
    el.appendChild(node)
    if (selection && win) {
      const range = doc.createRange()
      range.setStartAfter(node)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
    }
  }
}

/** 打 `@` 时可选的一个画布节点。 */
export interface MentionCandidate {
  /** 节点 id —— 父级拿它去连线。 */
  id: string
  /** 插进正文的名字（不带 `@`）。 */
  name: string
  /** 分组用的类型名，已本地化；不给则不分组。 */
  groupLabel?: string
}

/** 光标前的 `@查询` —— 没在写 @ 时为 null。 */
interface MentionQuery {
  text: string
  /** 已经打出来的字符数（含 `@`），选中候选时要把它们删掉。 */
  length: number
}

export interface MentionInputProps {
  value: string
  onValueChange(value: string): void
  tokens: readonly MentionToken[]
  placeholder?: string
  className?: string
  'aria-label'?: string
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
  onKeyUp?: KeyboardEventHandler<HTMLDivElement>
  onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>
  onKeyUpCapture?: KeyboardEventHandler<HTMLDivElement>
  /**
   * 打 `@` 时的候选 —— **画布上任意可连的节点**，不只是已经连进来的那些。
   * 选中一个就等于「从画布选择」，会新建一条边（owner 2026-08-08 定的 B 方案）。
   * 不传就没有下拉，行为与加这个能力之前完全一致。
   */
  mentionCandidates?: readonly MentionCandidate[]
  /**
   * 选中候选。组件已经把用户打的 `@查询` 从正文里删掉了，父级只需要**连线**，
   * 再通过 ref 的 `insertToken(name)` 把胶囊插进去 —— 插入走的还是既有那条路。
   */
  onMentionSelect?(candidate: MentionCandidate): void
}

/** 光标所在文本节点上、紧邻光标的 `@查询`。不在写 @ 时返回 null。 */
function readMentionQuery(editor: HTMLElement): MentionQuery | null {
  const selection = editor.ownerDocument.getSelection()
  if (!selection || !selection.isCollapsed) return null
  const node = selection.anchorNode
  if (!node || !editor.contains(node) || node.nodeType !== Node.TEXT_NODE) {
    return null
  }
  const before = (node.textContent ?? '').slice(0, selection.anchorOffset)
  // `@` 后不允许空格与第二个 `@`；`@` 前必须是行首或空白，免得把邮箱之类误判成提及。
  const match = /(^|\s)@([^\s@]*)$/.exec(before)
  if (!match) return null
  return { text: match[2], length: match[2].length + 1 }
}

/**
 * Minimal contentEditable mention input (cast-redesign §6). Renders `@name`
 * references as atomic, non-editable chips — the cursor can't split them and
 * Backspace deletes each whole (native contentEditable=false behavior). The
 * persisted value stays plain text (`@name` inline) so the generate path is
 * untouched; chips are purely a rendering of the names the editor is told about
 * via `tokens`.
 *
 * Semi-controlled: the DOM is re-rendered from `value` only on EXTERNAL changes
 * (not the user's own typing), preserving the caret; IME composition is guarded
 * the same way as `IMEAwareTextarea`.
 */
export const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(
  function MentionInput(
    {
      value,
      onValueChange,
      tokens,
      placeholder,
      className,
      onKeyDown,
      onKeyUp,
      onKeyDownCapture,
      onKeyUpCapture,
      mentionCandidates,
      onMentionSelect,
      ...rest
    },
    ref,
  ) {
    const editorRef = useRef<HTMLDivElement>(null)
    const [isComposing, setIsComposing] = useState(false)
    // @ 下拉：查询串 + 光标处的屏幕坐标（浮层用 fixed 定位，画布有 transform，
    // 只能用视口坐标）。null = 没在写 @。
    const [mention, setMention] = useState<{
      query: MentionQuery
      rect: { left: number; bottom: number }
    } | null>(null)
    const [activeIndex, setActiveIndex] = useState(0)
    // Last value we rendered OR emitted — lets us skip re-rendering the DOM
    // (which would reset the caret) when `value` just echoes our own edit.
    const lastValueRef = useRef<string | null>(null)

    // 两份名单由**同一个 `tokens`** 按 kind 劈开 —— 调用方仍只传一个数组，
    // 不用自己分类，也就不会漏分。
    const namedTokens = useMemo(
      () => tokens.filter((token) => token.name.length > 0),
      [tokens],
    )
    const knownNames = useMemo(
      () => namedTokens.filter((t) => t.kind !== 'text').map((t) => t.name),
      [namedTokens],
    )
    const capsuleNames = useMemo(
      () => namedTokens.filter((t) => t.kind === 'text').map((t) => t.name),
      [namedTokens],
    )
    const tokenByLiteral = useMemo(
      () =>
        new Map(
          namedTokens.map(
            (t) => [`${mentionPrefixOf(t.kind)}${t.name}`, t] as const,
          ),
        ),
      [namedTokens],
    )

    // Re-render the DOM from `value` only when it changed externally (not from
    // our own onInput echo) and we're not mid-composition.
    /**
     * 外部 `value` 变了就重建内容 —— 而**重建必须保住光标**。
     *
     * ⚠ 2026-08-09 根治：此前这里只重建、不管光标，靠
     * `value === lastValueRef.current` 猜「这次是不是我自己发出去的」来回避。
     * 那个守卫本身就是错的思路，至少两类情况会穿过去：
     *
     *   ① **打字快过回流**：`emit` 只记最后一次发出的值，而 `updateNodeData`
     *      的回流是异步的。打完 "ab" 时第一次更新才带着 "a" 回来，
     *      `"a" !== "ab"` → 守卫失效 → 重建 → 光标弹回开头。owner 真机在紧凑档
     *      和完整档都撞到，正是这一条。
     *   ② **任何外部改写**：助手 ops、提示词模板、改名漂移回写…… 它们本来就该
     *      重建，而用户此刻的光标同样不该被扔掉。
     *
     * 所以不再猜值的来源，改成「重建前量下光标、重建后放回去」。守卫保留只是
     * 省掉一次无谓的 DOM 重建（同值直接跳过），不再承担正确性。
     */
    useEffect(() => {
      if (isComposing) return
      const el = editorRef.current
      if (!el) return

      /**
       * ⭐ **谁是真相**：光标在这个编辑器里 → **DOM 是真相**，外部 `value` 只是
       * 一份滞后的镜像；光标不在 → `value` 是真相，照它重建。
       *
       * ⚠ 这条是 2026-08-09 真机打出来的。受控回流是异步的：连打
       * `ABCDEFGH`，打到 B 时 A 的那次回流才到，effect 拿着**旧值**重建 DOM，
       * 把刚打进去的字冲掉 —— 屏幕上出来的是 `BCDEFGHA`，首字符被甩到末尾。
       * 光标保持救不了这个，因为丢的是内容不是位置。
       *
       * 代价（知情选择）：用户正聚焦时，外部改写（助手 ops / 模板 / 改名回写）
       * 不会即时冲进编辑器，要等失焦后那次同步。相比"打字被吞"，这个代价小得
       * 多，而且外部改写本来就不该在用户打字中途抢走内容。
       *
       * `insertToken` 那条路不受影响 —— 它直接改 DOM 再 `emit`，从不经过这里。
       */
      const active = el.ownerDocument.activeElement
      if (active === el || el.contains(active)) {
        lastValueRef.current = value
        return
      }

      if (value === lastValueRef.current) return
      // 失焦重建也要保住光标：外部改写完用户点回来时，位置不该回到开头。
      const caret = getCaretOffset(el)
      renderInto(el, value, knownNames, capsuleNames, tokenByLiteral)
      if (caret !== null) setCaretOffset(el, caret)
      lastValueRef.current = value
    }, [value, isComposing, knownNames, capsuleNames, tokenByLiteral])

    /** 候选按当前查询过滤（大小写不敏感，子串匹配即可）。 */
    const matches = useMemo(() => {
      if (!mention || !mentionCandidates?.length) return []
      const q = mention.query.text.toLowerCase()
      const hit = q
        ? mentionCandidates.filter((c) => c.name.toLowerCase().includes(q))
        : [...mentionCandidates]
      return hit.slice(0, MENTION_MAX_VISIBLE)
    }, [mention, mentionCandidates])

    /** 光标动了就重算查询 —— 输入、点击、方向键都要走这里。 */
    const syncMention = () => {
      const el = editorRef.current
      if (!el || !mentionCandidates?.length) {
        setMention(null)
        return
      }
      const query = readMentionQuery(el)
      if (!query) {
        setMention(null)
        return
      }
      const selection = el.ownerDocument.getSelection()
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null
      const rect = range?.getBoundingClientRect()
      // 空 range 在某些位置量到全 0；退回编辑器自身的盒子，浮层至少不会飞到左上角。
      const anchor =
        rect && (rect.left || rect.bottom) ? rect : el.getBoundingClientRect()
      setMention((prev) => {
        // ⚠ 查询串没变就别重置高亮：ArrowDown 的 keyup 同样会走到这里，每次都归零
        // 的话方向键就永远停在第一条。
        if (prev?.query.text !== query.text) setActiveIndex(0)
        return { query, rect: { left: anchor.left, bottom: anchor.bottom } }
      })
    }

    const emit = (serializedValue?: string) => {
      const el = editorRef.current
      if (!el) return
      const next = serializedValue ?? serializeEditor(el)
      lastValueRef.current = next
      onValueChange(next)
    }

    /**
     * 选中一个候选：先把用户打出来的 `@查询` 从正文里删掉，再交给父级去连线 + 插胶囊。
     *
     * ⚠ 删除用 Range 直接操作 DOM，不走「改 value 再重渲染」—— 后者会重建整个编辑器
     * 内容并把光标扔回开头（本组件半受控的原因，见顶部注释）。
     */
    const commitMention = (candidate: MentionCandidate) => {
      const el = editorRef.current
      const current = mention
      setMention(null)
      if (!el || !current) return
      const selection = el.ownerDocument.getSelection()
      const node = selection?.anchorNode
      if (selection && node && node.nodeType === Node.TEXT_NODE) {
        const end = selection.anchorOffset
        const start = Math.max(0, end - current.query.length)
        const range = el.ownerDocument.createRange()
        range.setStart(node, start)
        range.setEnd(node, end)
        range.deleteContents()
        selection.removeAllRanges()
        const after = el.ownerDocument.createRange()
        after.setStart(node, start)
        after.collapse(true)
        selection.addRange(after)
      }
      emit()
      onMentionSelect?.(candidate)
    }

    useImperativeHandle(
      ref,
      () => ({
        insertToken(name: string, kind: MentionToken['kind'] = 'shot') {
          const el = editorRef.current
          if (!el) return
          el.focus()
          const prefix = mentionPrefixOf(kind)
          insertNodeAtCaret(
            el,
            buildChip(
              el.ownerDocument,
              name,
              prefix,
              tokenByLiteral.get(`${prefix}${name}`),
            ),
          )
          // A trailing space so the caret has a text node to live in after the
          // atomic chip (chips can't hold a caret on their trailing edge alone).
          insertNodeAtCaret(el, el.ownerDocument.createTextNode(' '))
          emit()
        },
        insertText(text: string) {
          const el = editorRef.current
          if (!el) return
          el.focus()
          insertNodeAtCaret(el, el.ownerDocument.createTextNode(text))
          emit()
        },
        focus() {
          editorRef.current?.focus()
        },
        getBoundingClientRect() {
          return editorRef.current?.getBoundingClientRect()
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [tokenByLiteral],
    )

    return (
      <>
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline="true"
          aria-label={rest['aria-label']}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={placeholder}
          onInput={() => {
            if (!isComposing) {
              const el = editorRef.current
              if (!el) return
              const next = serializeEditor(el)
              emit(next)
              syncMention()
            }
          }}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => {
            setIsComposing(false)
            emit()
            syncMention()
          }}
          onClick={syncMention}
          onBlur={() => setMention(null)}
          onPaste={(event) => {
            // Chips only come from the ＋/click flow; pasted content is always
            // flattened to plain text so no foreign markup enters the editor.
            event.preventDefault()
            const text = event.clipboardData.getData('text/plain')
            const el = editorRef.current
            if (!el) return
            insertNodeAtCaret(el, el.ownerDocument.createTextNode(text))
            emit()
          }}
          onKeyDown={(event) => {
            // 下拉开着时，方向键/回车/Tab 归下拉，不能漏给编辑器（回车会插换行、
            // 方向键会移光标把下拉关掉）。Escape 只关下拉，**并且要 stopPropagation**
            // —— 否则它会一路冒泡把外层的节点面板一起关掉。
            if (mention && matches.length > 0) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setActiveIndex((i) => {
                  const step = event.key === 'ArrowDown' ? 1 : -1
                  return (i + step + matches.length) % matches.length
                })
                return
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                event.preventDefault()
                commitMention(matches[activeIndex] ?? matches[0])
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setMention(null)
                return
              }
            }
            onKeyDown?.(event)
          }}
          onKeyUp={(event) => {
            // 方向键/退格之后光标位置变了，查询要跟着重算。
            syncMention()
            onKeyUp?.(event)
          }}
          onKeyDownCapture={onKeyDownCapture}
          onKeyUpCapture={onKeyUpCapture}
          className={cn(
            'mention-input whitespace-pre-wrap break-words outline-none',
            'empty:before:pointer-events-none empty:before:text-node-subtle empty:before:content-[attr(data-placeholder)]',
            className,
          )}
        />
        {/* @ 候选浮层。fixed + 视口坐标：编辑器活在画布的 transform 里，用绝对定位
          会被父级的缩放/平移带跑。
          ⚠ `onMouseDown` 必须 preventDefault —— 否则点击先让编辑器失焦，onBlur 把
          浮层关掉，click 永远等不到。 */}
        {mention && matches.length > 0 ? (
          <div
            role="listbox"
            aria-label={rest['aria-label']}
            className="canvas-mention-popover"
            style={{ left: mention.rect.left, top: mention.rect.bottom + 6 }}
            onMouseDown={(event) => event.preventDefault()}
          >
            {matches.map((candidate, index) => (
              <button
                key={candidate.id}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex ? 'true' : undefined}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commitMention(candidate)}
              >
                <span className="truncate">{candidate.name}</span>
                {candidate.groupLabel ? (
                  <span className="canvas-mention-popover-kind">
                    {candidate.groupLabel}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </>
    )
  },
)
