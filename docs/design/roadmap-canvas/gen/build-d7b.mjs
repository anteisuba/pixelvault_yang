// D7b · 一个壳，四张脸 + 画布入口：② 思维导图（① 三题 owner 09-19 已答）
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

const D7B = {
  k: 'root', t: 'D7b · 一个壳，四张脸',
  c: [
    { k: 'cat', t: '壳不变（Q1 A）', c: [
      { k: 'leaf', t: '骨架 · 输入区 · 卡片形状 · 宽高 · 动效 · 人设与口吻，四处同一份（22 已落）。⛔ 不做四套面板形态、不按宿主换人设' },
    ] },
    { k: 'cat', t: '每张脸只换三样', c: [
      { k: 'sub', t: '① 起手药丸', c: [ { k: 'leaf', t: '空态那三颗 + 输入框上方那排。药丸就是「这个助手会干什么」的自我介绍，四处各写各的' } ] },
      { k: 'sub', t: '② 头部域标记', c: [ { k: 'leaf', t: '域图标 + 一句当前上下文（图片：当前模型 · 比例 · 张数；视频：模型 · 比例 · 时长；LoRA：底模 · 挂了几个；画布：选中几个节点 · 项目名）。⛔ 不上色：脊柱 §2.1 模态色只给 prompts 域，别的域不许拿颜色当身份' } ] },
      { k: 'sub', t: '③ 空态一句话', c: [ { k: 'leaf', t: '各说各的活；⛔ 不重复人设名字，人设在头部已经有了' } ] },
    ] },
    { k: 'cat', t: '四张脸是谁（Q3 owner 定）', c: [
      { k: 'sub', t: '图片工作台 · 如何生成图片', c: [ { k: 'leaf', t: '药丸：把这句写成好提示词 · 换个模型看差别 · 照这张参考图来 · 出 4 张对比' } ] },
      { k: 'sub', t: '视频工作台 · 如何生成视频', c: [ { k: 'leaf', t: '药丸：从这张图动起来 · 首尾帧怎么接 · 时长和节奏 · 镜头运动怎么写' } ] },
      { k: 'sub', t: 'LoRA 装配台 · 用 LoRA 出对图', c: [ { k: 'leaf', t: 'owner 09-20 定：核心是做出自己想要的图，三件事都要助手辅助 —— 提示词写对（触发词 · 顺序 · 权重语法）· LoRA 挂对（挑哪几个 · 底模兼容 · 常同挂）· 参数调对（权重 · 比例 · 步数）。药丸：帮我写这张的提示词 · 这个题材该挂哪些 LoRA · 权重这样对不对 · 试一张看看' } ] },
      { k: 'sub', t: '画布 · 全能导演', c: [
        { k: 'leaf', t: '剧本、图、视频、自动连线都能做。药丸：把这段剧本排成分镜 · 从参考图做角色资产 · 做场景资产 · 用资产排分镜 · 分镜出视频 · 帮我连线' },
        { k: 'leaf', t: '流水线（owner 09-19 提出）：参考图 → 角色资产图 / 场景资产图 → 分镜图 → 视频；「自动连线」= 助手按资产角色把参考槽接上。依赖 24 剧本节点（已落）· 35 attach_card · 40 上下文卡；单独成条目 65' },
      ] },
    ] },
    { k: 'cat', t: '收起态统一 = 头像（owner 09-20）', c: [
      { k: 'leaf', t: '四处收起态都是**人设头像**那颗圆（LoRA 页现状那种），带数字角标；位置统一**右上角**。D7 Q2 C 的「右下圆按钮」改口：位置右下 → 右上，形状按钮 → 头像' },
      { k: 'leaf', t: '头像就是唯一开关：点开 → 面板从右上角展开，头像**滑进面板头部**成为头部那颗头像（同一元素，位置过渡 240ms，motion-reduce 直切）；点头部头像或 Esc → 面板收回头像。面板头部的「收起」按钮去掉' },
      { k: 'leaf', t: '画布：顶栏「助手」胶囊退场，位置换成这颗头像，排在「剪辑台」胶囊右侧；面板顶边在顶栏下方，不压顶栏。工作台 / LoRA：头像固定右上（LoRA 现在在右下，挪上去）' },
      { k: 'leaf', t: '头部右侧只剩一颗 ⋯：历史 · 设置 · 隐身（56a）收进去。⛔ 三颗图标并排退场' },
    ] },
    { k: 'cat', t: '④ 画板要出的', c: [
      { k: 'leaf', t: '四宿主各一帧：头部域标记 + 空态 + 起手药丸（同壳不同底）' },
      { k: 'leaf', t: '收起头像 → 展开面板的两态 + 中间那一帧过渡；画布上与「剪辑台」胶囊的并排；⋯ 菜单展开' },
    ] },
  ],
}
const MAP = header('PixelVault · D7b · ② 思维导图 · 2026-09-19', '一个壳，四张脸 + 头像开关', 'owner 09-19：「助手应该共用一个壳，但也应该有自己特色的设计；完全一样，分四个助手就没意义。」① 三题：Q1 同一骨架换三样 · Q2 画布只留顶栏胶囊一个入口 · Q3 四张脸 owner 自己写（图片 = 如何生成图片，视频 = 如何生成视频，LoRA = 如何制作，画布 = 全能：剧本 / 图 / 视频 / 自动连线）。09-20 改口两条已落：LoRA 脸 = 用 LoRA 出对图（提示词 · 挂对 · 参数）；收起态四处统一为右上角人设头像，头像即开关，画布顶栏胶囊退场。没有待定项，没有批注就进 ④。') + tree(D7B, 300)

writeFileSync(join(OUT, 'DesignD7bMap.dc.html'), page('D7b ② 思维导图', MAP))
console.log('wrote DesignD7bMap.dc.html')
