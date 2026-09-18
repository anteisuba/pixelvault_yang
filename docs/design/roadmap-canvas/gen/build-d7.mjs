// D7 · 助手：一张脸 + 剧本节点 + op 表回执 + 范围：① 反问（五题带选项 + 小线框 + 建议）
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = dirname(fileURLToPath(import.meta.url))
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MONO = "font-family:'Geist Mono',ui-monospace,monospace;"
const FG = 'oklch(14.5% 0 0)', MUTED = '#737373', BORDER = 'oklch(92.2% 0 0)', MUTEDBG = 'oklch(97% 0 0)', WORKBENCH = '#f4f4f1', RED = '#b3261e', AMBER = '#a04f00', GREEN = '#16794c'
const SH_FLOAT = '0 1px 2px rgb(0 0 0 / 0.05), 0 8px 28px -12px rgb(0 0 0 / 0.32)'

const STYLE = `
  body { margin:0; background:#fff; color:${FG}; font-family: Geist, 'Noto Sans SC', system-ui, 'PingFang SC', sans-serif; -webkit-font-smoothing:antialiased; }
  h1 { margin:8px 0 0; font-size:26px; font-weight:600; letter-spacing:-.01em; line-height:1.2 }
  .eyebrow { ${MONO} font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:${MUTED} }
  .sub { margin:8px 0 0; font-size:14px; line-height:1.6; color:#525252; max-width:1000px }
  .lab { ${MONO} font-size:10.5px; letter-spacing:.05em; color:${MUTED} }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  .q { margin-top:30px; border:1px solid ${BORDER}; border-radius:14px; padding:18px 20px 20px }
  .q h2 { margin:0; font-size:17px; font-weight:600 } .q .why { margin:6px 0 0; font-size:13px; color:#525252; line-height:1.55 }
  .opts { display:flex; gap:16px; margin-top:14px; align-items:stretch; flex-wrap:wrap }
  .opt { flex:1; min-width:300px; border:1px solid ${BORDER}; border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:10px; background:#fff }
  .opt.rec { border-color:${FG}; box-shadow:0 0 0 3px ${MUTEDBG} }
  .opt b { font-size:13.5px } .opt .desc { font-size:12.5px; color:#525252; line-height:1.55 }
  .mock { background:${WORKBENCH}; border-radius:10px; padding:12px; min-height:130px; position:relative; overflow:hidden }
  .rec-tag { ${MONO} font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#fff; background:${FG}; border-radius:999px; padding:2px 8px; display:inline-block; margin-left:8px; vertical-align:middle }
  .pros { font-size:12px; color:#404040; line-height:1.55 }
  .tree { display:flex; align-items:center }
  .kids { display:flex; flex-direction:column; gap:10px; position:relative; padding-left:32px }
  .kids::before { content:''; position:absolute; left:0; top:0; bottom:0; border-left:1.5px solid #d4d4d4 }
  .br { display:flex; align-items:center; position:relative }
  .br::before { content:''; position:absolute; left:-33px; top:50%; width:33px; border-top:1.5px solid #d4d4d4; z-index:1 }
  .br:first-child::after, .br:last-child::after { content:''; position:absolute; left:-34px; width:5px; background:#fff; z-index:0 }
  .br:first-child::after { top:0; height:50% } .br:last-child::after { top:50%; height:50% } .br:only-child::after { top:0; height:100% }
  .tree > .br::before, .tree > .br::after { display:none }
  table.op { border-collapse:collapse; font-size:12.5px; margin-top:12px } table.op th, table.op td { border:1px solid ${BORDER}; padding:7px 10px; text-align:left; vertical-align:top } table.op th { background:${MUTEDBG}; font-weight:600; font-size:12px }
`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const opt = (letter, title, desc, mock, pros, rec = false) => `<div class="opt${rec ? ' rec' : ''}"><div><b>${esc(letter)} · ${esc(title)}</b>${rec ? '<span class="rec-tag">建议</span>' : ''}</div><div class="mock">${mock}</div><div class="desc">${esc(desc)}</div><div class="pros">${pros.map((p) => `<div>· ${esc(p)}</div>`).join('')}</div></div>`
const q = (n, title, why, opts) => `<div class="q"><h2>Q${n} · ${esc(title)}</h2><p class="why">${esc(why)}</p><div class="opts">${opts.join('')}</div></div>`
const pill = (t, on = false) => `<span style="display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:999px;font-size:11px;${on ? `background:${FG};color:#fff` : `border:1px solid ${BORDER};background:#fff`}">${esc(t)}</span>`
const shell = (stage, dock, { dockW = 34 } = {}) => `<div style="display:flex;gap:6px;height:150px"><div style="width:36px;border-radius:8px;background:#e6e6e2"></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};position:relative;overflow:hidden">${stage}</div>${dock ? `<div style="width:${dockW}%;border-radius:8px;background:#fafafa;border:1px solid ${BORDER};padding:8px;font-size:10px;position:relative">${dock}</div>` : ''}</div>`
const dockBody = `<div style="display:flex;justify-content:space-between;color:${MUTED}"><span>助手 · 会话 ▾</span><span>⟨</span></div><div style="margin-top:8px;display:flex;flex-direction:column;gap:5px"><div style="height:8px;width:70%;border-radius:4px;background:#e4e4e0"></div><div style="height:8px;width:55%;border-radius:4px;background:#e4e4e0"></div><div style="margin-top:4px;padding:6px;border:1px solid ${BORDER};border-radius:6px;background:#fff">结果卡 · 已入库</div></div><div style="position:absolute;left:8px;right:8px;bottom:8px;height:26px;border:1px solid ${BORDER};border-radius:8px;background:#fff"></div>`
const formStage = (hl = false) => `<div style="position:absolute;left:10px;right:10px;top:10px;display:flex;flex-direction:column;gap:6px;font-size:10px"><div style="height:28px;border-radius:6px;background:${MUTEDBG};${hl ? `outline:2px solid ${FG};outline-offset:-2px` : ''}"></div><div style="display:flex;gap:6px"><span style="height:20px;padding:0 8px;border-radius:999px;border:1px solid ${BORDER};display:inline-flex;align-items:center;${hl ? `outline:2px solid ${FG}` : ''}">Seedream 5.0</span><span style="height:20px;padding:0 8px;border-radius:999px;border:1px solid ${BORDER};display:inline-flex;align-items:center">16:9 · 2K</span></div><div style="display:flex;gap:4px">${[1, 2].map(() => `<div style="width:26px;height:26px;border-radius:5px;background:#d4d4d0"></div>`).join('')}</div></div>`

const q1 = q(1, '一张脸：四个宿主（工作台 · 画布 · LoRA · 配音间）用哪种 dock 形态', '现状：工作台是 StudioAssistantDock（右侧可拖宽 420–860，可收成按钮，2026-09-06 方向 C 工作日志皮 + 09-11 方向 B 玻璃仪表）；画布是 StudioNodeAssistantDock（右侧 fixed，另一套）；LoRA 与配音间没有助手壳，只有零散入口；手机是半屏 Sheet（#20 已做）。', [
  opt('A', '统一到工作台 v2 的右侧 dock', '四个宿主都挂同一个 StudioAssistantDock：右侧、可拖宽、可收成按钮；画布那套删掉，内容层（五动词 · 卡片 · 结账）也统一。手机四处都是半屏 Sheet。', shell('', dockBody), ['v2 已经是 21 个 commit 打磨过的那张脸，画布向它靠比反过来省', '「换宿主不换脸」= 用户只学一次', '画布右上角让给它后（D3 已定），dock 在画布上再无位置冲突'], true),
  opt('B', '工作台与画布各留一套，只统一内容层', '壳不动，卡片 / 输入区 / 结账用同一组件。', shell('', `<div style="color:${MUTED}">两套壳 · 一套内容</div>`), ['改动最小', '「一张脸」名存实亡；两套 dock 的收起 / 宽度 / 快捷键行为会漂']),
  opt('C', '底部抽屉（全宿主）', '助手从底部升起，占 40% 高，工作区上移；手机形态天然一致。', `<div style="display:flex;flex-direction:column;gap:6px;height:150px"><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER}"></div><div style="height:56px;border-radius:8px;background:#fafafa;border:1px solid ${BORDER};padding:8px;font-size:10px;color:${MUTED}">助手 · 底部抽屉</div></div>`, ['桌面手机同构', '工作台参数栏本来就在底部，两者抢同一条边；画布时间轴也在底']),
])

const q2 = q(2, 'dock 收起时露不露最近一条', 'v2 #6 把收起态做成「微状态卡」（进行中 / 完成 / 待确认三种一行）。问题是没有事件发生时收起态是什么。', [
  opt('A', '只在有事时露一行，平时只是一颗按钮', '空闲 = 44px 圆按钮（头像）；有进行中 / 待确认 / 刚完成 → 按钮旁展开一行微状态卡，点开进面板；完成态 5s 后自动缩回按钮。', `<div style="position:absolute;right:10px;bottom:10px;display:flex;align-items:center;gap:8px"><div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:999px;background:#fff;border:1px solid ${BORDER};box-shadow:${SH_FLOAT};font-size:11px"><span style="width:8px;height:8px;border-radius:50%;background:${AMBER}"></span>等你确认 · 生成 4 张 ≈ $0.12</div><div style="width:34px;height:34px;border-radius:50%;background:${FG}"></div></div>`, ['不占位；有事才说话', '待确认那一行是钱闸的可见层，不能藏', '微状态卡就是现有 #6 的形态，只补「空闲收回」'], true),
  opt('B', '永远露最近一条', '收起态固定一行：最近一条助手消息摘要 + 按钮。', `<div style="position:absolute;right:10px;bottom:10px;display:flex;align-items:center;gap:8px"><div style="padding:6px 10px;border-radius:999px;background:#fff;border:1px solid ${BORDER};font-size:11px;color:${MUTED}">刚才：已按新海诚式改了提示词</div><div style="width:34px;height:34px;border-radius:50%;background:${FG}"></div></div>`, ['随时知道上文', '常驻一行挡画布 / 工作台右下角的内容']),
  opt('C', '只有按钮，事件全靠角标', '收起 = 按钮 + 数字角标。', `<div style="position:absolute;right:10px;bottom:10px;width:34px;height:34px;border-radius:50%;background:${FG}"><span style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:${RED};color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center">1</span></div>`, ['最省', '「等你确认花 $0.12」缩成一个数字，钱闸的可见性倒退；且 D3 刚定不挂红点']),
])

const scriptCard = `<div style="width:150px;border-radius:8px;background:#fff;border:1px solid ${BORDER};padding:8px;font-size:9.5px"><div style="font-weight:600">剧本 · 借伞</div><div style="color:${MUTED};margin-top:3px">大纲 · 3 幕 · 6 镜</div><div style="margin-top:6px;display:flex;flex-direction:column;gap:3px">${['S01 雨夜街角', 'S02 递伞', 'S03 对视'].map((t) => `<div style="padding:3px 6px;border-radius:4px;background:${MUTEDBG}">${t}</div>`).join('')}</div><div style="margin-top:6px">${pill('确认 · 投影 6 镜', true)}</div></div>`
const shots = (n) => `<div style="display:flex;gap:6px">${Array.from({ length: n }).map((_, i) => `<div style="width:54px;height:40px;border-radius:6px;background:#dcdcd8;position:relative"><span style="position:absolute;left:3px;top:2px;${MONO}font-size:8px;color:#525252">S0${i + 1}</span></div>`).join('')}</div>`
const q3 = q(3, '剧本节点在画布上是一张卡还是一组', '便签 18：助手写大纲 → 用户确认 → 每个分镜连线生成；角色槽由卡片总线装填。画布四类节点（文本 / 图片 / 音频 / 视频）已定，视频节点即镜头。', [
  opt('A', '一张「剧本」节点 + 确认后投影成一排镜头节点', '剧本是一张文本类节点（Markdown 大纲 + 分镜列表，可编辑）；点「确认 · 投影」按分镜生成 N 个视频节点横排时间轴并从剧本连线；剧本卡留在画布作源，改剧本可「重投影」只新增 / 标记变化的镜。', `<div style="display:flex;gap:14px;align-items:flex-start">${scriptCard}<div style="padding-top:20px;display:flex;flex-direction:column;gap:6px"><div style="width:20px;height:1px;background:#a3a3a3;margin-left:-14px"></div>${shots(3)}</div></div>`, ['源与投影分开：剧本能改、能重投影；镜头卡照旧是镜头', '角色槽由卡片总线在投影时装填（35 已定的契约）', '一张卡 = 助手「写大纲」的落点，确认前不污染画布'], true),
  opt('B', '一组：直接生成 N 张镜头卡，没有剧本卡', '助手在面板里出大纲卡，用户确认后画布直接出现 N 个镜头节点，大纲留在会话里。', `<div style="padding-top:30px">${shots(4)}</div>`, ['画布上没有「非镜头」的东西', '改大纲要回会话找；镜头之间的「幕」关系丢了']),
  opt('C', '剧本是画布左侧文档面板，不是节点', '剧本住在画布侧栏的文档面板里（类 ScriptDoc），镜头节点从面板拖出。', `<div style="display:flex;gap:6px;height:130px"><div style="width:90px;border-radius:8px;background:#fafafa;border:1px solid ${BORDER};padding:6px;font-size:9px;color:${MUTED}">剧本面板</div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};padding:30px 8px">${shots(3)}</div></div>`, ['文档编辑体验最好', '画布多一块常驻面板；助手 dock 已占右侧，左侧再占一块就只剩中间']),
])

const q4 = q(4, '助手「改」表单时怎么呈现（21 op 表落地后）', '2026-09-06 定：免费且可撤销的 op 自动落，花钱 / 不可逆才确认。现在工作台是 apply 一次改一项 + 回执卡复述一遍，来回多。', [
  opt('A', '字段就地高亮一闪 + 面板里一行回执「已改 3 项 · 撤销」', '改动直接落进表单，被改的字段 outline 闪一次（320ms）；面板里一行合并回执，点「撤销」整组回滚（inverse 已有）。花钱 op 仍出生成确认卡。', shell(formStage(true), `<div style="color:${MUTED}">…</div><div style="margin-top:60px;padding:6px 8px;border:1px solid ${BORDER};border-radius:6px;background:#fff;display:flex;justify-content:space-between"><span>已改 3 项</span><span style="color:${MUTED}">撤销</span></div>`), ['改动落在看得见的对象上（画布助手体验好的原因 ③）', '一行回执替代逐项复述卡；撤销一键整组', '与 D2 的「切模型直接切、不提示」同一口味：少说话'], true),
  opt('B', '逐项确认卡（现状收紧版）', '每个 op 出一张小卡「把模型换成 Seedream？应用 / 跳过」。', shell(formStage(false), `<div style="padding:6px 8px;border:1px solid ${BORDER};border-radius:6px;background:#fff">换模型 → Seedream 5.0<br><span style="color:${MUTED}">应用 · 跳过</span></div>`), ['每步可控', '免费改动也要点，和「免费自动落」的决定冲突']),
  opt('C', '静默落，不回执', '改了就改了，只有字段闪一下。', shell(formStage(true), `<div style="color:${MUTED}">（无回执）</div>`), ['最安静', '用户不知道改了几项、怎么撤；结账记录里也没这一行']),
])

const q5 = q(5, '这一轮的范围：LoRA 与配音间进不进', 'E7 的清单：21 op 表 → 22 一张脸 → 24 剧本节点 → 56 记忆 / 搜索 → 40 反推 / 上下文卡 → 57 清理旧助手。LoRA 与配音间今天没有助手壳，专属 op（挂载 / 参数；台词 / 语气）也没写。', [
  opt('A', '壳四处都挂，op 表先做工作台 + 画布', '四个宿主都能打开同一张脸，都有 看 / 查 / 问；「改」的 op 表本轮只写工作台（表单字段）与画布（节点 op 已有）；LoRA / 配音间的专属 op 排下一轮（LoRA 随 34 向导页，配音间随 E10 语音）。', `<div style="display:flex;gap:6px;font-size:10px">${['工作台 · 看查问改', '画布 · 看查问改', 'LoRA · 看查问', '配音间 · 看查问'].map((t, i) => `<div style="flex:1;padding:8px 6px;border-radius:8px;background:#fff;border:1px solid ${i < 2 ? FG : BORDER};text-align:center">${t}</div>`).join('')}</div>`, ['一张脸先成立，四处一致', '专属 op 跟着各自域的大改一起做，不做两遍', 'LoRA 的 plan_lora_pick 推荐卡（已有）仍能用，只是不写新的 op'], true),
  opt('B', '四个宿主 op 表一次写完', '21 的 spec 一次覆盖四张 op 表并落地。', `<div style="display:flex;gap:6px;font-size:10px">${['工作台', '画布', 'LoRA', '配音间'].map((t) => `<div style="flex:1;padding:8px 6px;border-radius:8px;background:#fff;border:1px solid ${FG};text-align:center">${t} · 全</div>`).join('')}</div>`, ['一次到位', 'LoRA 页与配音间本身还要大改（34 · E10），现在写的 op 表会跟着改两次']),
  opt('C', '只做工作台 + 画布，LoRA / 配音间连壳也不挂', '两处保持现状零散入口。', `<div style="display:flex;gap:6px;font-size:10px">${['工作台', '画布'].map((t) => `<div style="flex:1;padding:8px 6px;border-radius:8px;background:#fff;border:1px solid ${FG};text-align:center">${t}</div>`).join('')}${['LoRA', '配音间'].map((t) => `<div style="flex:1;padding:8px 6px;border-radius:8px;background:${MUTEDBG};border:1px dashed ${BORDER};text-align:center;color:${MUTED}">${t} · 无</div>`).join('')}</div>`, ['范围最小', '「一张脸」只有两张；LoRA 助手是你手绘里明确画了的']),
])

// ─── D7 mind map + op 表骨架 ───
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const tint = (h) => `oklch(0.965 0.022 ${h})`, tintBorder = (h) => `oklch(0.88 0.05 ${h})`, tintText = (h) => `oklch(0.38 0.11 ${h})`
const mdot = (c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${c};margin-right:8px;flex:none;vertical-align:1px"></span>`
function node(n, hue) {
  if (n.k === 'root') return `<div style="background:${accent(hue)};color:#fff;font-size:22px;font-weight:600;padding:14px 22px;border-radius:12px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'cat') return `<div style="background:${tint(hue)};color:${tintText(hue)};border:1px solid ${tintBorder(hue)};font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'sub') return `<div style="background:#fff;border:1px solid ${BORDER};font-size:13px;font-weight:500;line-height:1.45;padding:7px 12px;border-radius:8px;max-width:240px;flex:none">${esc(n.t)}</div>`
  const pre = n.s === 'gap' ? mdot(RED) : n.s === 'open' ? mdot(AMBER) : ''
  const border = n.s === 'open' ? `border:1px dashed ${AMBER}99;background:#fff;` : `background:#f5f5f5;`
  return `<div style="display:flex;align-items:baseline;${border}font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 520}px;flex:none">${pre}<span>${esc(n.t)}</span></div>`
}
const branch = (n, hue) => `<div class="br">${node(n, hue)}${n.c?.length ? `<div class="kids">${n.c.map((c) => branch(c, hue)).join('')}</div>` : ''}</div>`
const tree = (root, hue) => `<div class="tree" style="margin-top:20px">${branch(root, hue)}</div>`

const D7 = {
  k: 'root', t: 'D7 · 一张脸 → 改得见 → 记得住',
  c: [
    { k: 'cat', t: '目标', c: [
      { k: 'leaf', t: '四个宿主（工作台 · 画布 · LoRA · 配音间）打开的是同一个助手：同一 dock、同一五动词、同一卡片、同一结账；换宿主只换 op 表' },
      { k: 'leaf', t: '「改」落在看得见的对象上：字段闪一次 + 一行回执 + 整组撤销；只有花钱 / 不可逆才出确认卡' },
      { k: 'leaf', t: '剧本从会话里的一段话变成画布上的一张卡，确认后投影成镜头；角色由卡片总线装填' },
    ] },
    { k: 'cat', t: '决策（① 已答 09-19）', c: [
      { k: 'leaf', t: 'Q1 = A 四宿主统一到工作台 v2 的右侧 dock（可拖宽 420–860 · 可收成按钮）；画布 StudioNodeAssistantDock 那套删，内容层随之统一' },
      { k: 'leaf', t: 'Q2 = C 收起态只有一颗按钮 + 数字角标（待确认 + 未读完成数）；不露最近一条。⚠ 与 D3「侧栏不挂红点」不冲突：这是 dock 自己的角标，且待确认里含钱闸，进面板才看到金额' },
      { k: 'leaf', t: 'Q3 = A 一张「剧本」文本节点 → 确认投影成一排镜头节点并连线；剧本卡留作源，改剧本可重投影只新增 / 标记变化的镜' },
      { k: 'leaf', t: 'Q4 = A 免费可撤销 op 自动落：字段 outline 闪一次（320ms）+ 面板一行「已改 N 项 · 撤销」整组回滚；花钱 op 仍出生成确认卡' },
      { k: 'leaf', t: 'Q5 = A → 09-19 改口：壳只挂工作台 · 画布 · LoRA 三处（配音间不需要助手）；LoRA 的「改」随 owner WIP 一起来（set_lora_parameters · analyze_references · critique_result），不再是空集' },
    ] },
    { k: 'cat', t: '一张脸（22）', c: [
      { k: 'sub', t: '壳', c: [ { k: 'leaf', t: 'StudioAssistantDock 成为唯一壳：right-6 top-6 bottom-6 · 可拖宽 · 收成 44px 按钮 + 角标；宿主只传 domain 与 op 表；手机半屏 Sheet（#20）' }, { k: 'leaf', s: 'gap', t: '删 StudioNodeAssistantDock · CanvasAssistantHistory · CanvasAssistantRouteSelector · CanvasAssistantReferencePicker（功能并入 v2 的会话历史 · LLM chip · @ 选择器）' } ] },
      { k: 'sub', t: '内容层', c: [ { k: 'leaf', t: '五动词 · 五类卡 · 每轮结账 · 上下文卡提议 · @ / + 菜单 全部沿用 v2；画布多的只是 op 表里的节点 op 与「画布快照」进系统提示（分层：当前镜 + 相邻两镜完整）' }, { k: 'leaf', t: 'LoRA：同一壳，「改」= owner WIP 的 LoRA 工具（set_lora_parameters 等），plan_lora_pick 推荐卡归「问」；配音间不挂助手（09-19）' },
      { k: 'leaf', t: 'owner 09-19（④ 画板）：头部下的五动词胶囊行删掉，动词只作内部分类；问题卡固定多一行「其他：自己填」（批注 42）' } ] },
      { k: 'sub', t: '角标', c: [ { k: 'leaf', t: '数字 = 待确认卡数 + 未读结果卡数；打开面板清零；无事时按钮无角标' } ] },
    ] },
    { k: 'cat', t: 'op 表（21 · spec 骨架）', c: [
      { k: 'sub', t: '形状', c: [ { k: 'leaf', t: '每个宿主一张表：op id · 参数 schema（Zod）· 逆操作 inverse · 费用档（free / paid）· 可逆否 · 校验（客户端）· 落点（表单字段 / 节点 / 素材）；模型只见 apply(action=opId, args)，与 v2 §2.2 一致' }, { k: 'leaf', t: '免费 + 可逆 → 自动落并进「已改 N 项」；paid 或不可逆 → 确认卡（生成 / 删除 / 覆盖手写提示词走三选）' } ] },
      { k: 'sub', t: '工作台表', c: [ { k: 'leaf', t: 'set_prompt · set_negative · set_model（含渠道）· set_specs（比例 / 清晰度 / 时长）· set_count · mount_reference / unmount · mount_lora / unmount / set_lora_weight · set_capability（11 的专属 chip 值）· set_sound / mount_audio_reference（视频）；prime_generate / request_generation 归「请求生成」' } ] },
      { k: 'sub', t: '画布表', c: [ { k: 'leaf', t: '现有 NODE_ASSISTANT_AUTO_APPLY_OPS 8 条原样：add_node · connect · set_prompt · set_model · set_params · attach_asset · rename · move；plan_rerun_downstream · generate · delete 走确认' }, { k: 'leaf', t: '新增 project_script（剧本投影，见 24）· attach_card（卡片总线装填角色槽，35）' } ] },
      { k: 'sub', t: '回执', c: [ { k: 'leaf', t: '一轮内所有自动落的 op 合成一行「已改 N 项 · 撤销」（消息卡里的一行摘要，§2.4）；撤销按逆序执行 inverse；结账时进「决定」' } ] },
    ] },
    { k: 'cat', t: '剧本节点（24）', c: [
      { k: 'sub', t: '卡', c: [ { k: 'leaf', t: '文本类节点的一个子型 kind=script：Markdown 大纲 + 分镜列表（镜号 · 一句话 · 时长 · 角色 @）；可手编；助手 set_prompt 改它' } ] },
      { k: 'sub', t: '投影', c: [ { k: 'leaf', t: '「确认 · 投影 N 镜」= op project_script：按分镜生成视频节点横排时间轴、从剧本卡连线到每镜文本槽；角色 @ 由卡片总线装填参考槽 + 音色（35）' }, { k: 'leaf', t: '重投影：diff 分镜列表，新增镜追加、改文案的镜标「已变」、删掉的镜不删节点只标灰' } ] },
      { k: 'sub', t: '依赖', c: [ { k: 'leaf', s: 'open', t: '35 卡片总线（referenceSlots{role,url,cardId}）未落：投影时的角色装填先留接口，35 落地后接真' } ] },
    ] },
    { k: 'cat', t: '记忆 / 搜索 / 上下文（56 · 40）', c: [
      { k: 'leaf', t: '记忆总览 UI 已在 /settings/assistant（13）；56 落数据形状后接真：记忆即时写 · 来源可溯 · 敏感类目不记 · 隐身' },
      { k: 'leaf', t: '联网搜索重设计（便签 15）与页面分析动作（便签 16）归「查」组，不改脸' },
      { k: 'leaf', t: '40 反推 / 上下文卡：上下文卡提议 → 确认已有（#14）；反推提示词作为「看」的一支' },
    ] },
    { k: 'cat', t: '④ UI 画板要出的', c: [
      { k: 'leaf', t: 'dock 三态（展开 · 收起按钮 · 收起 + 角标）× 四宿主各一帧（同一壳不同底）' },
      { k: 'leaf', t: '「改」回执：字段闪 + 一行回执 + 撤销后的状态；花钱确认卡对照' },
      { k: 'leaf', t: '剧本节点：卡 · 投影后的时间轴 · 重投影 diff 标记' },
      { k: 'leaf', t: 'LoRA 壳：空态与起手药丸（配音间已取消）' },
    ] },
  ],
}
const OPTABLE = `<div class="lab" style="margin-top:28px">21 · op 表 spec 骨架（工作台 · 画布）</div><table class="op"><thead><tr><th>op</th><th>宿主</th><th>参数（要点）</th><th>inverse</th><th>费用 / 可逆</th><th>落点</th></tr></thead><tbody>${[
  ['set_prompt', '工作台 · 画布', 'text · target(prompt|negative)', '旧文本', 'free · 可逆（覆盖手写走三选）', '提示词框 / 节点文本槽'],
  ['set_model', '工作台 · 画布', 'modelId · channelId?', '旧 model+channel', 'free · 可逆', '模型 chip（10）'],
  ['set_specs', '工作台 · 画布', 'aspect? · resolution? · duration?', '旧三值', 'free · 可逆（按 capabilities 吸附）', '规格 chip（12）'],
  ['set_count', '工作台', 'n', '旧 n', 'free · 可逆', '张数'],
  ['set_capability', '工作台', 'key · value（11 派生的专属 chip）', '旧值', 'free · 可逆', '专属 chip 行'],
  ['mount_reference / unmount', '工作台 · 画布', 'assetId · slot(role)', '反向', 'free · 可逆', '参考轨 / 参考槽'],
  ['mount_lora / set_lora_weight', '工作台', 'loraId · weight', '反向 / 旧权重', 'free · 可逆', 'LoRA chip'],
  ['add_node · connect · rename · move', '画布', '现有 8 条 op 原样', '删节点 / 断线 / 旧名 / 旧位', 'free · 可逆', '画布'],
  ['attach_card', '画布', 'cardId · nodeId · role', 'detach', 'free · 可逆（依赖 35）', '角色槽 + @名字 + 音色'],
  ['project_script', '画布', 'scriptNodeId', '撤回本次新增的镜', 'free · 可逆', '时间轴镜头节点'],
  ['generate · plan_rerun_downstream', '工作台 · 画布', '—（参数从快照现取）', '—', 'paid · 确认卡', '生成'],
  ['delete', '画布', 'nodeId', '—', '不可逆 · 确认', '画布'],
].map((r) => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="font-family:ui-monospace,monospace;font-size:12px"' : ''}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table><div class="pros" style="margin-top:8px;color:${MUTED}">LoRA（挂载 / 参数）与配音间（台词 / 语气）两张表随 34 / E10 再写；本表是 spec 的骨架，字段级由 21 的 spec 文档定。</div>`
const MAP = header('PixelVault · D7 · ② 思维导图 · 2026-09-19', 'D7 决策树 · Q1–Q5 已定 + 21 op 表骨架', '① 五题：Q1 A 统一 dock · Q2 C 按钮 + 角标 · Q3 A 剧本卡投影 · Q4 A 闪 + 一行回执 · Q5 改口：三宿主（配音间不要助手），LoRA 的改随 owner WIP。这棵树 + 下面的 op 表骨架是 ③ 要你确认的；没有红点或批注就进 ④。黄虚线 = 依赖别的条目。') + tree(D7, 300) + OPTABLE

const ASK = header('PixelVault · D7 · ① 反问 · 2026-09-18', '助手 · 一张脸 + 剧本节点 + op 回执 + 范围 · 五题', 'owner 2026-09-18：UI 先放一放，助手优先。已定不再问：Operator 唯一引擎 · 五动词 · 卡片五类 · 每轮结账 · 三档人设 · 记忆总览进 /settings（D3）· 手机半屏 Sheet · 「改」与「请求生成」按宿主 op 表重做、免费可撤销自动落、花钱才确认（第 6 页 DesignAssistant）。owner 已答（09-19）：Q1 A · Q2 C · Q3 A · Q4 A · Q5 A。② 思维导图与 21 op 表骨架在右侧。') + q1 + q2 + q3 + q4 + q5

for (const [name, html] of [['DesignD7Ask.dc.html', page('D7 ① 反问', ASK)], ['DesignD7Map.dc.html', page('D7 ② 思维导图', MAP)]]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
