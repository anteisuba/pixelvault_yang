// D7 ④ · UI 画板：dock 三态 × 四宿主 · 「改」回执 · 剧本节点投影 · LoRA / 配音间壳
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', WORKBENCH = '#f4f4f1', SUNKEN = '#ebebeb', AMBER = '#a04f00', GREEN = '#16794c', RED = '#b3261e'
const PANEL = '#fbfbfa', CARD = '#ffffff', LINE = 'oklch(90% 0 0)'
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
  .cap { margin-top:10px; font-size:12px; line-height:1.55; color:#525252; max-width:560px }
  svg.ic { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block; flex:none }
`
const I = {
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  caret: '<path d="m6 9 6 6 6-6"/>', history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', collapse: '<path d="m15 6-6 6 6 6"/>', plus: '<path d="M5 12h14M12 5v14"/>', clip: '<path d="m21 11-8.5 8.5a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7L10.5 17a1.7 1.7 0 0 1-2.4-2.4L16 6.7"/>', lib: '<path d="M3 5h5l2 2h11v12H3z"/>', send: '<path d="m5 12 14-7-4 14-3-6z"/>', undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>', check: '<path d="M20 6 9 17l-5-5"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>', doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 13h6M9 17h6"/>', play: '<path d="m7 5 12 7-12 7z"/>', eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', ask: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.5"/>', edit: '<path d="M4 20h4l10-10-4-4L4 16z"/>', spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
}
const ic = (k, color = 'currentColor', s = 16) => `<svg class="ic" viewBox="0 0 24 24" style="color:${color};width:${s}px;height:${s}px">${I[k]}</svg>`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const sec = (t, s = '') => `<div class="sec"><b>${esc(t)}</b>${s ? `<span>${esc(s)}</span>` : ''}</div>`
const cap = (t) => `<div class="cap">${t}</div>`
const state = (title, inner, note = '') => `<div style="display:inline-block;vertical-align:top;margin:0 24px 24px 0;max-width:1300px"><div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(title)}</div>${inner}${note ? cap(note) : ''}</div>`
const avatar = (s = 24, dark = true) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:${s}px;height:${s}px;border-radius:50%;background:${dark ? FG : '#d4d4d0'};color:#fff;font-size:${Math.round(s * 0.45)}px;font-weight:600;flex:none">A</span>`
const chip = (t, { on = false, muted = false } = {}) => `<span style="display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 10px;border-radius:999px;font-size:12px;${on ? `background:${FG};color:#fff` : muted ? `background:${MUTEDBG};color:${MUTED}` : `border:1px solid ${BORDER};background:#fff`}">${esc(t)}</span>`
const iconBtn = (k, s = 32) => `<span style="display:inline-flex;align-items:center;justify-content:center;width:${s}px;height:${s}px;border-radius:8px;color:${MUTED}">${ic(k, MUTED, 16)}</span>`
const black = (t) => `<span style="display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:8px;background:${FG};color:#fff;font-size:12.5px;font-weight:500">${esc(t)}</span>`
const ghost = (t) => `<span style="display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:8px;border:1px solid ${BORDER};background:#fff;font-size:12.5px">${esc(t)}</span>`

// ═══════════ dock 面板（v2 形态） ═══════════
const VERBS = [['eye', '看'], ['search', '查'], ['ask', '问'], ['edit', '改'], ['spark', '生成']]
const verbRow = (active = 1, enabled = [1, 1, 1, 1, 1]) => `<div style="display:flex;gap:6px;padding:0 14px 10px">${VERBS.map(([k, t], i) => enabled[i] ? `<span style="display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font-size:11.5px;${i === active ? `background:${FG};color:#fff` : `background:${MUTEDBG};color:#525252`}">${ic(k, 'currentColor', 12)}${t}</span>` : '').join('')}</div>`
const card = (inner, extra = '') => `<div style="background:${CARD};border:1px solid ${LINE};border-radius:12px;padding:10px 12px;font-size:12.5px;line-height:1.5;${extra}">${inner}</div>`
const msgUser = (t) => `<div style="display:flex;justify-content:flex-end"><div style="max-width:78%;background:${MUTEDBG};border-radius:12px 12px 4px 12px;padding:8px 12px;font-size:12.5px;line-height:1.5">${esc(t)}</div></div>`
const msgAi = (t) => `<div style="display:flex;gap:8px;align-items:flex-start">${avatar(22)}<div style="font-size:12.5px;line-height:1.55;padding-top:2px">${t}</div></div>`
const inputArea = () => `<div style="border-top:1px solid ${LINE};padding:10px 12px 12px;background:${PANEL}"><div style="min-height:40px;border:1px solid ${BORDER};border-radius:10px;background:#fff;padding:9px 12px;font-size:12.5px;color:#a3a3a3">说说你要的画面，或让我看看这张图…</div><div style="display:flex;align-items:center;gap:4px;margin-top:8px">${iconBtn('plus', 28)}${iconBtn('clip', 28)}${iconBtn('lib', 28)}<span style="display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 9px;border-radius:999px;border:1px solid ${BORDER};font-size:11.5px">自动 ${ic('caret', MUTED, 12)}</span><span style="flex:1"></span><span style="display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:${FG}">${ic('send', '#fff', 14)}</span></div></div>`
const panel = (title, body, { w = 420, h = 560, verbs = [1, 1, 1, 1, 1], active = 1 } = {}) => `<div style="width:${w}px;height:${h}px;background:${PANEL};border:1px solid ${LINE};border-radius:16px;box-shadow:${SH_CARD};display:flex;flex-direction:column;overflow:hidden">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 10px 8px 14px"><span style="display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:600">${esc(title)}${ic('caret', MUTED, 14)}</span><span style="display:flex">${iconBtn('history')}${iconBtn('gear')}${iconBtn('collapse')}</span></div>
  ${verbRow(active, verbs)}
  <div style="flex:1;overflow:hidden;padding:4px 12px 12px;display:flex;flex-direction:column;gap:10px">${body}</div>
  ${inputArea()}
</div>`
const evidence = () => card(`<div style="display:flex;justify-content:space-between;align-items:baseline"><span style="font-weight:500">查 · 新海诚式黄昏光</span><span class="tok" style="color:${MUTED}">3 个来源</span></div><div style="margin-top:4px;color:#525252">逆光 + 高饱和渐变天空 + 云层体积感；来源 #e12 · #e13 印证 2 处</div>`)
const receipt = (n = 3) => card(`<div style="display:flex;align-items:center;gap:8px"><span style="flex:1">已改 ${n} 项 <span style="color:${MUTED}">· 提示词 · 模型 · 比例</span></span><span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:${MUTED}">${ic('undo', MUTED, 13)}撤销</span></div>`)
const confirmCard = () => card(`<div style="font-weight:500">生成 · 4 张 ≈ $0.12</div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">${chip('Seedream 5.0 Pro · 火山')}${chip('16:9 · 2K')}${chip('×4')}</div><div style="margin-top:10px;display:flex;gap:6px">${black('确认生成')}${ghost('取消')}</div>`, `border-color:${FG}`)
const resultCard = () => card(`<div style="display:flex;gap:6px">${[1, 2, 3, 4].map(() => `<div style="flex:1;aspect-ratio:1;border-radius:8px;background:linear-gradient(135deg,#dcdcd8,#c3c3bf)"></div>`).join('')}</div><div style="margin-top:6px;display:flex;justify-content:space-between;color:${MUTED};font-size:11.5px"><span>4 张 · 已入库</span><span>✓ 留 · ✕ 删</span></div>`)
const settled = () => `<div style="display:flex;align-items:center;gap:8px;color:${MUTED};font-size:11px"><span style="flex:1;height:1px;background:${LINE}"></span><span>本轮结论 · 2 事实 · 1 决定</span><span style="flex:1;height:1px;background:${LINE}"></span></div>`
const bodyWorkbench = msgUser('把这张图改成新海诚式黄昏光') + evidence() + receipt(3) + confirmCard()
const bodyCanvas = msgUser('S02 递伞这一镜换成火山渠道，再来一版') + msgAi('S02 已切到 Seedance 2.5 · 火山，参数沿用。') + receipt(1) + resultCard() + settled()
const bodyLora = msgUser('这个鸣潮风格哪个 LoRA 合适') + evidence().replace('查 · 新海诚式黄昏光', '查 · 鸣潮渲染风 LoRA').replace('逆光 + 高饱和渐变天空 + 云层体积感；来源 #e12 · #e13 印证 2 处', 'Anima 家族 2 条候选 · Illustrious 1 条；推荐卡见下') + card(`<div style="font-weight:500">推荐 · WuWa Render v2</div><div style="margin-top:4px;color:#525252">兼容 Anima DiT · 建议权重 0.7 · 触发词 wuwa_style</div><div style="margin-top:8px;display:flex;gap:6px">${black('挂上')}${ghost('看来源')}</div>`)
const bodyVoice = msgUser('第 3 句语气偏冷一点') + msgAi('这一句我建议加 [cold] 标记，不改词；要不要我标出来？') + card(`<div style="font-weight:500">问 · 标记方式</div><div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">${['只标第 3 句', '整段都偏冷', '先听一版对比'].map((t, i) => `<div style="padding:6px 8px;border-radius:8px;border:1px solid ${i === 0 ? FG : BORDER};font-size:12px">${t}</div>`).join('')}</div>`)

// 宿主底
const hostStage = (kind) => {
  if (kind === 'canvas') return `<div style="position:absolute;inset:0;background:${SUNKEN}"><div style="position:absolute;left:24px;top:60px;display:flex;gap:14px">${['S01', 'S02', 'S03'].map((t, i) => `<div style="width:120px;height:78px;border-radius:10px;background:#fff;border:1px solid ${i === 1 ? FG : BORDER};position:relative"><span class="tok" style="position:absolute;left:6px;top:4px">${t}</span></div>`).join('')}</div></div>`
  if (kind === 'lora') return `<div style="position:absolute;inset:0;background:#fff"><div style="position:absolute;left:24px;top:24px;right:24px;display:flex;gap:12px"><div style="width:180px;height:140px;border-radius:12px;background:${MUTEDBG};border:1px solid ${BORDER}"></div><div style="flex:1;display:flex;flex-direction:column;gap:8px"><div style="height:32px;border-radius:8px;background:${MUTEDBG}"></div><div style="height:32px;border-radius:8px;background:${MUTEDBG};width:70%"></div><div class="lab">LoRA 工作台 · 底模 Anima DiT</div></div></div></div>`
  if (kind === 'voice') return `<div style="position:absolute;inset:0;background:#fff"><div style="position:absolute;left:24px;top:24px;right:24px;display:flex;flex-direction:column;gap:8px">${['S01 · 旁白 · 「雨一直下」', 'S02 · 小黑 · 「给你」', 'S03 · 小黑 · 「不用还了」'].map((t, i) => `<div style="height:36px;border-radius:8px;background:${i === 2 ? MUTEDBG : '#fff'};border:1px solid ${BORDER};display:flex;align-items:center;padding:0 12px;font-size:12px">${t}</div>`).join('')}<div class="lab">配音间 · 台词表</div></div></div>`
  return `<div style="position:absolute;inset:0;background:${WORKBENCH}"><div style="position:absolute;left:24px;right:24px;top:24px;height:200px;border-radius:12px;background:#fff;border:1px solid ${BORDER}"></div><div style="position:absolute;left:24px;right:24px;bottom:24px;height:56px;border-radius:12px;background:#fff;border:1px solid ${BORDER}"></div></div>`
}
const shell = (kind, dockInner, { w = 760, h = 520 } = {}) => `<div style="width:${w}px;height:${h}px;border-radius:14px;border:1px solid ${BORDER};position:relative;overflow:hidden;display:flex"><div style="width:44px;background:#f0f0ee;border-right:1px solid ${BORDER};flex:none"></div><div style="flex:1;position:relative">${hostStage(kind)}${dockInner}</div></div>`
const dockOpen = (kind, body, opts = {}) => shell(kind, `<div style="position:absolute;top:12px;right:12px;bottom:12px;width:300px">${panel(opts.title ?? '借伞 · 分镜', body, { w: 300, h: 496, ...opts })}</div>`)
const dockBtn = (kind, badge = 0) => shell(kind, `<div style="position:absolute;right:16px;bottom:16px">${avatar(44)}${badge ? `<span style="position:absolute;top:-4px;right:-4px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:${FG};color:#fff;${MONO}font-size:10px;display:flex;align-items:center;justify-content:center;border:2px solid #fff">${badge}</span>` : ''}</div>`, { h: 240 })

const DOCK = header('PixelVault · D7 ④ · dock · 2026-09-19', '一张脸 · 同一个 dock × 四宿主 · 三态', 'Q1 = A：四宿主都挂工作台 v2 的 StudioAssistantDock（右 12 · 上 12 · 下 12，可拖宽 420–860，方向 B 浅色玻璃：面板最实、卡片靠细描边、只有浮层半透）。头部 = 会话标题▾ · 历史 · 设置 · 收起；五动词胶囊行在头部正下方；输入区两行（文本框 / + · 上传 · 素材库 · LLM chip · 发送）。Q2 = C：收起 = 44px 头像按钮 + 数字角标（待确认 + 未读结果），无角标 = 无事。') +
  sec('展开 · 四宿主', '同一壳，只换宿主底与 op 表') + `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:24px">
    ${state('工作台（图片）', dockOpen('workbench', bodyWorkbench, { active: 3 }), '证据卡 → 「已改 3 项 · 撤销」回执 → 生成确认卡（近黑实底确认键）。五动词全亮。')}
    ${state('画布', dockOpen('canvas', bodyCanvas, { active: 4 }), '底是时间轴上的三镜，S02 被选中；op 落在节点上，回执一行；结果卡自动入库；结论记录作分隔。')}
    ${state('LoRA', dockOpen('lora', bodyLora, { verbs: [1, 1, 1, 0, 0], active: 1, title: 'LoRA · 鸣潮风' }), 'Q5 = A：本轮 LoRA 只有 看 / 查 / 问 —— 胶囊行只三颗；plan_lora_pick 推荐卡归「问」继续用（「挂上」由用户点，不是 op）。')}
    ${state('配音间', dockOpen('voice', bodyVoice, { verbs: [1, 1, 1, 0, 0], active: 2, title: '借伞 · 配音' }), '同样只三颗；问题卡钉在输入框上方（未答态）。台词 / 语气 op 随 E10。')}
  </div>` +
  sec('收起 · 两态', 'Q2 = C') + `<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:24px">
    ${state('无事 · 只有按钮', dockBtn('workbench', 0), '44px 近黑圆按钮，头像字母；右 16 / 下 16（手机沿用 右 16 / 下 96）。')}
    ${state('有事 · 数字角标', dockBtn('workbench', 2), '角标 = 待确认卡 + 未读结果卡；18px 近黑圆、白描边；打开面板即清零。不露最近一条。')}
  </div>` + cap('删掉的：v2 #6 的「微状态卡」收起态（参数摘要三行 + 状态词）整个不要了；画布 StudioNodeAssistantDock 与其历史 / 路由 / 参考选择器三件。')

// ═══════════ 改 · 回执 ═══════════
const formBig = (hl = []) => `<div style="width:520px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_CARD};padding:14px 16px;font-size:12.5px">
  <div style="display:flex;gap:8px;align-items:center">${['Seedream 5.0 Pro · 火山', '16:9 · 2K', '×4'].map((t, i) => `<span style="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:999px;border:1px solid ${BORDER};background:#fff;font-size:13px;${hl.includes(i) ? `outline:2px solid ${FG};outline-offset:2px` : ''}">${t}${ic('caret', MUTED, 12)}</span>`).join('')}</div>
  <div style="margin-top:12px;min-height:64px;border-radius:10px;background:${MUTEDBG};padding:10px 12px;color:#525252;${hl.includes(3) ? `outline:2px solid ${FG};outline-offset:2px` : ''}">A girl in a red raincoat at dusk, Shinkai-style golden backlight, saturated gradient sky, volumetric clouds…</div>
  <div style="margin-top:10px;display:flex;gap:6px">${[1, 2].map((i) => `<div style="width:40px;height:40px;border-radius:8px;background:linear-gradient(135deg,#ddd,#c5c5c5)"></div>`).join('')}<div style="width:40px;height:40px;border-radius:8px;border:1px dashed #c4c4c4"></div></div>
  <div style="margin-top:12px;display:flex;justify-content:flex-end"><span style="display:inline-flex;height:34px;padding:0 16px;border-radius:999px;background:${FG};color:#fff;font-size:13px;font-weight:500;align-items:center">生成 4 张</span></div>
</div>`
const miniPanel = (inner) => `<div style="width:300px;background:${PANEL};border:1px solid ${LINE};border-radius:16px;padding:12px;display:flex;flex-direction:column;gap:10px;box-shadow:${SH_CARD}">${inner}</div>`
const APPLY = header('PixelVault · D7 ④ · 「改」回执 · 2026-09-19', '免费可撤销 op 自动落 · 字段闪一次 · 一行回执 · 整组撤销', 'Q4 = A。一轮内所有自动落的 op 合成面板里一行「已改 N 项 · 撤销」；被改的字段 outline 闪一次（320ms，只动 outline / opacity）；撤销按逆序执行 inverse，整组回滚，回执行变「已撤销」。花钱 / 不可逆 op 不走这条：仍出生成确认卡（近黑确认键）。') +
  sec('落地瞬间', '字段闪 + 回执出现') + `<div style="margin-top:10px;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">${formBig([0, 1, 3])}${miniPanel(msgUser('改成新海诚式黄昏光，Seedream 火山，16:9') + evidence() + receipt(3))}</div>` + cap('模型 chip · 规格 chip · 提示词框三处同时 outline 闪一次（2px 近黑，320ms 后消失）；面板里紧跟证据卡出现一行回执。张数没改所以不闪。') +
  sec('撤销后') + `<div style="margin-top:10px;display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">${formBig([]).replace('Seedream 5.0 Pro · 火山', 'GPT Image 2.5').replace('16:9 · 2K', '1:1 · 2K').replace('A girl in a red raincoat at dusk, Shinkai-style golden backlight, saturated gradient sky, volumetric clouds…', 'A girl in a red raincoat at dusk…')}${miniPanel(msgUser('改成新海诚式黄昏光，Seedream 火山，16:9') + evidence() + card(`<div style="display:flex;align-items:center;gap:8px;color:${MUTED}"><span style="flex:1;text-decoration:line-through">已改 3 项</span><span style="font-size:12px">已撤销</span></div>`))}</div>` + cap('三项按逆序回到改前值；回执行划线并写「已撤销」，不删（结账时进「决定」）。撤销后再改是新的一行。') +
  sec('对照 · 花钱 op 仍确认') + `<div style="margin-top:10px">${miniPanel(receipt(3) + confirmCard())}</div>` + cap('回执与确认卡可以同轮出现：先自动落免费项，再为 generate 出确认卡；确认卡里可就地换模型 / 比例 / 张数（v2 §5 已有）。')

// ═══════════ 剧本节点 ═══════════
const scriptNode = ({ w = 300, projected = false, changed = [] } = {}) => `<div style="width:${w}px;background:#fff;border:1px solid ${BORDER};border-radius:14px;box-shadow:${SH_CARD};overflow:hidden;font-size:12.5px">
  <div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid ${LINE}">${ic('doc', MUTED, 14)}<span style="font-weight:600">剧本 · 借伞</span><span class="tok" style="margin-left:auto;color:${MUTED}">3 幕 · 6 镜</span></div>
  <div style="padding:10px 12px;color:#525252;line-height:1.5">雨夜街角，小黑把伞递给陌生人，两人对视，伞留在了对方手里……</div>
  <div style="padding:0 12px 10px;display:flex;flex-direction:column;gap:4px">${[['S01', '雨夜街角 · 远景', '4s'], ['S02', '递伞 · 中景 · @小黑', '5s'], ['S03', '对视 · 特写 · @小黑 @路人', '3s'], ['S04', '伞留下 · 空镜', '4s']].map(([n, t, d], i) => `<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:${MUTEDBG};${changed.includes(i) ? `border:1px dashed ${AMBER}` : ''}"><span class="tok">${n}</span><span style="flex:1">${t}</span><span class="tok" style="color:${MUTED}">${d}</span>${changed.includes(i) ? `<span style="font-size:10.5px;color:${AMBER}">已变</span>` : ''}</div>`).join('')}<div style="padding:6px 8px;color:${MUTED};font-size:11.5px">+ 2 镜…</div></div>
  <div style="padding:10px 12px;border-top:1px solid ${LINE};display:flex;justify-content:flex-end;gap:6px">${projected ? ghost('重投影 · 1 镜变') : black('确认 · 投影 6 镜')}</div>
</div>`
const shot = (n, t, { state = 'idle', w = 150 } = {}) => `<div style="width:${w}px;border-radius:12px;background:#fff;border:1px solid ${state === 'changed' ? AMBER : state === 'stale' ? BORDER : BORDER};overflow:hidden;font-size:11.5px;${state === 'stale' ? 'opacity:.5' : ''}"><div style="height:74px;background:${state === 'new' ? MUTEDBG : 'linear-gradient(135deg,#dcdcd8,#c3c3bf)'};position:relative"><span class="tok" style="position:absolute;left:6px;top:4px">${n}</span>${state === 'new' ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:${MUTED}">${ic('play', MUTED, 18)}</span>` : ''}${state === 'changed' ? `<span style="position:absolute;right:6px;top:4px;font-size:10px;color:${AMBER}">已变</span>` : ''}</div><div style="padding:6px 8px;display:flex;justify-content:space-between"><span>${t}</span><span class="tok" style="color:${MUTED}">${state === 'new' ? '待生成' : '5s'}</span></div></div>`
const timeline = (shots) => `<div style="position:relative;padding-top:24px"><div style="position:absolute;left:0;right:0;top:12px;height:1px;background:#a3a3a3"></div><div style="display:flex;gap:14px">${shots.join('')}</div></div>`
const SCRIPT = header('PixelVault · D7 ④ · 剧本节点 · 2026-09-19', '一张剧本卡 → 投影成镜头 → 重投影只标变化', 'Q3 = A。剧本是文本类节点的子型 kind=script：Markdown 大纲 + 分镜列表（镜号 · 一句话 · 时长 · @角色）；助手 set_prompt 写它，用户也能手编。「确认 · 投影」= op project_script：按分镜横排出视频节点并从剧本卡连线到每镜文本槽，角色 @ 由卡片总线装填参考槽 + 音色（35 未落先留接口）。') +
  sec('1 · 助手写完，等确认') + `<div style="margin-top:10px;display:flex;gap:40px;align-items:flex-start">${scriptNode()}<div class="cap" style="max-width:380px;margin-top:0">卡片顶部一行元信息；正文大纲；分镜列表每行可点进编辑；底部一颗近黑「确认 · 投影 6 镜」。确认前画布上只有这一张卡，不污染时间轴。</div></div>` +
  sec('2 · 投影后 · 时间轴') + `<div style="margin-top:10px;display:flex;gap:40px;align-items:flex-start"><div style="display:flex;gap:40px;align-items:flex-start">${scriptNode({ projected: true }).replace('重投影 · 1 镜变', '已投影 · 6 镜')}<div style="padding-top:60px">${timeline([shot('S01', '雨夜街角', { state: 'new' }), shot('S02', '递伞', { state: 'new' }), shot('S03', '对视', { state: 'new' }), shot('S04', '伞留下', { state: 'new' })])}</div></div></div>` + cap('六个视频节点按镜号横排在时间轴上，每镜文本槽连到剧本卡（连线从卡右缘出）。@小黑 的镜自动装填角色卡参考 + 音色。节点是「待生成」态，用户逐镜或一键排片生成。') +
  sec('3 · 改了剧本 · 重投影 diff') + `<div style="margin-top:10px;display:flex;gap:40px;align-items:flex-start">${scriptNode({ projected: true, changed: [1] })}<div style="padding-top:60px">${timeline([shot('S01', '雨夜街角'), shot('S02', '递伞 · 近景', { state: 'changed' }), shot('S03', '对视'), shot('S04', '伞留下', { state: 'stale' })])}</div></div>` + cap('S02 文案改了 → 卡里该行虚线 + 「已变」，时间轴对应节点描边 warning + 角标；删掉的镜（S04）节点不删只标灰；新增镜追加到末尾。「重投影 · 1 镜变」只动这一镜的文本槽，已生成的产物保留为旧版本。')

// ═══════════ LoRA / 配音间 壳 · 空态 ═══════════
const emptyPanel = (title, intro, pills, verbs) => panel(title, `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:0 10px">${avatar(40)}<div style="font-size:13.5px;font-weight:600">我是 ANTI，你的画面搭档</div><div style="font-size:12px;color:#525252;line-height:1.55">${esc(intro)}</div><div style="display:flex;flex-direction:column;gap:6px;width:100%;margin-top:6px">${pills.map((t) => `<div style="padding:8px 10px;border-radius:10px;border:1px solid ${BORDER};background:#fff;font-size:12px">${esc(t)}</div>`).join('')}</div></div>`, { w: 320, h: 520, verbs, active: -1 })
const SHELLS = header('PixelVault · D7 ④ · LoRA / 配音间壳 · 2026-09-19', '同一张脸只有 看 / 查 / 问 · 空态与起手药丸', 'Q5 = A：两处都挂同一个 dock，五动词胶囊行只显示三颗（「改」「生成」的 op 表为空集 → 不渲染，不是灰显）。空态沿用 v2 §4.2：头像 + 一句自我介绍 + 三颗语境化起手药丸；不显示结论记录区与钉住区。') +
  `<div style="margin-top:10px;display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start">
    ${state('LoRA 工作台 · 空态', emptyPanel('LoRA · 新会话', '我能看你的参考、查 LoRA 家族和方言、帮你选；挂载和调参这一轮还得你亲手点。', ['帮我找鸣潮渲染风的 LoRA', '这张图用哪个底模合适', '查一下 Anima 家族的触发词'], [1, 1, 1, 0, 0]), '三颗药丸对应 查 / 看 / 查；「挂上」出现在推荐卡里由用户点。')}
    ${state('配音间 · 空态', emptyPanel('借伞 · 配音 · 新会话', '我能读台词表、查语气标记的写法、在拿不准时问你；改台词和标语气这一轮还得你亲手点。', ['这段台词哪句该停顿', '查 Fish 的情绪标记怎么写', '看看角色卡里小黑的音色'], [1, 1, 1, 0, 0]), '台词 / 语气 op 随 E10 语音一起写；此前「改」不出现。')}
  </div>` + cap('两处的会话与工作台 / 画布共用同一 AssistantConversation 表与结账机制；宿主只传 domain 与空 op 表。手机同一半屏 Sheet。')

for (const [name, html] of [
  ['DesignD7Dock.dc.html', page('D7 ④ dock', DOCK)],
  ['DesignD7Apply.dc.html', page('D7 ④ 改回执', APPLY)],
  ['DesignD7Script.dc.html', page('D7 ④ 剧本节点', SCRIPT)],
  ['DesignD7Shells.dc.html', page('D7 ④ LoRA / 配音间壳', SHELLS)],
]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
