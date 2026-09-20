// D8 · 标签台 image/tags：② 思维导图（① 三题 owner 09-20 已答）
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', AMBER = '#a04f00'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .tree { display:flex; align-items:center }
  .kids { display:flex; flex-direction:column; gap:10px; position:relative; padding-left:32px }
  .kids::before { content:''; position:absolute; left:0; top:0; bottom:0; border-left:1.5px solid #d4d4d4 }
  .br { display:flex; align-items:center; position:relative }
  .br::before { content:''; position:absolute; left:-33px; top:50%; width:33px; border-top:1.5px solid #d4d4d4; z-index:1 }
  .br:first-child::after, .br:last-child::after { content:''; position:absolute; left:-34px; width:5px; background:#fff; z-index:0 }
  .br:first-child::after { top:0; height:50% } .br:last-child::after { top:50%; height:50% } .br:only-child::after { top:0; height:100% }
  .tree > .br::before, .tree > .br::after { display:none }
`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const tint = (h) => `oklch(0.965 0.022 ${h})`, tintBorder = (h) => `oklch(0.88 0.05 ${h})`, tintText = (h) => `oklch(0.38 0.11 ${h})`
const mdot = (c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};margin-right:8px;flex:none;vertical-align:1px"></span>`
function node(n, hue) {
  if (n.k === 'root') return `<div style="background:${accent(hue)};color:#fff;font-size:22px;font-weight:600;padding:14px 22px;border-radius:12px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'cat') return `<div style="background:${tint(hue)};color:${tintText(hue)};border:1px solid ${tintBorder(hue)};font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'sub') return `<div style="background:#fff;border:1px solid ${BORDER};font-size:13px;font-weight:500;line-height:1.45;padding:7px 12px;border-radius:8px;max-width:220px;flex:none">${esc(n.t)}</div>`
  const pre = n.s === 'open' ? mdot(AMBER) : ''
  const border = n.s === 'open' ? `border:1px dashed ${AMBER}99;background:#fff;` : 'background:#f5f5f5;'
  return `<div style="display:flex;align-items:baseline;${border}font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 560}px;flex:none">${pre}<span>${esc(n.t)}</span></div>`
}
const branch = (n, hue) => `<div class="br">${node(n, hue)}${n.c?.length ? `<div class="kids">${n.c.map((c) => branch(c, hue)).join('')}</div>` : ''}</div>`
const tree = (root, hue) => `<div class="tree" style="margin-top:20px">${branch(root, hue)}</div>`

const D8 = {
  k: 'root', t: 'D8 · 标签台 image/tags',
  c: [
    { k: 'cat', t: '为什么分两台（Q1）', c: [
      { k: 'leaf', t: '分的是输入方言不是厂商：GPT · Gemini · Seedream · Flux 吃自然语言，参数面长得一样，留在 image；NAI · PixAI 吃 danbooru 标签，有角色构图 / UC / Vibe / LoRA 架这些别处没有的旋钮，另开 image/tags' },
      { k: 'leaf', t: '取代「每个 provider 一条路由」：五页里三页会一样，以后每接一家多一页。两台之间用顶部一对分段切换（自然语言 · 标签），⛔ 不做第三台' },
      { k: 'leaf', t: '两台共用：结果区 · 参考轨 · 生成确认 · 助手（D7b 四张脸里图片那张，标签台的域标记 / 药丸另写一份 face）· 模型选择器（10，只是各自只列自己方言的模型）' },
    ] },
    { k: 'cat', t: '标签编辑器（Q2）', c: [
      { k: 'sub', t: '主区', c: [
        { k: 'leaf', t: '标签输入：逐 tag 成 chip，逗号 / 回车分隔；输入时 danbooru 标签补全（先用本地词表 + 最近用过，⛔ 本轮不接远程词库）；权重语法按 provider（NAI `{tag}` / `[tag]`，PixAI `(tag:1.2)`），编辑器只显示统一的 ± 权重，落 payload 时各自翻译' },
        { k: 'leaf', t: '正 / 负两栏：负栏 = NAI 的 UC / PixAI 的 negative_prompt；UC 预设五档作为负栏顶部的一排 chip（26 已接）' },
        { k: 'leaf', t: 'Text: 文字渲染单独一行小输入（26 已接），只在 V5 出现' },
      ] },
      { k: 'sub', t: '右列控件', c: [
        { k: 'leaf', t: '角色构图：NAI V5 ≤22 人自由定位 / V4.5 ≤6 人 5×5 网格 —— 复用现有 NovelAiCharacterControls，从工作台搬进右列并给它一块二维网格；每个角色独立正负' },
        { k: 'leaf', t: '质量标签两档 · 采样器 / SMEA / schedule / CFG rescale（26 之外「最该补的 8 条」第 3 条，随标签台一起接）· 分辩率档 + Anlas 预估（第 4 条）' },
        { k: 'leaf', t: 'Vibe Transfer（V4.5，≤16）与 Precise Reference（V4.5）接到参考轨上：参考图旁多一个「用作 Vibe / 精确参考」的切换；V5 不支持时灰掉' },
        { k: 'leaf', t: 'LoRA 架（PixAI，≤5）：PixAI 自己的 LoRA 目录，⛔ 不是装配台那套 runner LoRA；先做按 id 粘贴 + 权重，搜索目录待 PixAI API 核实' },
      ] },
      { k: 'sub', t: '与 11 的关系', c: [ { k: 'leaf', t: '标签台的控件仍从 capabilities 派生（模型声明什么就长什么），只是排版从「chip 行」换成「右列常驻」；同一份派生层，两台两种排列。助手 set_capability 自动覆盖' } ] },
    ] },
    { k: 'cat', t: '多模型冲突（Q3）', c: [
      { k: 'leaf', t: '⛔ 不跨方言多选：两台各自的选择器只列本方言模型，自然语言台选不到 NAI，标签台选不到 GPT。提示词方言都不同，混了两边都出不好' },
      { k: 'leaf', t: '台内多选取交集：参数面只留所有选中模型都支持的项；专属项灰掉并标「只对 NAI V5 生效」，仍可改，出图时按各模型能力裁剪 payload（现有 provider-capabilities 已能判）' },
      { k: 'leaf', t: '参考图：多选里有不收参考图的模型（PixAI）时，参考轨给一句「PixAI 不收参考图，这几张只给 NAI」，⛔ 不禁用参考轨' },
    ] },
    { k: 'cat', t: '路由与迁移', c: [
      { k: 'leaf', t: 'image/tags 新路由；模型选择器在 image 里选到标签模型时直接跳 image/tags 并带上选择；反向同理。用户记住的模型按台分开记' },
      { k: 'leaf', t: '现有 image 里 NAI 的角色构图控件与 26 刚接的三颗 chip 搬到标签台后，image 不再列 NAI / PixAI；⛔ 不留两处都能改 NAI 的入口' },
    ] },
    { k: 'cat', t: '不做', c: [
      { k: 'leaf', t: '逐 provider 分页 · 第三台 · 远程标签词库 · Director Tools（第 7 条，归编辑域）· 跨方言多选 · PixAI LoRA 目录搜索（API 未核实）' },
    ] },
    { k: 'cat', t: '④ 画板要出的', c: [
      { k: 'leaf', t: '标签台整页一帧（主区 + 右列 + 结果区）· 角色构图网格 · 多选交集态（专属灰掉）· 两台切换与跳转 · 手机形态' },
    ] },
  ],
}
const MAP = header('PixelVault · D8 · ② 思维导图 · 2026-09-20', '标签台 · 决策树（Q1–Q3 已定）', 'owner 09-20 ① 三题全取建议档：按方言分两台 · 标签编辑器为中心 · 不跨方言多选 + 台内取交集。起因：PixAI 与 NAI 应单独设计，是否 image/gpt · image/nai 逐 provider 分页 —— 答案是分方言不分厂商。这棵树没有待定项；没有批注就进 ④。') + tree(D8, 200)

writeFileSync(join(OUT, 'DesignD8Map.dc.html'), page('D8 ② 思维导图', MAP))
console.log('wrote DesignD8Map.dc.html')
