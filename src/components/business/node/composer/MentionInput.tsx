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
  kind: 'character' | 'background' | 'shot' | 'voice' | 'video'
  /** 16px thumbnail embedded in the chip — the node's image / videoThumbnail,
   *  or the voice cover. Falls back to a flat port-color chip when absent. */
  thumbnailUrl?: string
}

export interface MentionInputHandle {
  /** Insert `@name` as an atomic chip at the caret (falls back to the end). */
  insertToken(name: string): void
  /** Insert plain text at the caret — used by the 运镜语法 chips (§5 L1), which
   *  are film-language phrases, not @tokens. */
  insertText(text: string): void
  focus(): void
  getBoundingClientRect(): DOMRect | undefined
}

type MentionSegment =
  | { type: 'text'; text: string }
  | { type: 'token'; name: string }

/**
 * Pure: split a plain-text prompt into text / token segments. A token is `@`
 * followed by one of `knownNames`, matched LITERALLY (longest match wins) so it
 * works for CJK names with no word boundaries. An `@` not followed by a known
 * name stays as text — this is what lets a renamed reference degrade to plain
 * text instead of a stale chip.
 */
export function parseMentions(
  value: string,
  knownNames: readonly string[],
): MentionSegment[] {
  // Longest first so "@角色A2" matches before "@角色A".
  const names = [...knownNames]
    .filter((name) => name.length > 0)
    .sort((a, b) => b.length - a.length)
  const segments: MentionSegment[] = []
  let text = ''
  let i = 0
  while (i < value.length) {
    if (value[i] === '@') {
      const match = names.find(
        (name) => value.slice(i + 1, i + 1 + name.length) === name,
      )
      if (match) {
        if (text) {
          segments.push({ type: 'text', text })
          text = ''
        }
        segments.push({ type: 'token', name: match })
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
  voice: 'bg-node-port-voice/25',
  video: 'bg-node-port-video/25',
}
// The embedded 16px thumbnail's shape encodes the kind (§9 V2-2 token anatomy):
// circle = 角色/配音 (identity), square = 图/镜头/场景/视频. Placeholder tint uses
// the port color at higher opacity so a thumbless reference still reads as its kind.
const THUMB_SHAPE: Record<MentionToken['kind'], string> = {
  character: 'rounded-full',
  background: 'rounded-sm',
  shot: 'rounded-sm',
  voice: 'rounded-full',
  video: 'rounded-sm',
}
const THUMB_FILL: Record<MentionToken['kind'], string> = {
  character: 'bg-node-port-character/70',
  background: 'bg-node-port-background/70',
  shot: 'bg-node-port-image/70',
  voice: 'bg-node-port-voice/70',
  video: 'bg-node-port-video/70',
}
const CHIP_BASE =
  'mention-chip mx-0.5 inline-flex select-none items-center gap-1 rounded-full py-0.5 align-baseline text-node-foreground'
const MENTION_ATTR = 'data-mention'
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
  token: MentionToken | undefined,
): HTMLSpanElement {
  const kind = token?.kind
  const chip = doc.createElement('span')
  chip.setAttribute(MENTION_ATTR, name)
  chip.setAttribute('contenteditable', 'false')
  chip.className = cn(
    CHIP_BASE,
    kind ? CHIP_FILL[kind] : 'bg-node-panel-inner',
    kind ? 'pl-0.5 pr-1.5' : 'px-1.5',
  )
  if (kind) chip.appendChild(buildThumb(doc, kind, token?.thumbnailUrl))
  const label = doc.createElement('span')
  label.className = 'mention-chip-label leading-none'
  label.textContent = `@${name}`
  chip.appendChild(label)
  return chip
}

/** Render `value` into `el`, replacing its content. Token names → atomic chips,
 *  everything else → text nodes (newlines preserved via white-space: pre-wrap). */
function renderInto(
  el: HTMLElement,
  value: string,
  knownNames: readonly string[],
  tokenByName: ReadonlyMap<string, MentionToken>,
): void {
  const doc = el.ownerDocument
  el.replaceChildren()
  for (const segment of parseMentions(value, knownNames)) {
    if (segment.type === 'text') {
      el.appendChild(doc.createTextNode(segment.text))
    } else {
      el.appendChild(
        buildChip(doc, segment.name, tokenByName.get(segment.name)),
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
          out += `@${element.getAttribute(MENTION_ATTR) ?? ''}`
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

export interface MentionInputProps {
  value: string
  onValueChange(value: string): void
  tokens: readonly MentionToken[]
  placeholder?: string
  className?: string
  'aria-label'?: string
  onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>
  onKeyUpCapture?: KeyboardEventHandler<HTMLDivElement>
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
      onKeyDownCapture,
      onKeyUpCapture,
      ...rest
    },
    ref,
  ) {
    const editorRef = useRef<HTMLDivElement>(null)
    const [isComposing, setIsComposing] = useState(false)
    // Last value we rendered OR emitted — lets us skip re-rendering the DOM
    // (which would reset the caret) when `value` just echoes our own edit.
    const lastValueRef = useRef<string | null>(null)

    const knownNames = useMemo(
      () => tokens.map((token) => token.name).filter((name) => name.length > 0),
      [tokens],
    )
    const tokenByName = useMemo(
      () =>
        new Map(
          tokens
            .filter((token) => token.name.length > 0)
            .map((token) => [token.name, token] as const),
        ),
      [tokens],
    )

    // Re-render the DOM from `value` only when it changed externally (not from
    // our own onInput echo) and we're not mid-composition.
    useEffect(() => {
      if (isComposing) return
      if (value === lastValueRef.current) return
      const el = editorRef.current
      if (!el) return
      renderInto(el, value, knownNames, tokenByName)
      lastValueRef.current = value
    }, [value, isComposing, knownNames, tokenByName])

    const emit = () => {
      const el = editorRef.current
      if (!el) return
      const next = serializeEditor(el)
      lastValueRef.current = next
      onValueChange(next)
    }

    useImperativeHandle(
      ref,
      () => ({
        insertToken(name: string) {
          const el = editorRef.current
          if (!el) return
          el.focus()
          insertNodeAtCaret(
            el,
            buildChip(el.ownerDocument, name, tokenByName.get(name)),
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
      [tokenByName],
    )

    return (
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={rest['aria-label']}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => {
          if (!isComposing) emit()
        }}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => {
          setIsComposing(false)
          emit()
        }}
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
        onKeyDownCapture={onKeyDownCapture}
        onKeyUpCapture={onKeyUpCapture}
        className={cn(
          'mention-input whitespace-pre-wrap break-words outline-none',
          'empty:before:pointer-events-none empty:before:text-node-subtle empty:before:content-[attr(data-placeholder)]',
          className,
        )}
      />
    )
  },
)
