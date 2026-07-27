import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.join(
  repoRoot,
  'docs',
  'references',
  'pages',
  'assets',
  'home-openai-model-card',
)

const modelIconPath = path.join(outputDir, 'official-gpt-image-2.png')
const chatGptIconPath = path.join(outputDir, 'official-chatgpt-icon.png')

const [modelIcon, chatGptIcon] = await Promise.all([
  fs.readFile(modelIconPath),
  fs.readFile(chatGptIconPath),
])

const modelIconUri = `data:image/png;base64,${modelIcon.toString('base64')}`
const chatGptIconUri = `data:image/png;base64,${chatGptIcon.toString('base64')}`

const escapeXml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const svg = (body, { width = 320, height = 320 } = {}) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .sans { font-family: Inter, "Helvetica Neue", Arial, sans-serif; }
    .mono { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
  </style>
  ${body}
</svg>`

const candidateA = svg(`
  <rect width="320" height="320" rx="24" fill="#F4F5F7"/>
  <text class="mono" x="24" y="30" font-size="10" letter-spacing="1.4" fill="#151515">OPENAI / IMAGE MODEL</text>
  <text class="mono" x="296" y="30" text-anchor="end" font-size="10" fill="#6B6D73">02</text>
  <line x1="24" y1="42" x2="296" y2="42" stroke="#D8DADF"/>
  <image href="${modelIconUri}" x="72" y="62" width="176" height="176"/>
  <text class="sans" x="24" y="276" font-size="25" font-weight="650" letter-spacing="-0.8" fill="#111111">GPT IMAGE 2</text>
  <text class="mono" x="24" y="299" font-size="9" letter-spacing="1.1" fill="#6B6D73">OFFICIAL MODEL TILE</text>
`)

const candidateB = svg(`
  <rect width="320" height="320" rx="24" fill="#0B0B0B"/>
  <path d="M24 24H296V296H24Z" fill="none" stroke="#373737"/>
  <line x1="24" y1="156" x2="296" y2="156" stroke="#373737"/>
  <line x1="156" y1="24" x2="156" y2="296" stroke="#373737"/>
  <text class="sans" x="25" y="112" font-size="86" font-weight="700" letter-spacing="-6" fill="#FFFFFF">GPT</text>
  <text class="mono" x="28" y="143" font-size="11" letter-spacing="2.1" fill="#A9ABB1">OPENAI IMAGE MODEL</text>
  <image href="${modelIconUri}" x="174" y="174" width="104" height="104"/>
  <text class="sans" x="28" y="218" font-size="28" font-weight="600" fill="#FFFFFF">IMAGE</text>
  <text class="sans" x="28" y="276" font-size="68" font-weight="650" fill="#FFFFFF">2</text>
`)

const candidateC = svg(`
  <rect width="320" height="320" rx="24" fill="#F2F1ED"/>
  <rect x="24" y="24" width="272" height="272" rx="18" fill="#FFFFFF" stroke="#D7D5CF"/>
  <image href="${chatGptIconUri}" x="40" y="40" width="48" height="48"/>
  <text class="mono" x="104" y="58" font-size="9" letter-spacing="1.2" fill="#65645F">OPENAI</text>
  <text class="mono" x="104" y="76" font-size="9" letter-spacing="1.2" fill="#65645F">GPT IMAGE 2</text>
  <line x1="40" y1="102" x2="280" y2="102" stroke="#E2E0DB"/>
  <text class="sans" x="40" y="194" font-size="72" font-weight="650" letter-spacing="-5" fill="#111111">GPT</text>
  <text class="sans" x="42" y="229" font-size="25" font-weight="560" fill="#111111">IMAGE 2</text>
  <image href="${modelIconUri}" x="176" y="144" width="104" height="104"/>
  <text class="mono" x="40" y="276" font-size="9" letter-spacing="1.1" fill="#77756F">PROVIDER + MODEL</text>
`)

const candidates = [
  {
    id: 'a-official-model-tile',
    title: 'A  OFFICIAL MODEL TILE',
    note: 'Safest / exact model asset',
    art: candidateA,
  },
  {
    id: 'b-gpt-editorial-poster',
    title: 'B  GPT EDITORIAL POSTER',
    note: 'Strongest GPT recognition',
    art: candidateB,
  },
  {
    id: 'c-provider-model-lockup',
    title: 'C  PROVIDER + MODEL',
    note: 'Recommended balance',
    art: candidateC,
  },
]

await Promise.all(
  candidates.map(({ id, art }) =>
    sharp(Buffer.from(art)).png().toFile(path.join(outputDir, `${id}.png`)),
  ),
)

const cardWidth = 320
const cardGap = 38
const side = 38
const sheetWidth = side * 2 + cardWidth * 3 + cardGap * 2
const sheetHeight = 486

const contactSheet = svg(
  `
  <rect width="${sheetWidth}" height="${sheetHeight}" fill="#FFFFFF"/>
  <text class="mono" x="${side}" y="30" font-size="11" letter-spacing="1.5" fill="#111111">OPENAI · GPT IMAGE 2 · MODEL CARD STUDY</text>
  <line x1="${side}" y1="44" x2="${sheetWidth - side}" y2="44" stroke="#D9D9D6"/>
  ${candidates
    .map(({ art }, index) => {
      const x = side + index * (cardWidth + cardGap)
      const inner = art
        .replace(/^<\?xml[^>]*>\s*/, '')
        .replace(
          /^<svg[^>]*>\s*<style>[\s\S]*?<\/style>/,
          `<g transform="translate(${x} 62)">`,
        )
        .replace(/<\/svg>\s*$/, '</g>')
      return inner
    })
    .join('\n')}
  ${candidates
    .map(({ title, note }, index) => {
      const x = side + index * (cardWidth + cardGap)
      const badge =
        index === 2
          ? `<rect x="${x + 224}" y="400" width="96" height="20" rx="10" fill="#111111"/>
             <text class="mono" x="${x + 272}" y="414" text-anchor="middle" font-size="8" letter-spacing=".8" fill="#FFFFFF">RECOMMENDED</text>`
          : ''
      return `
        <text class="sans" x="${x}" y="408" font-size="14" font-weight="650" fill="#111111">${escapeXml(title)}</text>
        ${badge}
        <text class="mono" x="${x}" y="432" font-size="10" fill="#74736E">${escapeXml(note)}</text>
        <text class="sans" x="${x}" y="462" font-size="13" font-weight="600" fill="#111111">OpenAI GPT Image 2</text>
        <text class="mono" x="${x + 320}" y="462" text-anchor="end" font-size="9" fill="#74736E">$0.04 / IMAGE</text>
      `
    })
    .join('\n')}
`,
  { width: sheetWidth, height: sheetHeight },
)

await sharp(Buffer.from(contactSheet))
  .png()
  .toFile(path.join(outputDir, 'openai-gpt-image-2-card-study.png'))

console.log(
  JSON.stringify(
    {
      outputDir,
      files: [
        ...candidates.map(({ id }) => `${id}.png`),
        'openai-gpt-image-2-card-study.png',
      ],
    },
    null,
    2,
  ),
)
