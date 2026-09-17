// D2 ④ · UI 画板：选择器三态 + 手机 Sheet · 能力驱动表单（五家专属行）· 规格 chip 与弹层
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', WORKBENCH = '#f4f4f1', SUNKEN = '#ebebeb', AMBER = '#a04f00', GREEN = '#16794c', RED = '#b3261e'
const SH_OVERLAY = '0 1px 2px rgb(0 0 0 / 0.06), 0 18px 44px -18px rgb(0 0 0 / 0.38)'
const SH_FLOAT = '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 28px -12px rgb(0 0 0 / 0.32)'
const SH_CARD = '0 1px 2px rgb(0 0 0 / 0.04), 0 8px 24px -12px rgb(0 0 0 / 0.18)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  .lab { ${MONO} font-size:10.5px; letter-spacing:.05em; color:${MUTED} }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  .cap { font-size:12px; line-height:1.55; color:#525252; margin-top:8px; max-width:420px }
  svg.ic { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block; flex:none }
`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;family=Noto+Sans+SC:wght@400;500;600&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const sec = (t, s = '') => `<div class="sec"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`
const I = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', caret: '<path d="m6 9 6 6 6-6"/>', check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M5 12h14M12 5v14"/>', image: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>',
  sound: '<path d="M4 12v1M8 8v8M12 5v14M16 9v6M20 11v2"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
}
const ic = (k, color = 'currentColor', s = 16) => `<svg class="ic" viewBox="0 0 24 24" style="color:${color};width:${s}px;height:${s}px">${I[k]}</svg>`
const dot = (c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};flex:none"></span>`
const frame = (inner, bg = WORKBENCH, pad = 22) => `<div style="background:${bg};border-radius:16px;padding:${pad}px;position:relative;display:inline-block;vertical-align:top">${inner}</div>`
const cap = (t) => `<div class="cap">${t}</div>`

// ═══════════ 1 · 选择器 ═══════════
const groupHead = (t) => `<div class="lab" style="margin:10px 10px 4px">${esc(t)}</div>`
const row = ([m, v, p], { sel = false, hover = false, w = 13 } = {}) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:${sel || hover ? MUTEDBG : 'transparent'};${hover && !sel ? `outline:1px solid ${BORDER};` : ''}">
  <div style="flex:1;min-width:0;display:flex;align-items:baseline;gap:8px"><span style="font-size:${w}px;font-weight:500">${esc(m)}</span><span style="font-size:${w}px;color:#525252">${esc(v)}</span></div>
  <span class="tok" style="color:${p ? MUTED : '#c4c4c4'}">${esc(p || '—')}</span>
  ${sel ? `<span style="color:${FG}">${ic('check')}</span>` : ''}
</div>`
const ROWS = { s25: ['Seedance', '2.5', '$0.213 / s'], s25n: ['Seedance', '2.5', ''], k: ['Kling', 'O3 Pro', '$0.168 / s'], s20: ['Seedance', '2.0 Fast', ''], w: ['Wan', '3.0 Prime', '$0.20 / s'], v: ['Veo', '3.1', ''] }
const picker = (rows, { w = 380 } = {}) => `<div style="width:${w}px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_OVERLAY};padding:6px">
  <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:${MUTEDBG};color:${MUTED};font-size:12.5px">${ic('search')}搜型号…</div>${rows}</div>`
const CH = (sel) => [['fal', '$0.473 / s', GREEN, sel === 0], ['火山（国内）', '$0.213 / s', GREEN, sel === 1], ['BytePlus（国际）', '$0.231 / s', AMBER, sel === 2]]
const channelPanel = (sel, { top = 82, left = 422, w = 190 } = {}) => `<div style="position:absolute;top:${top}px;left:${left}px;width:${w}px;background:#fff;border:1px solid ${BORDER};border-radius:10px;box-shadow:${SH_FLOAT};padding:6px;font-size:12.5px;z-index:2">
  ${CH(sel).map(([t, p, c, on]) => `<div style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;background:${on ? MUTEDBG : 'transparent'}">${dot(c)}<span style="flex:1">${esc(t)}</span><span class="tok" style="color:${MUTED}">${esc(p)}</span></div>`).join('')}</div>`
const listA = groupHead('最近') + row(ROWS.s25, { sel: true }) + row(ROWS.k) + groupHead('Seedance') + row(ROWS.s20) + groupHead('Wan') + row(ROWS.w) + groupHead('Veo') + row(ROWS.v)
const listB = groupHead('最近') + row(ROWS.s25n, { sel: true }) + row(ROWS.k) + groupHead('Seedance') + row(ROWS.s20) + groupHead('Wan') + row(ROWS.w) + groupHead('Veo') + row(ROWS.v)
const listC = groupHead('最近') + row(ROWS.s25, { sel: true }) + row(ROWS.k, { hover: true }) + groupHead('Seedance') + row(ROWS.s20) + groupHead('Wan') + row(ROWS.w) + groupHead('Veo') + row(ROWS.v)

const trigger = (t, sub, { warn = false } = {}) => `<div style="display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 10px 0 12px;border-radius:999px;border:1px solid ${warn ? AMBER : BORDER};background:#fff;font-size:13px"><span style="font-weight:500">${esc(t)}</span><span class="tok" style="color:${warn ? AMBER : MUTED}">${esc(sub)}</span>${ic('caret', MUTED)}</div>`

const state = (title, inner, note, extra = '') => `<div style="display:inline-block;vertical-align:top;margin:0 24px 24px 0;max-width:660px">
  <div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(title)}</div>${inner}${cap(note)}${extra}</div>`

const PICKER = header('PixelVault · D2 ④ · 选择器 · 2026-09-17', '模型选择器 · 桌面三态 + 手机 Sheet', '按 Q1 定案（owner 调整版）与 Q3 = A 画：行只有 模型 · 型号 · 价格；渠道面板独立浮在弹层右侧、与当前行对齐；绿 / 黄点只在面板；没有「自动」；未选为空。同一个 ResponsivePopover 供工作台、画布 NodeModelChip、助手 / 配音间模型 chip、LoRA 底模弹窗五处使用，只换触发器外观。') +
  sec('触发器', '五处宿主同一形状：名 + 型号 + 价 / 状态 + caret') +
  `<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;align-items:center">${trigger('Seedance 2.5', '$0.213 / s')}${trigger('Seedance 2.5', '先选渠道', { warn: true })}${trigger('Kling O3 Pro', '缺 key', { warn: true })}${trigger('选模型', '')}<span class="cap" style="margin:0">默认 · 多渠道未选 · 缺 key · 空</span></div>` +
  sec('态 1 · 已选型号 + 已选渠道', '打开弹层的默认样子') +
  `<div style="display:flex;flex-wrap:wrap;align-items:flex-start">
    ${state('桌面 Popover', frame(picker(listA) + channelPanel(1, { top: 82 }), WORKBENCH, 22).replace('display:inline-block', 'display:inline-block;padding-right:240px'), 'Seedance 2.5 已选火山：行价格 $0.213 / s；右侧渠道面板与该行对齐，火山行 --muted 底。Kling O3 Pro 单渠道，价格直接显示。')}
    ${state('态 2 · 已选型号但未选渠道', frame(picker(listB) + channelPanel(-1, { top: 82 }), WORKBENCH, 22).replace('display:inline-block', 'display:inline-block;padding-right:240px'), '价格位「—」；面板三条都无底色。生成按钮此时文案「先选渠道」，点了就打开这个弹层并定位到该行。')}
  </div>` +
  sec('态 3 · hover 另一行', 'hover 行只描边不换底，面板跟着 hover 行走') +
  `<div style="display:flex;flex-wrap:wrap;align-items:flex-start">
    ${state('hover Kling O3 Pro（单渠道）', frame(picker(listC) + `<div style="position:absolute;top:118px;left:422px;width:190px;background:#fff;border:1px solid ${BORDER};border-radius:10px;box-shadow:${SH_FLOAT};padding:6px;font-size:12.5px"><div style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;background:${MUTEDBG}">${dot(GREEN)}<span style="flex:1">fal</span><span class="tok" style="color:${MUTED}">$0.168 / s</span></div></div>`, WORKBENCH, 22).replace('display:inline-block', 'display:inline-block;padding-right:240px'), '单渠道型号面板只有一行且已选（唯一选择自动成立）。选中行仍保留对勾与底色，hover 行只有 1px 描边。')}
    ${state('缺 key 渠道被点', frame(picker(listA) + channelPanel(2, { top: 82 }) + `<div style="position:absolute;top:196px;left:422px;width:190px;background:#fff;border:1px solid ${BORDER};border-radius:10px;box-shadow:${SH_OVERLAY};padding:12px;font-size:12.5px;line-height:1.5"><div style="font-weight:600">配置 BytePlus 的 key</div><div style="color:${MUTED};margin-top:4px">这把 key 解锁 4 个模型</div><div style="margin-top:8px;height:30px;border:1px solid ${BORDER};border-radius:8px;background:${MUTEDBG}"></div><div style="margin-top:8px;display:inline-flex;height:28px;padding:0 12px;border-radius:999px;background:${FG};color:#fff;font-size:12.5px;align-items:center">保存并选用</div></div>`, WORKBENCH, 22).replace('display:inline-block', 'display:inline-block;padding-right:240px'), '黄点渠道可点 → 面 1 弹层（QuickSetupDialog 一把 key）就地打开；保存后点变绿并成为该型号的选择。这就是 13 的 key 门在选择器里的入口。')}
  </div>` +
  sec('手机 · 底部 Sheet（Q5 = A）', '内容与桌面同构；渠道面板变成行内展开') +
  `<div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
    <div style="width:390px;height:560px;border-radius:32px;background:${SUNKEN};position:relative;overflow:hidden;border:1px solid ${BORDER}">
      <div style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:20px 20px 0 0;box-shadow:${SH_OVERLAY};padding:8px 12px 24px">
        <div style="width:36px;height:4px;border-radius:2px;background:#d4d4d4;margin:4px auto 10px"></div>
        <div style="display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:10px;background:${MUTEDBG};color:${MUTED};font-size:14px">${ic('search')}搜型号…</div>
        ${groupHead('最近')}
        <div style="border-radius:10px;background:${MUTEDBG}">
          <div style="display:flex;align-items:center;gap:10px;padding:12px 12px"><div style="flex:1;display:flex;gap:8px;align-items:baseline"><span style="font-size:15px;font-weight:500">Seedance</span><span style="font-size:15px;color:#525252">2.5</span></div><span class="tok" style="font-size:12px;color:${MUTED}">$0.213 / s</span>${ic('check')}</div>
          <div style="padding:0 12px 10px;display:flex;flex-direction:column;gap:2px">${CH(1).map(([t, p, c, on]) => `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:8px;background:${on ? '#fff' : 'transparent'};font-size:14px">${dot(c)}<span style="flex:1">${esc(t)}</span><span class="tok" style="font-size:12px;color:${MUTED}">${esc(p)}</span></div>`).join('')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;padding:12px 12px"><div style="flex:1;display:flex;gap:8px;align-items:baseline"><span style="font-size:15px;font-weight:500">Kling</span><span style="font-size:15px;color:#525252">O3 Pro</span></div><span class="tok" style="font-size:12px;color:${MUTED}">$0.168 / s</span></div>
        ${groupHead('Seedance')}
        <div style="display:flex;align-items:center;gap:10px;padding:12px 12px"><div style="flex:1;display:flex;gap:8px;align-items:baseline"><span style="font-size:15px;font-weight:500">Seedance</span><span style="font-size:15px;color:#525252">2.0 Fast</span></div><span class="tok" style="font-size:12px;color:#c4c4c4">—</span></div>
      </div>
    </div>
    <div class="cap" style="max-width:420px">手机没有 hover，也没有侧面板的空间：点行 = 选中并把该行原地展开成渠道列表（多渠道型号）；再点渠道即选定并收起。行高 44，字号 15 / 14。整个 Sheet 是现有 ResponsivePopover 的手机分支，不另写组件。</div>
  </div>`

// ═══════════ 2 · 能力驱动表单 ═══════════
const chip = (t, { on = false, muted = false, icon = '' } = {}) => `<span style="display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:999px;border:1px solid ${on ? FG : BORDER};background:${on ? FG : muted ? MUTEDBG : '#fff'};color:${on ? '#fff' : muted ? MUTED : FG};font-size:12.5px;white-space:nowrap">${icon}${esc(t)}</span>`
const refTrack = (n, max) => `<div style="display:flex;gap:6px;align-items:center">${Array.from({ length: n }).map((_, i) => `<div style="width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,#ddd,#c5c5c5);position:relative"><span style="position:absolute;left:3px;bottom:3px;${MONO}font-size:9px;background:rgba(255,255,255,.85);border-radius:4px;padding:0 3px">@${i + 1}</span></div>`).join('')}<div style="width:40px;height:40px;border-radius:8px;border:1px dashed #c4c4c4;display:flex;align-items:center;justify-content:center;color:${MUTED}">${ic('plus')}</div><span class="tok" style="color:${MUTED};margin-left:4px">${n} / ${max}</span></div>`
const formCard = (model, price, specific, { refs = 2, refMax = 10, note = '', warn = '' } = {}) => `<div style="width:520px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_CARD};padding:14px 16px;display:inline-block;vertical-align:top;margin:0 20px 20px 0">
  <div style="display:flex;align-items:center;justify-content:space-between"><div style="display:flex;gap:8px;align-items:center">${trigger(model, price)}${chip('1:1 · 2K', { icon: '' })}${chip('×1', { muted: true })}</div></div>
  <div style="margin-top:12px;min-height:64px;border-radius:10px;background:${MUTEDBG};padding:10px 12px;font-size:13px;color:#525252">A young woman in a red raincoat at a rainy neon street corner…</div>
  <div style="margin-top:10px">${refTrack(refs, refMax)}</div>
  ${specific.length ? `<div style="margin-top:12px;padding-top:12px;border-top:1px dashed ${BORDER}"><div class="lab" style="margin-bottom:6px">专属 · ${esc(model)}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${specific.map((c) => chip(c.t, { on: !!c.on, muted: !!c.muted })).join('')}</div></div>` : `<div style="margin-top:12px;padding-top:12px;border-top:1px dashed ${BORDER}"><div class="lab">专属 · 无</div></div>`}
  ${warn ? `<div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:12px;color:${AMBER};background:#fbf3ea;border-radius:8px;padding:7px 10px">${ic('info', AMBER)}<span style="flex:1">${esc(warn)}</span><span style="text-decoration:underline">撤销</span></div>` : ''}
  <div style="margin-top:12px;display:flex;justify-content:flex-end"><div style="display:inline-flex;height:34px;padding:0 16px;border-radius:999px;background:${FG};color:#fff;font-size:13px;font-weight:500;align-items:center">生成 1 张</div></div>
  ${note ? cap(note) : ''}
</div>`
const FORM = header('PixelVault · D2 ④ · 能力驱动表单 · 2026-09-17', '一张表单 · 通用区固定 · 第二行按模型长出专属 chip', 'Q2 = A：专属能力不进选择器，选中后表单第二行直接出现专属 chip 行。通用区永远是 模型触发器 · 规格 chip · 张数 · 提示词 · 参考轨，任何模型同一位置。专属区从 provider-capabilities 派生，UI 不写模型名。') +
  sec('五家模型各一版', '同一张卡，只有虚线以下在变') +
  `<div style="margin-top:10px">
    ${formCard('GPT Image 2.5 Flare', '$0.04 / 张', [{ t: '透明底' }, { t: '输入保真 · 高', on: true }, { t: '画质 · 六档' }], { refs: 3, refMax: 16 })}
    ${formCard('Gemini 3 Pro Image', '$0.03 / 张', [{ t: '对话式改图' }, { t: '多图融合' }, { t: '角色槽 5 · 物体槽 6', muted: true }], { refs: 2, refMax: 11 })}
    ${formCard('FLUX.2 max', '$0.05 / 张', [{ t: '多参考 @image' }, { t: '图层' }, { t: 'JSON prompt', muted: true }], { refs: 4, refMax: 10 })}
    ${formCard('Seedream 5.0 Pro', '$0.03 / 张', [{ t: '组图 sequential' }, { t: '图层拆分' }, { t: '联网', muted: true }], { refs: 2, refMax: 10 })}
    ${formCard('NovelAI V5', '¥ 按 Anlas', [{ t: '质量标签', on: true }, { t: 'UC 预设 · 重' }, { t: '多人构图 · 3' }, { t: 'Text:' }, { t: 'SMEA', muted: true }], { refs: 1, refMax: 1 })}
    ${formCard('Runner · Anima DiT', '¥0 · 自托管', [], { refs: 0, refMax: 0, note: '没有专属能力的模型，虚线下只有一行「专属 · 无」，不留空白区。' })}
  </div>` +
  sec('切模型 · 从 Seedream 5.0 Pro 切到 FLUX.2 max', '通用值保留，专属整组换，不兼容的值回默认并可撤销') +
  `<div style="margin-top:10px">${formCard('FLUX.2 max', '$0.05 / 张', [{ t: '多参考 @image', on: true }, { t: '图层' }], { refs: 2, refMax: 10, warn: '已切到 FLUX.2 max · 「组图」不再生效，参考 2 张保留' })}
  <div class="cap" style="display:inline-block;vertical-align:top;max-width:400px;margin-top:0">· 提示词、参考轨、规格、张数全部原样带过去。<br>· 专属行整组换成 FLUX 的；Seedream 独有的「组图」值被丢弃 → 出一行提示，可撤销回上一个模型。<br>· 参考轨按新模型上限裁剪：超出的灰显不删（此例 2 / 10 没超）。<br>· 这一行提示 3 秒后自动收起；撤销 = 回到上一个模型 + 上一组专属值。</div></div>`

// ═══════════ 3 · 规格 chip ═══════════
const segBtn = (t, on = false, dis = false) => `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:44px;height:30px;padding:0 10px;border-radius:8px;font-size:12.5px;background:${on ? FG : '#fff'};color:${on ? '#fff' : dis ? '#c4c4c4' : FG};border:1px solid ${on ? FG : BORDER};${dis ? 'text-decoration:line-through;' : ''}">${esc(t)}</span>`
const seg = (label, items, extra = '') => `<div style="margin-top:12px"><div style="display:flex;justify-content:space-between;align-items:baseline"><div class="lab">${esc(label)}</div>${extra}</div><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${items.map(([t, on, dis]) => segBtn(t, on, dis)).join('')}</div></div>`
const specPop = (kind) => `<div style="width:360px;background:#fff;border:1px solid ${BORDER};border-radius:12px;box-shadow:${SH_OVERLAY};padding:12px 14px 14px">
  ${seg('比例', [['1:1', true], ['16:9'], ['9:16'], ['4:3'], ['3:4'], ['21:9', false, kind === 'video']])}
  ${seg(kind === 'video' ? '清晰度' : '尺寸 / 清晰度', kind === 'video' ? [['480p'], ['720p', true], ['1080p']] : [['1K'], ['2K', true], ['4K', false, true]], kind === 'video' ? `<span class="tok" style="color:${MUTED}">1080p +$0.26 / s</span>` : `<span class="tok" style="color:${MUTED}">4K · 此模型不支持</span>`)}
  ${kind === 'video' ? seg('时长', [['4s'], ['5s', true], ['8s'], ['10s'], ['15s'], ['30s']]) : ''}
  <div style="margin-top:14px;padding-top:10px;border-top:1px dashed ${BORDER};display:flex;align-items:center;justify-content:space-between;font-size:12.5px;color:${MUTED}"><span>更多 · ${kind === 'video' ? '声音 · seed' : 'seed · 格式 · 张数'}</span>${ic('caret', MUTED)}</div>
</div>`
const specChipEl = (t, { on = false } = {}) => `<span style="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;border:1px solid ${on ? FG : BORDER};background:#fff;font-size:13px;box-shadow:${on ? `0 0 0 3px ${MUTEDBG}` : 'none'}">${esc(t)}${ic('caret', MUTED)}</span>`
const SPEC = header('PixelVault · D2 ④ · 规格 chip · 2026-09-17', '一颗 chip · 全量摘要 · 三段弹层 + 更多折叠', 'Q4 = A：chip 文案是「比例 · 清晰度（· 时长）」全量摘要；点开一个弹层分三段，声音 / seed / 张数 / 格式收进底部「更多」。档位从 capabilities 派生：模型换了档跟着换，非法组合回默认并在 chip 上闪一次；不支持的档灰显划线、hover 看原因；档旁只显单价差，chip 上不显价。工作台 4 份 Spec 弹层与画布 ChipPopover 全部换成它。') +
  sec('chip 三态') +
  `<div style="display:flex;gap:14px;align-items:center;margin-top:10px;flex-wrap:wrap">${specChipEl('1:1 · 2K')}${specChipEl('16:9 · 720p · 5s', { on: true })}<span style="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;border:1px solid ${AMBER};background:#fbf3ea;font-size:13px;color:${AMBER}">16:9 · 1080p · 5s${ic('caret', AMBER)}</span><span class="cap" style="margin:0">默认 · 打开中 · 刚被模型切换改回默认（闪一次 warning 边，1s 后恢复）</span></div>` +
  sec('弹层 · 图片 / 视频两版', '同一组件，段落按模态取子集') +
  `<div style="display:flex;gap:28px;flex-wrap:wrap;margin-top:10px;align-items:flex-start">
    <div>${frame(specPop('image'))}${cap('图片：比例 · 尺寸 / 清晰度 两段；4K 在 Seedream 5.0 上不支持 → 灰显划线，hover 看原因「此模型最高 2K」。')}</div>
    <div>${frame(specPop('video'))}${cap('视频：比例 · 清晰度 · 时长 三段；1080p 旁显单价差（fal 2.5 有核实价才显）；21:9 在 Seedance 2.5 不支持。时长档来自 SEEDANCE_25_DURATIONS。')}</div>
  </div>` +
  sec('画布提示词栏 · 结果', 'chip ≤ 2') +
  `<div style="margin-top:10px;display:inline-flex;align-items:center;gap:8px;padding:8px 10px;border-radius:14px;background:color-mix(in oklab,#fff 70%,transparent);backdrop-filter:blur(14px);border:1px solid rgba(0,0,0,.06);box-shadow:${SH_FLOAT}">${trigger('Seedance 2.5', '$0.213 / s')}${specChipEl('16:9 · 720p · 5s')}<span style="width:1px;height:20px;background:${BORDER}"></span>${ic('sound', MUTED, 18)}<span style="width:1px;height:20px;background:${BORDER}"></span><span style="display:inline-flex;height:32px;padding:0 14px;border-radius:999px;background:${FG};color:#fff;font-size:13px;align-items:center">生成</span></div>
  <div class="cap">画布节点提示词栏只剩 模型 chip + 规格 chip（+ 声音开关图标 + 生成）。声音开关保留为图标不进 chip，因为它是一次生成的开关不是规格。手机：同一弹层 inline 进底部 Sheet，三段变纵向，滑块拇指 44px。</div>`

for (const [name, html] of [
  ['DesignD2Picker.dc.html', page('D2 ④ 选择器', PICKER)],
  ['DesignD2Form.dc.html', page('D2 ④ 能力驱动表单', FORM)],
  ['DesignD2Spec.dc.html', page('D2 ④ 规格 chip', SPEC)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
