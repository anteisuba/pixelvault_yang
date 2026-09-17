// Page 5 additions (task bar, result destinations) + page 6 (assistant / canvas / cards design trees).
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c', LINE = '#e5e5e5'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const reply = (n, q, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 批注 ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const tint = (h) => `oklch(0.965 0.022 ${h})`, tintBorder = (h) => `oklch(0.88 0.05 ${h})`, tintText = (h) => `oklch(0.38 0.11 ${h})`

const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid #ececec; font-size: 12.5px; line-height: 1.5; }
    th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: ${MUTED}; font-weight: 500; border-bottom: 1px solid #d4d4d4; }
    .tree { display: flex; align-items: center; }
    .kids { display: flex; flex-direction: column; gap: 10px; position: relative; padding-left: 32px; }
    .kids::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; border-left: 1.5px solid #d4d4d4; }
    .br { display: flex; align-items: center; position: relative; }
    .br::before { content: ''; position: absolute; left: -33px; top: 50%; width: 33px; border-top: 1.5px solid #d4d4d4; z-index: 1; }
    .br:first-child::after, .br:last-child::after { content: ''; position: absolute; left: -34px; width: 5px; background: #fff; z-index: 0; }
    .br:first-child::after { top: 0; height: 50%; }
    .br:last-child::after { top: 50%; height: 50%; }
    .br:only-child::after { top: 0; height: 100%; }
    .tree > .br::before, .tree > .br::after { display: none; }
`
const page = (title, body) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Noto+Sans+SC:wght@400;500;600&amp;display=swap">
  <style>${STYLE}</style>
</helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">
${body}
</div>
</x-dc>
</body>
</html>
`
const header = (eyebrow, title, sub) => `<div style="margin-bottom:24px;max-width:980px">
    <div style="${MONO}font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">${esc(eyebrow)}</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2">${esc(title)}</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>`
const sec = (t, s) => `<div style="margin-top:26px;display:flex;align-items:baseline;gap:12px"><div style="font-size:16px;font-weight:600">${esc(t)}</div>${s ? `<div style="font-size:12px;color:${MUTED}">${esc(s)}</div>` : ''}</div>`
const table = (cols, rows) => `<div style="overflow:hidden;border:1px solid ${LINE};border-radius:10px;margin-top:10px"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:500;white-space:nowrap"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
const legend = `<div style="display:flex;gap:16px;font-size:12px;color:${MUTED};margin-top:4px"><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:26px;height:14px;border-radius:4px;background:#f5f5f5"></span>已有</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${AMBER}"></span>部分 / 契约有实现待核</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${RED}"></span>缺，本设计新增</span><span style="display:inline-flex;align-items:center;gap:6px"><span style="display:inline-block;width:12px;height:6px;border-radius:999px;background:${FG}"></span>你手绘里的项</span></div>`

// ── tree renderer ──
const dot = (c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};margin-right:8px;flex:none;vertical-align:1px"></span>`
const own = `<span style="display:inline-block;width:12px;height:6px;border-radius:999px;background:${FG};margin-right:8px;flex:none"></span>`
function node(n, hue) {
  if (n.k === 'root') return `<div style="background:${accent(hue)};color:#fff;font-size:22px;font-weight:600;padding:14px 22px;border-radius:12px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'cat') return `<div style="background:${tint(hue)};color:${tintText(hue)};border:1px solid ${tintBorder(hue)};font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'sub') return `<div style="background:#fff;border:1px solid ${LINE};font-size:13px;font-weight:500;line-height:1.45;padding:7px 12px;border-radius:8px;max-width:240px;flex:none">${esc(n.t)}</div>`
  if (n.k === 'chips') return `<div style="display:flex;flex-wrap:wrap;gap:6px;max-width:${n.w ?? 520}px;padding:8px 10px;background:#f5f5f5;border-radius:8px;flex:none">${n.items.map((c) => `<span style="${MONO}font-size:11.5px;padding:3px 8px;border-radius:999px;background:#fff;border:1px solid ${LINE};white-space:nowrap">${esc(c)}</span>`).join('')}</div>`
  const pre = n.s === 'gap' ? dot(RED) : n.s === 'partial' ? dot(AMBER) : ''
  const o = n.own ? own : ''
  const border = n.s === 'gap' ? `border:1px dashed ${RED}99;background:#fff;` : `background:#f5f5f5;`
  return `<div style="display:flex;align-items:baseline;${border}font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 460}px;flex:none">${o}${pre}<span>${esc(n.t)}</span></div>`
}
const branch = (n, hue) => `<div class="br">${node(n, hue)}${n.c?.length ? `<div class="kids">${n.c.map((c) => branch(c, hue)).join('')}</div>` : ''}</div>`
const tree = (root, hue) => `<div class="tree" style="margin-top:20px">${branch(root, hue)}</div>`


const D1 = {
  k: 'root', t: 'D1 · 美术方向',
  c: [
    { k: 'cat', t: '决策（owner 授权：选最好实现的）', c: [
      { k: 'leaf', t: '图标 = A 线性：沿用 lucide（228 个图标名已在用，线宽 2）；只自绘业务对象（节点四类 · 卡片四锚 · 任务五态 · 渠道 / key 态），同网格同线宽混排', w: 560 },
      { k: 'leaf', t: '材质 = A 磨砂只用于浮层 / 弹层：画布 glass 工具条与助手面板已是这套；侧栏 / 胶囊用实底 + 阴影，不再新增磨砂层', w: 560 },
      { k: 'leaf', t: '模态色 = A 四色一套：--modality-* token 已存在（prompts 域在用），只需把首页 / 卡片 / 方向图三套收成它；不新造色', w: 560 },
      { k: 'leaf', t: '空态 = C 一句话 + 主动作（现在就能做）；角色化插画 A 留作 P2，等卡片总线落地后用自家角色卡批量生成', w: 560 },
      { k: 'leaf', t: '圆角密度 = B 现状：--radius 0.625rem 七档 + node / shell 三个域档，只做「合并」不改数值', w: 560 },
    ] },
    { k: 'cat', t: 'D1b 决策（owner 2026-09-17 答复）', c: [
      { k: 'leaf', t: '图标底子 = A Phosphor：整站 lucide → Phosphor（regular 档，与 lucide 同 24 网格 / 线宽 1.5–2），228 个图标名建映射表做 codemod；找不到对应的才自绘', w: 560 },
      { k: 'leaf', t: '业务对象图标 = A 抽象几何：节点四类 · 任务五态 · 渠道 / key 用几何符号，不写实、不用字母；先用 Phosphor 现成的顶上，缺的按 Phosphor 网格自绘', w: 560 },
      { k: 'leaf', t: '品牌标：字母不是关键，要的是「ANTI」的品牌感（参考 updream · libtv · 即梦），可以是动物或字母；owner 另开一个 chat 单独设计，这里只留插槽（favicon · 顶栏胶囊 · 助手头像三处）', w: 560 },
      { k: 'leaf', t: '品牌色 = A 中性黑白，与站内黑丸一致', w: 560 },
      { k: 'leaf', t: '风格参考：Grok bot 那种偏动漫形象的风格 → 品牌标可走角色化，图标仍是几何线性；两者靠黑白与圆角统一', w: 560 },
    ] },
    { k: 'cat', t: '图标体系', c: [
      { k: 'sub', t: '规格', c: [ { k: 'leaf', t: 'viewBox 24 · 线宽 2 · 端点 round · 拐角 round · 尺寸档 16 / 20 / 24（不做 32，UI 里没有）· currentColor · 与 lucide 同签名的 React 组件' } ] },
      { k: 'sub', t: '要自绘的（从 UI 全清单 E1 抽）', c: [
        { k: 'leaf', t: '节点四类：文 / 图 / 声 / 视（现在用 FileText / Image / Mic / Film 四个通用图标，语义不成组）' },
        { k: 'leaf', t: '卡片四锚：文字 / 图片 / 声音 / 风格 + 卡状态 DRAFT / STABLE' },
        { k: 'leaf', t: '任务五态：排队 / 冷启动 / 生成 / 归档 / 失败（现在 Spinner 72 处 + Loader2 8 处两套）' },
        { k: 'leaf', t: '渠道 / key：自动渠道 · 自己的 key · 平台额度 · key 失效' },
        { k: 'leaf', s: 'gap', t: '语义重复要收口：Image vs ImageIcon（36 处）· AlertTriangle / AlertCircle / TriangleAlert（38 处）· Loader2 vs Spinner —— 各留一个' },
      ] },
      { k: 'sub', t: '产物', c: [ { k: 'leaf', t: 'src/components/icons/ 一个目录（约 20 个 SVG 组件）+ 画布上一张「图标一览」板（16 / 24 两档并排，深浅底）' } ] },
    ] },
    { k: 'cat', t: '材质与层级', c: [
      { k: 'sub', t: '四层', c: [
        { k: 'leaf', t: '底：--background / --surface-workbench（灰底白卡脊柱，已落四个工作台，推到画廊 / 素材库）' },
        { k: 'leaf', t: '卡：白 + --border + 一档阴影（收成一个 --shadow-card，替代 node-card / shell-card 各自的）' },
        { k: 'leaf', t: '浮层（工具条 / 胶囊 / dock）：磨砂 backdrop-blur + 半透白 + 一档阴影（画布 NodeToolbar 已是）' },
        { k: 'leaf', t: '弹层（Dialog / Sheet / Popover / 右键菜单）：实底白 + 大阴影；不用磨砂（可读性）' },
      ] },
      { k: 'sub', t: '收口', c: [ { k: 'leaf', s: 'gap', t: '11 个 shadow token 全在 shell / assistant / node 三域 → 收成 4 个（card / float / overlay / pressed）；90 个 --color-* 里把三套模态色合一' } ] },
    ] },
    { k: 'cat', t: '色', c: [
      { k: 'sub', t: '模态色四色', c: [ { k: 'leaf', t: '图 / 声 / 视 / 文 各深浅两版（文字 / 边 / 淡底），只出现在：节点端口与连线 · 卡片四锚 · 模态丸 · 首页功能卡角标' } ] },
      { k: 'sub', t: '状态色三档', c: [ { k: 'leaf', t: '成功 / 风险 / 失败 各两版；失败态补 status-risk 面（批注 53）' } ] },
      { k: 'sub', t: '不做', c: [ { k: 'leaf', t: '不引入品牌主色渐变；不写 hex 进文档（原则化）' } ] },
    ] },
    { k: 'cat', t: '空态 C', c: [
      { k: 'leaf', t: '统一结构：展示槽标题（font-display，批注 39 / 54 的唯一应用内用法）+ 一句话 + 一枚主动作 + 可选次动作链接' },
      { k: 'leaf', t: '覆盖：工作台空舞台（含缺 key 引导）· 画布空项目 · 素材库空文件夹 · 卡片页 · 提示词库 · LoRA 库稀疏态（保留虚线引导行）' },
      { k: 'leaf', t: '删除：training/EmptyState 的 SVG 插画（唯一一处，风格孤儿）' },
    ] },
    { k: 'cat', t: '验收（UI 画板阶段用）', c: [
      { k: 'leaf', t: '一张「视觉语言」总板：四层材质叠放 · 四色 × 两版 · 三档状态 · 圆角七档 · 图标一览 · 空态模板' },
      { k: 'leaf', t: '三个真实场景套一遍：模型选择器行 · 画布节点卡 · 素材瓦片，看混排是否看不出两家' },
    ] },
  ],
}
const B_D1 = header('PixelVault · D1 · 美术方向 · 思维导图 · 2026-09-17', 'D1 决策树 · 按「最好实现」选', 'D1 ④ 已过（材质 / 状态 / 圆角 / 空态通过，模态色改 C）。D1b 图标与品牌标按 owner 答复定：Phosphor 底子 · 抽象几何业务图标 · 品牌标 ANTI 另开 chat · 黑白。下面第一组是 D1b 决策，其余为 D1 原树。') + tree(D1, 60)
for (const [name, html] of [['DesignD1Map.dc.html', page('D1 美术方向思维导图', B_D1)]]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
