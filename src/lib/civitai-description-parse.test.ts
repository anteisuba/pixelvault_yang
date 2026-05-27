import { describe, expect, it } from 'vitest'

import {
  firstRecommendedPromptFromDescription,
  parseCivitaiDescriptionCodeBlocks,
} from './civitai-description-parse'

describe('parseCivitaiDescriptionCodeBlocks', () => {
  // Real-world: the wuthering-waves Denia LoRA from user feedback.
  it('extracts multi-outfit prompts with labels from Civitai HTML', () => {
    const html = `<ul><li><p>This is the character <strong>"Denia"</strong>.</p></li></ul>
<p><strong>outfits:</strong></p>
<p><strong>costume1</strong></p>
<pre><code>purple eyes,pink pupils,pink hair,c1,white hair ribbon,2d style,</code></pre>
<p><strong>costume2</strong></p>
<pre><code>black halo,purple eyes,c2,black hair ribbon,2d style,</code></pre>`

    const blocks = parseCivitaiDescriptionCodeBlocks(html)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.label).toBe('costume1')
    expect(blocks[0]?.prompt).toContain('c1')
    expect(blocks[0]?.prompt).toContain('white hair ribbon')
    expect(blocks[1]?.label).toBe('costume2')
    expect(blocks[1]?.prompt).toContain('c2')
  })

  it('decodes HTML entities inside the code block', () => {
    const html =
      '<pre><code>masterpiece &amp; best quality, &lt;trigger&gt;</code></pre>'
    const blocks = parseCivitaiDescriptionCodeBlocks(html)
    expect(blocks[0]?.prompt).toBe('masterpiece & best quality, <trigger>')
  })

  it('strips inline tags inside <pre> (Civitai wraps tokens in <span style>)', () => {
    const html =
      '<pre><code><span style="color:red">sks_char</span>, 1girl, blue eyes</code></pre>'
    const blocks = parseCivitaiDescriptionCodeBlocks(html)
    expect(blocks[0]?.prompt).toBe('sks_char, 1girl, blue eyes')
  })

  it('uses heading <h2>/<h3> as label when no <strong> precedes <pre>', () => {
    const html = `<h3>Variant A</h3><pre><code>foo, bar</code></pre>`
    const blocks = parseCivitaiDescriptionCodeBlocks(html)
    expect(blocks[0]?.label).toBe('Variant A')
  })

  it('returns empty label when no heading precedes the code block', () => {
    const html = '<p>some text</p><pre><code>trigger, 1girl</code></pre>'
    const blocks = parseCivitaiDescriptionCodeBlocks(html)
    expect(blocks[0]?.label).toBe('')
    expect(blocks[0]?.prompt).toBe('trigger, 1girl')
  })

  it('falls back to markdown ``` fences only when no <pre> block exists', () => {
    const html =
      'Some description text\n```\nsks_character, 1girl, long hair\n```\nmore text'
    const blocks = parseCivitaiDescriptionCodeBlocks(html)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.prompt).toBe('sks_character, 1girl, long hair')
  })

  it('prefers <pre> over markdown fences when both are present', () => {
    const html = '<pre><code>from html</code></pre>\n```\nfrom markdown\n```'
    const blocks = parseCivitaiDescriptionCodeBlocks(html)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.prompt).toBe('from html')
  })

  it('returns [] for empty / null / nullish input', () => {
    expect(parseCivitaiDescriptionCodeBlocks(null)).toEqual([])
    expect(parseCivitaiDescriptionCodeBlocks(undefined)).toEqual([])
    expect(parseCivitaiDescriptionCodeBlocks('')).toEqual([])
  })

  it('returns [] for description with no code blocks', () => {
    const html = '<p>Just a description with <strong>no</strong> prompts.</p>'
    expect(parseCivitaiDescriptionCodeBlocks(html)).toEqual([])
  })

  it('collapses internal whitespace but preserves newlines as logical breaks', () => {
    const html =
      '<pre><code>line one,   token2,\n   line two,  token3   </code></pre>'
    const blocks = parseCivitaiDescriptionCodeBlocks(html)
    expect(blocks[0]?.prompt).toBe('line one, token2,\nline two, token3')
  })
})

describe('firstRecommendedPromptFromDescription', () => {
  it('returns the first prompt or null', () => {
    expect(
      firstRecommendedPromptFromDescription(
        '<pre><code>foo, bar</code></pre><pre><code>baz</code></pre>',
      ),
    ).toBe('foo, bar')
    expect(firstRecommendedPromptFromDescription(null)).toBeNull()
    expect(firstRecommendedPromptFromDescription('<p>plain</p>')).toBeNull()
  })
})
