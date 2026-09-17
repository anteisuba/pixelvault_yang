// Shared components page (page 5): model picker current state, three unification directions, other candidates.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const FG = '#0a0a0a', MUTED = '#737373', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c', LINE = '#e5e5e5'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"

const STYLE = `
    body { margin: 0; background: #fff; color: ${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing: antialiased; }
    a { color: ${FG}; } a:hover { color: ${MUTED}; }
    table { border-collapse: collapse; width: 100%; }
    th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid #ececec; font-size: 12.5px; line-height: 1.5; }
    th { font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: ${MUTED}; font-weight: 500; border-bottom: 1px solid #d4d4d4; }
`
function page(title, body) {
  return `<!doctype html>
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
}
function header(title, sub) {
  return `<div style="margin-bottom:24px;max-width:960px">
    <div style="${MONO}font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED}">PixelVault · 共享组件 · 2026-09-17</div>
    <h1 style="margin:8px 0 0;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.2">${esc(title)}</h1>
    <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#525252">${esc(sub)}</p>
  </div>`
}
const sec = (t, s) => `<div style="margin-top:26px;display:flex;align-items:baseline;gap:12px"><div style="font-size:16px;font-weight:600">${esc(t)}</div>${s ? `<div style="font-size:12px;color:${MUTED}">${esc(s)}</div>` : ''}</div>`
const table = (cols, rows) => `<div style="overflow:hidden;border:1px solid ${LINE};border-radius:10px;margin-top:10px"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-weight:500;white-space:nowrap"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`

// ── mock primitives (all inline styles so they are editable) ──
const chip = (label, { sub, dark = false, h = 28 } = {}) => `<div style="display:inline-flex;align-items:center;gap:6px;height:${h}px;padding:0 10px 0 12px;border-radius:999px;background:${dark ? FG : '#fff'};color:${dark ? '#fff' : FG};border:1px solid ${dark ? FG : LINE};font-size:12px;font-weight:500;white-space:nowrap"><span>${esc(label)}</span>${sub ? `<span style="color:${dark ? 'rgba(255,255,255,.65)' : MUTED};font-weight:400">· ${esc(sub)}</span>` : ''}<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.6"><path d="M2 3.5 L5 6.5 L8 3.5"/></svg></div>`
const search = (ph) => `<div style="display:flex;align-items:center;gap:8px;height:32px;padding:0 10px;border-radius:8px;background:#f5f5f5;color:${MUTED};font-size:12px"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="5.2" cy="5.2" r="3.6"/><path d="M8 8 L11 11"/></svg>${esc(ph)}</div>`
const groupHead = (t) => `<div style="${MONO}font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};padding:8px 8px 4px">${esc(t)}</div>`
function row(name, meta, { selected = false, locked = false, channels = 0, price = '' } = {}) {
  const bg = selected ? '#f5f5f5' : 'transparent'
  const color = locked ? '#a3a3a3' : FG
  return `<div style="display:flex;align-items:center;gap:10px;padding:7px 8px;border-radius:8px;background:${bg}">
    <div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:${color}">${esc(name)}${locked ? `<span style="${MONO}font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid #d4d4d4;color:${MUTED}">需配置 key</span>` : ''}</div>
      <div style="font-size:11.5px;color:${MUTED};margin-top:2px">${esc(meta)}</div>
    </div>
    ${price ? `<div style="${MONO}font-size:11px;color:${MUTED};white-space:nowrap">${esc(price)}</div>` : ''}
    ${channels ? `<div style="${MONO}font-size:10.5px;padding:2px 7px;border-radius:999px;background:#f5f5f5;color:${FG};white-space:nowrap">${channels} 渠道</div>` : ''}
    ${selected ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="${FG}" stroke-width="1.6"><path d="M3 7.5 L6 10.5 L11 4"/></svg>` : ''}
  </div>`
}
const panel = (inner, w = 320) => `<div style="width:${w}px;background:#fff;border:1px solid ${LINE};border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.08);padding:8px;display:flex;flex-direction:column;gap:2px">${inner}</div>`
const col = (title, items, w = 150) => `<div style="width:${w}px;display:flex;flex-direction:column;gap:2px"><div style="${MONO}font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};padding:6px 8px 4px">${esc(title)}</div>${items.map(([t, sel, sub]) => `<div style="padding:7px 8px;border-radius:8px;background:${sel ? '#f5f5f5' : 'transparent'};font-size:13px;font-weight:${sel ? 600 : 500}">${esc(t)}${sub ? `<div style="font-size:11px;color:${MUTED};font-weight:400;margin-top:2px">${esc(sub)}</div>` : ''}</div>`).join('')}</div>`
const caption = (t) => `<div style="font-size:12px;line-height:1.55;color:#525252;margin-top:10px;max-width:520px">${esc(t)}</div>`
const label = (t) => `<div style="${MONO}font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${MUTED};margin-bottom:10px">${esc(t)}</div>`
const frame = (inner) => `<div style="padding:22px;background:#f5f5f5;border-radius:12px;display:flex;flex-direction:column;align-items:flex-start;gap:12px">${inner}</div>`

// ───────── Board 1 · 现状 ─────────
const B1 = header('模型选择器 · 现状：两套组件、七类调用方', '同一个「选模型」在站内有两种长相：工作台视频 / 音频 / 3D / LoRA / 配音间还在三层钻取（系列 → 型号 → 渠道），画布四类节点与图片工作台已经是方案 A（只列型号、渠道自动选、按型号记住）。node-canvas-v2 §1.6 早已写明「同一套也替换 studio 的三栏对话框」，但只换了图片一处。') +
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:8px">
    <div>${label('现状 A · BaseModelPickerPanel（三层钻取 / 三栏）· 工作台视频 · 音频 · 3D · LoRA 底模 · 配音间')}${frame(
      `<div style="display:flex;gap:12px;align-items:flex-start">${chip('Seedance 2.5 · fal', { h: 32 })}</div>` +
      `<div style="display:flex;gap:6px;background:#fff;border:1px solid ${LINE};border-radius:12px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,.08)">${col('系列', [['Seedance', true], ['Kling', false], ['Wan 3.0', false], ['HappyHorse', false], ['Gemini Omni', false], ['MiniMax', false]])}<div style="width:1px;background:${LINE}"></div>${col('型号', [['2.5', true], ['2.0', false], ['2.0 Fast', false]])}<div style="width:1px;background:${LINE}"></div>${col('渠道 · 比价', [['fal', true, '$0.47/s · 720p'], ['火山 Ark', false, '≈¥1.8/s'], ['BytePlus', false, '$0.23/s']], 170)}</div>` +
      caption('三层并列或一层一层钻（窄容器）；搜索绕过分层；只有一个候选的层自动跳过。渠道是用户手选的第三步，触发器上永远带渠道名。'))}</div>
    <div>${label('现状 B · ModelPickerPopover（方案 A）· 画布图片 / 音频 / 文本节点 · 图片工作台')}${frame(
      `<div style="display:flex;gap:12px">${chip('Seedance 2.5')}</div>` +
      panel(search('搜型号…') + groupHead('最近') + row('GPT Image 2.5 Flare', '自己的 key · $0.04 / 张') + groupHead('Seedance') + row('Seedance 2.5', 'BytePlus · 自动 · $0.23/s', { selected: true, channels: 3 }) + row('Seedance 2.0', 'fal · 自动 · $0.20/s', { channels: 3 }) + groupHead('Kling') + row('Kling O3 Pro', 'fal · $0.11/s') + row('Kling V3 Pro', '缺 fal key', { locked: true })) +
      caption('列表只有型号，系列退成分组标题；第二行是自动选中的渠道与单价（规则：自己的 key ＞ 平台免费额度 ＞ 最便宜）；多渠道行尾「N 渠道」点开行内单选并按型号记住；缺 key 灰显可点 → QuickSetupDialog。'))}</div>
  </div>` +
  sec('调用方矩阵', '同一份 StudioModelOption 数据，七类入口，两套皮') +
  table(['调用方', '当前组件', '触发器形态', '差异 / 问题'], [
    ['图片工作台 StudioPromptArea', 'MainModelPicker(image) → ModelPickerPopover', '参数栏 chip · 支持多选（对照矩阵）', '已是方案 A；多选态只这里有'],
    ['视频工作台', 'MainModelPicker(video) → BaseModelPickerPanel', '参数栏 columns 三栏', '与画布视频节点长相不同；渠道手选'],
    ['3D 生成台', 'MainModelPicker(model_3d) → Base', '整卡切换（按确认稿）', '模型本身是卡片不是 chip，另一种形态'],
    ['配音间 VoiceRoomModelChip', 'BaseModelPickerPanel 直用', '房间级 chip', '绕开 MainModelPicker 因为它内部调 hook'],
    ['LoRA 底模选择', 'LoraWorkbench 自有 + BaseModelPicker 逻辑', '装配行内的底模 + 通道分层', '底模 ≠ 模型：要显示兼容性与 fal / Runner 通道'],
    ['画布 图片 / 音频 / 视频节点', 'ModelPickerPopover（NodeModelChip 包一层）', '提示词栏 28px chip', '音频 groupBy=kind；视频受模式过滤'],
    ['文本 / 助手模型', 'CanvasAssistantRouteSelector · StudioOperatorModelChip · TextAssistantBar', 'llm_assist 两步（厂商 → 模型）', '第四种列表：LLM 路由不是 StudioModelOption 原生形状'],
  ]) +
  table(['维度', '三层钻取（A）', '方案 A 弹层（B）'], [
    ['第一眼看见什么', '系列列表，要再点两下', '型号列表 + 最近三条'],
    ['渠道', '用户第三层手选，触发器带渠道名', '自动选，按型号记住；手改才在 chip 尾附「· 渠道」'],
    ['价格', '渠道栏内并列比价', '行第二行单价（基准档）'],
    ['缺 key', '锁标 + 点进 setup', '灰显可点 → QuickSetupDialog'],
    ['搜索', '绕过分层平铺', '顶部常驻'],
    ['宽度', 'columns ≈ 44rem；drill 给窄处', '固定 ≈ 320px 弹层；可 inline 嵌入 Sheet'],
    ['多选', '无', '有（selectedOptionIds）'],
    ['分组维度', '固定系列', 'series / kind 可切'],
  ])

// ───────── Board 2 · 三方向 + 解剖 ─────────
const dirCard = (t, rec, how, pro, con, mock) => `<div style="display:flex;flex-direction:column;gap:12px;padding:16px;background:#fff;border:1px solid ${rec ? FG : LINE};border-radius:12px">
  <div style="display:flex;align-items:center;justify-content:space-between"><div style="font-size:15px;font-weight:600">${esc(t)}</div>${rec ? `<span style="${MONO}font-size:10.5px;padding:3px 7px;border-radius:999px;background:${FG};color:#fff">推荐</span>` : ''}</div>
  ${mock}
  <div style="font-size:12.5px;line-height:1.55;color:#404040">${esc(how)}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;line-height:1.55"><div><div style="color:${GREEN};font-weight:600;margin-bottom:4px">好在</div>${pro.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div><div><div style="color:${RED};font-weight:600;margin-bottom:4px">代价</div>${con.map((x) => `<div>· ${esc(x)}</div>`).join('')}</div></div>
</div>`
const mockA = frame(`<div style="display:flex;gap:8px">${chip('Seedance 2.5')}${chip('Fish S2.1 Pro', { sub: '语音' })}${chip('选模型')}</div>` + panel(search('搜型号…') + groupHead('最近') + row('Seedance 2.5', 'BytePlus · 自动 · $0.23/s', { selected: true, channels: 3 }) + groupHead('Kling') + row('Kling O3 Pro', 'fal · $0.11/s') + row('Kling V3 Pro', '缺 fal key', { locked: true }), 300))
const mockB = frame(`<div style="display:flex;gap:6px;background:#fff;border:1px solid ${LINE};border-radius:12px;padding:8px">${col('系列', [['Seedance', true], ['Kling', false], ['Wan', false]], 110)}<div style="width:1px;background:${LINE}"></div><div style="width:200px">${groupHead('型号 · 渠道自动')}${row('Seedance 2.5', 'BytePlus · $0.23/s', { selected: true, channels: 3 })}${row('Seedance 2.0', 'fal · $0.20/s', { channels: 3 })}</div></div>` + `<div style="display:flex;gap:8px">${chip('Seedance 2.5')}<span style="font-size:11px;color:${MUTED};align-self:center">窄处退成方案 A 弹层</span></div>`)
const mockC = frame(`<div style="width:300px;background:#fff;border:1px solid ${LINE};border-radius:12px;padding:10px;display:grid;grid-template-columns:1fr 1fr;gap:8px">${[['Seedance 2.5', '视频 · 30s · 1080p'], ['Kling O3 Pro', '视频 · 多镜'], ['GPT Image 2.5', '图 · 编辑最细'], ['NovelAI V5', '图 · 22 角色']].map(([n, m], i) => `<div style="padding:10px;border-radius:8px;border:1px solid ${i === 0 ? FG : LINE}"><div style="height:36px;border-radius:6px;background:linear-gradient(135deg,#e8e8e8,#f7f7f7);margin-bottom:8px"></div><div style="font-size:12px;font-weight:600">${esc(n)}</div><div style="font-size:10.5px;color:${MUTED}">${esc(m)}</div></div>`).join('')}</div>`)

const B2 = header('模型选择器 · 三个统一方向 + 推荐解剖', '统一的不是「长得一样」，是同一份数据、同一套行、同一条渠道规则、同一个缺 key 出口；容器（弹层 / 三栏 / Sheet）按空间自适应。三个方向差在「渠道谁来选」和「第一眼看见什么」。') +
  `<div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:14px">
    ${dirCard('A · 方案 A 全站推平', true, '所有模态、所有容器都用 ModelPickerPopover 的行与规则：型号列表 + 最近 + 搜索 + 自动渠道 + 按型号记住。工作台参数栏与画布 chip 只是同一弹层的两种触发器；手机端同一列表 inline 进底部 Sheet。', ['一套行、一套记忆、一套缺 key 出口，已被图片工作台与画布验证', '渠道从「用户决策」变「系统默认 + 可改」，少一层点击', '§1.6 已拍板的方向，最少争论'], ['视频三栏比价的「一眼看三家价格」退成行尾「N 渠道」二级', '3D 的整卡切换与 LoRA 底模（兼容性 + 通道）要单独适配行内容', 'LLM 路由要先转成 StudioModelOption 形状'], mockA)}
    ${dirCard('B · 自适应双容器，同一份行', false, '宽处（工作台参数栏）保留两栏：左系列、右型号行；右栏的行就是方案 A 的行（渠道自动 + 单价 + N 渠道）。窄处（画布 chip / 手机）退成方案 A 弹层。三栏里的「渠道」那一栏取消。', ['宽屏保住「系列一览」的可扫读性', '行与规则仍是一份，只是多一个容器'], ['两种容器 = 两套布局测试与断点', '系列栏在只有 2–3 个系列的模态（音频 / 3D）显得空', '与画布仍不是同一张脸，只是同一套行'], mockB)}
    ${dirCard('C · 模型卡片抽屉', false, '把首页模型站的品牌卡搬进产品：全屏或半屏抽屉里按模态列品牌卡（封面 · 强项 · 价位），点卡进入型号 / 渠道。适合「选模型是一件大事」的场景。', ['给新用户选模型的依据（强在哪 / 弱在哪）', '与首页模型站视觉复用'], ['画布里一个 28px chip 点开全屏抽屉太重，频繁切模型的高频动作被拖慢', '品牌资料要维护第二份（首页那张表口径未核实）', '与「参数 chip 永不为空、就地弹层」的画布通用语言冲突'], mockC)}
  </div>` +
  sec('推荐方向 A 的解剖', '一个组件、三种触发器、两种容器') +
  `<div style="display:grid;grid-template-columns:1.1fr 1fr;gap:20px;margin-top:10px">
    <div>${frame(
      label('弹层（Popover ≈ 320px · 手机 inline 进 Sheet）') +
      panel(search('搜型号 · 绕过分组') + groupHead('最近 · 最多 3') + row('Seedance 2.5', 'BytePlus · 自动 · $0.23/s · 720p 基准', { selected: true, channels: 3 }) + groupHead('Seedance') + row('Seedance 2.0', 'fal · 自动 · $0.20/s', { channels: 3 }) + row('Seedance 2.0 Fast', '火山 · 手选 · ¥0.9/s', { channels: 3 }) + groupHead('Kling') + row('Kling O3 Pro', 'fal · $0.11/s（音频关）') + row('Kling V3 Pro', '缺 fal key · 点击配置', { locked: true }) + `<div style="margin:6px 4px 2px;padding:8px 10px;border-radius:8px;background:#f5f5f5;font-size:11.5px;color:${MUTED}">渠道行内单选（点「3 渠道」展开）：fal $0.47 · 火山 ¥1.8 · BytePlus $0.23 ✓ 记住</div>`, 340) +
      caption('行 = 型号名 + 状态标 ｜ 第二行 = 渠道 · 自动 / 手选 · 单价（基准档 720p / 每秒 / 含音频）｜ 行尾 = 单价 · N 渠道 · 选中钩。缺 key 灰显可点。分组维度：series（默认）/ kind（音频）/ family（LoRA 底模）。'))}</div>
    <div>${frame(
      label('三种触发器 · 同一弹层') +
      `<div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;gap:12px">${chip('Seedance 2.5', { h: 28 })}<span style="font-size:12px;color:${MUTED}">画布提示词栏 chip · 28px · 只显型号名，手改渠道才附「· fal」</span></div>
        <div style="display:flex;align-items:center;gap:12px">${chip('Seedance 2.5', { sub: 'BytePlus · $0.23/s', h: 36 })}<span style="font-size:12px;color:${MUTED}">工作台参数栏 · 36px · 带渠道与单价副文</span></div>
        <div style="display:flex;align-items:center;gap:12px">${chip('选模型', { h: 32 })}<span style="font-size:12px;color:${MUTED}">空态 · 「参数 chip 永不为空」，新卡即带默认模型</span></div>
        <div style="display:flex;align-items:center;gap:12px">${chip('GPT Image 2.5 · Gemini 3 Pro · +2', { dark: true, h: 36 })}<span style="font-size:12px;color:${MUTED}">多选态（图片对照矩阵）· 黑底计数</span></div>
      </div>` +
      label('') + label('两个特例怎么进同一套') +
      table(['场景', '做法'], [
        ['LoRA 底模', 'groupBy=family；行第二行显示「兼容 · Runner / fal」；不兼容当前 LoRA 栈的灰显并给理由；通道切换只在同底模双通道时出现'],
        ['3D 生成台', '保留整卡切换作为「预览态」，点卡即选；卡内嵌同一行的元信息（单价 · key 状态），不再单写一套列表'],
        ['LLM 路由', 'routeToStudioOption 已存在；五家合一后 groupBy=vendor，行第二行显示能力标（看图 / 联网 / 记忆）'],
        ['模式过滤（视频）', '弹层不管模式；调用方按 videoMode 预过滤 options（现状即如此，保留）'],
      ]))}</div>
  </div>` +
  sec('统一后的完成定义', '按 ui-defaults 八项 + 组件契约') +
  table(['#', '要求'], [
    ['1', 'MainModelPicker 的 video / audio / model_3d / llm_assist 四个分支全部改走 ModelPickerPopover；BaseModelPickerPanel 只保留 drill 作 Sheet 内的回落或删除'],
    ['2', '触发器三档尺寸（28 / 32 / 36）与空态 / 多选态由同一个 ModelChip 出；配音间 VoiceRoomModelChip 与 NodeModelChip 改成它的薄包装'],
    ['3', '渠道记忆按模态 scope 分（image / video / audio / lora / llm），只记能跑的那条；单价缺失时隐藏而不占位'],
    ['4', '缺 key 一律灰显可点 → QuickSetupDialog（Hard Rule 8），不再有锁标 + 禁用两种表现'],
    ['5', '键盘：↑↓ 选行、→ 展开渠道、Enter 选、Esc 关；手机 inline 进 vaul Sheet，44px 行高'],
    ['6', '三语标签复用 Models 命名空间；系列名不新造 i18n 键'],
  ])

// ───────── Board 3 · 其他共享组件 ─────────
const B3 = header('除了模型选择器，还有哪些值得做成共享组件', '判据：同一件事在 ≥2 个工具里各写了一份、用户能感知长相不同、且没有工具专属业务逻辑。按「用户感知差异 × 重复份数」排序，前四条建议和模型选择器一起进这一轮设计门。') +
  table(['#', '组件', '现在有几份', '用户看到的差异', '统一后的契约（一句）', '优先'], [
    ['1', '参考素材入口（上传 / 最近 / 素材库 / 粘贴）', 'StudioReferenceRail · 画布参考轨 + ReferenceLandingTabs · AssetSelectorDialog · AssistantReferencePicker · LoRA 参考图区', '四选一弹层在工作台、画布、助手、LoRA 长得都不一样；G1「参考图接不到素材库」只在部分入口修了', '一个 ReferencePicker 弹层（四选一 + 拖放 + @ 引用）+ 一条参考轨组件，role 槽位可选', 'P0'],
    ['2', '规格 chip 与弹层（比例 / 分辩率 / 时长 / 画质 / 声音开关）', 'StudioSpecPopover · StudioSpecFields · StudioVideoSpecFields · 画布 ChipPopover · StudioSfxSpecPopover', '工作台是三档合成弹层，画布是 chip 逐个弹；时长滑杆只有画布有', '规格 = 一组 chip，每颗一个弹层；档位从模型 capabilities 派生，模型没有的档灰掉不藏', 'P0'],
    ['3', '生成中 / 任务条（排队 → 冷启动 → 生成 → 归档）', 'StudioGeneratingProgress · 画布裱框显影 · 视频队列条 StudioVideoQueueStrip · 3D StageStepperBar · Runner 阶段词', '有的画进度环，有的 spinner，有的分段；取消入口位置不一', '一个任务状态模型（四态 + 阶段词 + 可取消）→ 两种皮：卡上裱框显影 / 列表任务条', 'P0'],
    ['4', '结果去向菜单（编辑 / 变体 / 转视频 / 进画布 / 存配方 / 下载 / 已归档）', 'StudioCanvas 结果卡 · ImageDetailModal · AssetDetailSheet · 画布 ⋯ 菜单 · 画廊详情', '同一张图在五个地方能做的事不一样，「存配方」只在两处有', '一份「去向」动作注册表，按媒体类型与所在页裁剪显示', 'P0'],
    ['5', 'API key 门（缺 key 提示 · 抽屉 · 内联配置）', 'QuickSetupDialog · ApiKeyManager 抽屉 · ShellApiKeys · 3D / LoRA 各自的提示', '有的灰显可点、有的弹窗、有的锁标', '缺 key = 灰显可点 → QuickSetupDialog 一种；抽屉只做通盘管理', 'P1'],
    ['6', '助手入口与 dock', '工作台星光按钮 + 玻璃面板 · 画布右侧 dock · LoRA 右侧上下文栏 · 配音间无', '三张脸；便签 13 要单独设计助手导图', '右侧 dock 可收成按钮一种形态；各域只换专属层内容', 'P1（随助手设计轮）'],
    ['7', '⌘K 命令面板', 'StudioCommandPalette · ShellCommandPalette', '词表不同，同一动作两处名字不一', '一份命令注册表，按页面注入；切页 / 新建 / 上传 / 问助手四类全站一致', 'P1'],
    ['8', '卡片选择器（角色 / 风格 / 背景 → 参考槽）', 'StudioCardPicker · 画布左侧卡片面板 · card-recipe 编译', '工作台是页脚管理链接，画布是拖卡；都不带 role', '卡片拖 / 选进参考槽时自动带 role 与 @名字（随角色卡 schema 补齐）', 'P1（随卡片设计）'],
    ['9', '列表页页头（标题 · 计数 · 分面 · 排序 · 密度）', '画廊 GalleryFilterBar · 素材 AssetFacetBar · 卡片 tab · 提示词 tab', '四个去处页四种头', '一个 ListPageHeader，分面 chip 可删、吸顶行为一致', 'P2'],
    ['10', '空态与首次引导卡', '各工具各自空态文案；NodeCanvasEmptyGuide · AssetStateBlocks', '有的有三步引导，有的一句话', '空态 = 展示槽标题 + 一句说明 + 一个主动作 + 可选三步卡', 'P2'],
    ['11', '移动端底部 composer + 参数抽屉', 'StudioMobileComposer · StudioMobileModelSheet · MobileNodeSheet · 配音间输入条', '三套抽屉', '一条底部输入条 + 一个参数抽屉容器，各工具只换抽屉内容', 'P2（随移动端）'],
  ]) +
  `<div style="margin-top:22px;padding:14px 16px;background:#f5f5f5;border-radius:10px;font-size:12.5px;line-height:1.65">
    <div style="font-weight:600;margin-bottom:6px">建议这一轮设计门一起过的四件</div>
    模型选择器 · 参考素材入口 · 规格 chip · 任务条。四件都在「提示词栏 = 加号 · 正文 · chip · 发送」这条画布通用语言里，统一之后工作台与画布的提示词栏就是同一件东西的两种宽度；结果去向菜单紧随其后，因为它决定「生成完去哪」。助手 dock 与卡片选择器等便签 13 / 19 的独立设计轮出来再并。
  </div>`

for (const [name, html] of [
  ['SharedPickerNow.dc.html', page('模型选择器 · 现状', B1)],
  ['SharedPickerDirections.dc.html', page('模型选择器 · 三方向与解剖', B2)],
  ['SharedCandidates.dc.html', page('共享组件候选', B3)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
