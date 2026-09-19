// D56a · 助手记忆：① 反问（四题，owner 已答）+ ② 思维导图
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
  .opt.picked { border-color:${GREEN}; box-shadow:0 0 0 3px oklch(0.95 0.05 155) }
  .opt b { font-size:13.5px } .opt .desc { font-size:12.5px; color:#525252; line-height:1.55 }
  .mock { background:${WORKBENCH}; border-radius:10px; padding:12px; min-height:120px; position:relative; overflow:hidden }
  .pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:999px; border:1px solid ${BORDER}; background:#fff; font-size:11px }
  .rec-tag { ${MONO} font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#fff; background:${FG}; border-radius:999px; padding:2px 8px; display:inline-block; margin-left:8px; vertical-align:middle }
  .pick-tag { ${MONO} font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#fff; background:${GREEN}; border-radius:999px; padding:2px 8px; display:inline-block; margin-left:8px; vertical-align:middle }
  .pros { font-size:12px; color:#404040; line-height:1.55 } .pros span { color:${MUTED} }
  .tree { display:flex; align-items:center }
  .kids { display:flex; flex-direction:column; gap:10px; position:relative; padding-left:32px }
  .kids::before { content:''; position:absolute; left:0; top:0; bottom:0; border-left:1.5px solid #d4d4d4 }
  .br { display:flex; align-items:center; position:relative }
  .br::before { content:''; position:absolute; left:-33px; top:50%; width:33px; border-top:1.5px solid #d4d4d4; z-index:1 }
  .br:first-child::after, .br:last-child::after { content:''; position:absolute; left:-34px; width:5px; background:#fff; z-index:0 }
  .br:first-child::after { top:0; height:50% } .br:last-child::after { top:50%; height:50% } .br:only-child::after { top:0; height:100% }
  .tree > .br::before, .tree > .br::after { display:none }
  table.op { width:100%; border-collapse:collapse; margin-top:10px; font-size:12.5px }
  table.op th, table.op td { border:1px solid ${BORDER}; padding:7px 9px; text-align:left; vertical-align:top; line-height:1.5 }
  table.op th { background:${MUTEDBG}; ${MONO} font-size:10.5px; letter-spacing:.05em; text-transform:uppercase; color:${MUTED}; font-weight:500 }
`
const page = (title, body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title><script src="./support.js"></script></head>
<body><x-dc><helmet><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500&amp;display=swap"><style>${STYLE}</style></helmet>
<div style="padding:40px 48px 56px;background:#fff;box-sizing:border-box;min-height:100vh">${body}</div></x-dc></body></html>
`
const header = (eyebrow, title, sub) => `<div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub)}</p>`
const dot = (c) => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c};flex:none"></span>`
const opt = (letter, title, desc, mock, pros, state = '') => `<div class="opt${state === 'picked' ? ' picked' : state === 'rec' ? ' rec' : ''}"><div><b>${esc(letter)} · ${esc(title)}</b>${state === 'picked' ? '<span class="pick-tag">owner 选定</span>' : state === 'rec' ? '<span class="rec-tag">建议</span>' : ''}</div><div class="mock">${mock}</div><div class="desc">${esc(desc)}</div><div class="pros">${pros.map((p) => `<div>· ${esc(p)}</div>`).join('')}</div></div>`
const q = (n, title, why, opts) => `<div class="q"><h2>Q${n} · ${esc(title)}</h2><p class="why">${esc(why)}</p><div class="opts">${opts.join('')}</div></div>`

// ── 小线框 ──
const memRow = (t, src, w = '100%') => `<div style="display:flex;align-items:center;gap:6px;padding:4px 7px;border:1px solid ${BORDER};border-radius:5px;background:#fff;font-size:9.5px;width:${w};box-sizing:border-box"><span style="flex:1">${esc(t)}</span><span class="tok" style="font-size:8.5px">${esc(src)}</span></div>`
const memTable = `<div style="display:flex;flex-direction:column;gap:5px">${[['偏好横构图 16:9', '图片 · 3 天前'], ['角色「伞下少女」黑长直', '画布 · 昨天'], ['不喜欢过曝的打光', '图片 · 昨天']].map(([a, b]) => memRow(a, b)).join('')}</div>`
const cardTable = `<div style="display:flex;flex-direction:column;gap:5px">${[['@伞下少女 · 角色卡', '3 图 · 常挂'], ['赛博雨夜 · 风格规则', '常挂'], ['偏好横构图 16:9', '记忆?']].map(([a, b], i) => `<div style="display:flex;align-items:center;gap:6px;padding:4px 7px;border:1px ${i === 2 ? 'dashed' : 'solid'} ${i === 2 ? AMBER : BORDER};border-radius:5px;background:#fff;font-size:9.5px"><span style="flex:1">${esc(a)}</span><span class="tok" style="font-size:8.5px">${esc(b)}</span></div>`).join('')}</div>`
const settingsShell = (inner) => `<div style="display:flex;gap:8px;height:150px"><div style="width:76px;border-radius:8px;background:#fff;border:1px solid ${BORDER};padding:8px 6px;display:flex;flex-direction:column;gap:6px;font-size:9px"><div style="color:${MUTED}">API key</div><div style="color:${MUTED}">用量</div><div style="color:${MUTED}">偏好</div><div style="color:${MUTED}">人设</div><div style="font-weight:600">记忆</div></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};padding:8px;overflow:hidden">${inner}</div></div>`
const byScope = `<div style="display:flex;flex-direction:column;gap:7px">${[['图片工作台', 2], ['画布', 2], ['LoRA', 1]].map(([g, n]) => `<div><div style="${MONO}font-size:8.5px;letter-spacing:.05em;color:${MUTED};margin-bottom:3px">${g} · ${n}</div><div style="display:flex;flex-direction:column;gap:3px">${Array.from({ length: n }).map(() => `<div style="height:14px;border-radius:4px;background:${MUTEDBG};border:1px solid ${BORDER}"></div>`).join('')}</div></div>`).join('')}</div>`
const byKind = `<div style="display:flex;flex-direction:column;gap:7px">${[['偏好', 3], ['事实', 2]].map(([g, n]) => `<div><div style="${MONO}font-size:8.5px;letter-spacing:.05em;color:${MUTED};margin-bottom:3px">${g} · ${n}</div><div style="display:flex;flex-direction:column;gap:3px">${Array.from({ length: n }).map(() => `<div style="height:14px;border-radius:4px;background:${MUTEDBG};border:1px solid ${BORDER}"></div>`).join('')}</div></div>`).join('')}</div>`
const panelDrawer = `<div style="display:flex;gap:8px;height:150px"><div style="flex:1;border-radius:8px;background:${WORKBENCH}"></div><div style="width:120px;border-radius:8px;background:#fff;border:1px solid ${BORDER};box-shadow:${SH_FLOAT};padding:8px;font-size:9px"><div style="font-weight:600;margin-bottom:5px">记忆 · 12</div><div style="display:flex;flex-direction:column;gap:3px">${Array.from({ length: 5 }).map(() => `<div style="height:13px;border-radius:4px;background:${MUTEDBG}"></div>`).join('')}</div></div></div>`
const receipt = (n) => `<div style="padding:6px 8px;border:1px solid ${BORDER};border-radius:6px;background:#fff;font-size:10px;display:flex;justify-content:space-between"><span>本轮记住 ${n} 件事</span><span style="color:${MUTED}">改</span></div>`
const ghostToggle = (on) => `<div style="display:flex;align-items:center;gap:6px;font-size:10px;padding:5px 8px;border:1px solid ${on ? FG : BORDER};border-radius:6px;background:#fff">${dot(on ? FG : '#d4d4d4')}<span style="flex:1">隐身 · 这一轮不记</span><div style="width:22px;height:13px;border-radius:999px;background:${on ? FG : '#d4d4d4'};position:relative"><div style="position:absolute;top:1.5px;${on ? 'right:1.5px' : 'left:1.5px'};width:10px;height:10px;border-radius:50%;background:#fff"></div></div></div>`

const q1 = q(1, '56 捆的三件事这一轮怎么切', '56 原文捆了：助手记忆与上下文 · 联网搜索重设计（便签 15）· 页面分析（便签 16）。便签 15 / 16 你自己写的都是「单独设计下」。', [
  opt('A', '拆三片，先做记忆', '56a 记忆 → 56b 联网搜索 → 56c 页面分析，各走各的 ① → ⑤。', `<div style="display:flex;flex-direction:column;gap:6px;font-size:10px">${[['56a 记忆', true], ['56b 联网搜索', false], ['56c 页面分析', false]].map(([t, on]) => `<div style="padding:7px 9px;border-radius:7px;background:#fff;border:1px ${on ? 'solid' : 'dashed'} ${on ? FG : BORDER};color:${on ? FG : MUTED}">${t}${on ? ' · 本轮' : ' · 排队'}</div>`).join('')}</div>`, ['记忆是另外两件的地基：搜到的、分析出的结论都要有地方落', '13 的 /settings 已落地，总览页有地方挂', '三片各自可独立验收，不互相卡住'], 'picked'),
  opt('B', '三件一起设计一张大图', '一次画完记忆 + 搜索 + 分析的全貌。', `<div style="padding:10px;border-radius:8px;border:1px solid ${FG};font-size:10px;text-align:center;background:#fff">56 · 记忆 + 搜索 + 分析<br><span style="color:${MUTED}">一张大图</span></div>`, ['三者衔接不留缝', '④ 画板要画很多屏，落地周期长']),
  opt('C', '先做联网搜索', '便签 9 / 10 对搜索期待最强烈。', `<div style="padding:10px;border-radius:8px;border:1px solid ${FG};font-size:10px;text-align:center;background:#fff">56b · 联网搜索<br><span style="color:${MUTED}">先行</span></div>`, ['最想要的先到手', '搜索结果往哪存、怎么被后续轮次引用，会先撞上记忆还没设计']),
])

const q2 = q(2, '助手自动攒的记忆存在哪', '现在已有 ContextCard（你经营的角色卡 / 风格规则 / 世界观，带正文 · 图 · 负面 · 常挂范围）和「本轮记住 N 件事」的回执形状。', [
  opt('A', '新开一张记忆表 AssistantMemory', '记忆是一行字 + 来源 + 域 + 类目；卡是你亲手经营的素材。两张表，一条桥：记忆可「存为上下文卡」。', `<div style="display:flex;gap:8px"><div style="flex:1"><div class="lab" style="margin-bottom:4px">记忆表</div>${memTable}</div><div style="flex:1"><div class="lab" style="margin-bottom:4px">上下文卡</div>${cardTable.replace(/dashed/, 'solid').replace(new RegExp(AMBER, 'g'), BORDER).replace('记忆?', '—')}</div></div>`, ['@ 面板不会被几百条碎记忆淹掉', '卡的「可挂载 / 常挂 / 待确认」语义不被稀释', '记忆自己的字段（来源 · 最近用到 · 置信）不用硬塞进卡'], 'picked'),
  opt('B', '复用 ContextCard 加一种 kind', '省一张表，总览页与卡片管理共用 UI。', `<div><div class="lab" style="margin-bottom:4px">上下文卡（混入记忆）</div>${cardTable}</div>`, ['实现最省', '@ 面板、常挂范围、待确认区都要为记忆再分一次叉']),
  opt('C', '记忆就是自动建的卡', '助手记住什么就建一张卡，可编辑可挂载可删。', `<div><div class="lab" style="margin-bottom:4px">卡列表</div>${cardTable.replace('记忆?', '自动')}</div>`, ['概念最少', '每条琐碎偏好都变一张卡，卡列表很快失控']),
])

const q3 = q(3, '记忆总览页长什么样', '进 /settings（13 已落地，左侧分区里已经留了「记忆」一格）。', [
  opt('A', '按域分组 + 时间线', '图片 / 视频 / 画布 / LoRA 四组 + 全局一组；组内按最近更新排，按天分段。', settingsShell(byScope), ['你在哪台工作台攒的记忆就在哪组找', '和助手「常挂在这台工作台」的现有语义对得上', '组可整组清空'], 'picked'),
  opt('B', '按类目分组', '偏好 / 事实 / 规则三类横跨所有工作台。', settingsShell(byKind), ['找「我到底说过什么偏好」更快', '看不出这条记忆是在哪台工作台攒的']),
  opt('C', '助手面板内抽屉 + /settings 只放开关', '记忆在用它的地方就近管理。', panelDrawer, ['不用跳设置页', '没有一个统一的地方一次看全、批量删']),
])

const q4 = q(4, '敏感类目不记 + 隐身模式做到什么程度', '56 原文两条：敏感类目不记 · 隐身模式。', [
  opt('A', '自动跳过 + 手动隐身', '服务端一份不记的类目清单自动跳过；另给一个隐身开关，开着时这一轮什么都不写。', `<div style="display:flex;flex-direction:column;gap:6px">${ghostToggle(true)}<div style="font-size:9.5px;color:${MUTED};padding-left:2px">自动跳过：证件 · 账号密码 · 健康 · 私密关系 · 财务</div>${receipt(0)}</div>`, ['两条互不依赖：自动判断失效时隐身仍兜底，反之亦然', '日常不用操心，真要聊敏感的手动一开', '命中类目的内容不写、也不出现在「记住 N 件事」里'], 'picked'),
  opt('B', '只做隐身开关', '不猜敏不敏感，要不要记由你控。', `<div style="display:flex;flex-direction:column;gap:6px">${ghostToggle(false)}${receipt(6)}</div>`, ['最轻、不会误判', '忘了开就会被记下来']),
  opt('C', '自动跳过 + 每条都要你确认', '助手想记什么都先问。', `<div style="display:flex;flex-direction:column;gap:5px">${[1, 2, 3].map(() => `<div style="padding:5px 7px;border:1px solid ${BORDER};border-radius:5px;background:#fff;font-size:9.5px;display:flex;justify-content:space-between"><span>记住这条？</span><span style="color:${MUTED}">记 · 不记</span></div>`).join('')}</div>`, ['隐私上最稳', '「本轮记住 6 件事」变成 6 次打断，日常很吵']),
])

// ─── ② 思维导图 ───
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

const D56 = {
  k: 'root', t: '56a · 记忆：即时写 · 看得见 · 关得掉',
  c: [
    { k: 'cat', t: '存储（Q2 A：新表）', c: [
      { k: 'sub', t: 'AssistantMemory', c: [
        { k: 'leaf', t: '一条 = 一行字：text（进系统提示的就是它）· kind（偏好 / 事实 / 规则）· scope（image · video · canvas · lora · global）' },
        { k: 'leaf', t: '溯源三件：conversationId · messageId · createdAt —— 总览页点「来源」跳回那一轮对话' },
        { k: 'leaf', t: 'lastUsedAt（被注入过就更新）决定注入优先级与淘汰顺序；pinned 置顶不淘汰' },
        { k: 'leaf', t: '索引 (userId, scope, updatedAt desc) 与 (userId, kind)；删除即真删，⛔ 不做软删' },
      ] },
      { k: 'sub', t: '与上下文卡的分界', c: [
        { k: 'leaf', t: '卡 = 你亲手经营的素材（正文 · 图 · 负面 · 常挂范围 · @ 点名）；记忆 = 助手观察到的一行事实或偏好' },
        { k: 'leaf', t: '唯一的桥：一条记忆可「存为上下文卡」→ 建 ContextCard 并把这条记忆标记为已升格；⛔ 反向不自动降级' },
      ] },
    ] },
    { k: 'cat', t: '写入（即时写）', c: [
      { k: 'sub', t: '时机', c: [
        { k: 'leaf', t: '每轮结账时一次性写，与现有「本轮记住 N 件事」同一时刻；⛔ 不在每条消息后写（半句话的偏好不算数）' },
      ] },
      { k: 'sub', t: '回执', c: [
        { k: 'leaf', t: '「本轮记住 6 件事」保持现状；展开逐条可「改 / 删 / 不要记这类」' },
        { k: 'leaf', t: '「不要记这类」= 落一条 kind=rule 的负规则（下次同类不再记），⛔ 不只是删掉眼前这条' },
      ] },
      { k: 'sub', t: '去重', c: [
        { k: 'leaf', t: '同 scope 同 kind 先做规范化字面去重（空白 · 标点 · 大小写）；命中则更新旧条的 updatedAt 而不是新增' },
        { k: 'leaf', s: 'open', t: '语义去重（近义不同字）留到有量之后再看，⛔ 本轮不做向量' },
      ] },
    ] },
    { k: 'cat', t: '注入（怎么被用）', c: [
      { k: 'leaf', t: '每轮只注入当前域 + global 的前 N 条（按 pinned → lastUsedAt 排），⛔ 不是全量倒进系统提示' },
      { k: 'leaf', t: '与上下文卡共用一份上下文预算，卡优先 —— 卡是你亲手挂的，记忆是攒的' },
      { k: 'leaf', s: 'open', t: 'N 取多少、每域上限多少（建议每域 200 条，超了按 lastUsedAt 最旧淘汰并在总览页提示）' },
    ] },
    { k: 'cat', t: '总览页（Q3 A：按域 + 时间线）', c: [
      { k: 'sub', t: '位置', c: [ { k: 'leaf', t: '/settings 的「记忆」一格（13 已落地的分区里已留位）' } ] },
      { k: 'sub', t: '结构', c: [
        { k: 'leaf', t: '五组：图片 · 视频 · 画布 · LoRA · 全局；组内按最近更新排、按天分段' },
        { k: 'leaf', t: '每条一行：文字 + 来源（可跳回那轮对话）+ 时间 + 三个动作（改 · 删 · 存为卡）' },
        { k: 'leaf', t: '组级：整组清空；页级：全部清空（二次确认）' },
      ] },
      { k: 'sub', t: '空态', c: [ { k: 'leaf', t: '还没有记忆时说清楚「助手会在每轮结束时记下偏好与事实，你随时可以删」+ 隐身开关入口' } ] },
    ] },
    { k: 'cat', t: '隐私（Q4 A：自动跳过 + 手动隐身）', c: [
      { k: 'sub', t: '自动跳过', c: [
        { k: 'leaf', t: '不记的类目：身份证件 · 账号密码 / API key · 健康与医疗 · 私密关系 · 财务账户 · 未成年人信息' },
        { k: 'leaf', t: '服务端判断，命中即不写，且不出现在「本轮记住 N 件事」里 —— ⛔ 不写一条「有一条被跳过了」的提示（那本身就是泄露）' },
      ] },
      { k: 'sub', t: '手动隐身', c: [
        { k: 'leaf', t: '面板 ⋯ 菜单一个开关，作用于当前会话；开着时这一轮一条都不写' },
        { k: 'leaf', t: '开着时头部有可见标记（一眼看出现在不记），⛔ 不用红点' },
      ] },
      { k: 'sub', t: '互不依赖', c: [ { k: 'leaf', t: '自动判断失效时隐身仍兜底；隐身忘了开时类目清单仍兜底 —— 两条各自独立成立' } ] },
    ] },
    { k: 'cat', t: '划界（本轮不做）', c: [
      { k: 'leaf', t: '⛔ 不接 Anthropic 原生 memory tool —— 05b 已拍板：记忆是项目级能力，并入助手自己做' },
      { k: 'leaf', t: '⛔ 不做跨用户 / 跨项目共享记忆' },
      { k: 'leaf', t: '⛔ 联网搜索（56b）与页面分析（56c）不在这一片，各自另走 ①' },
      { k: 'leaf', s: 'open', t: '导出记忆（JSON / Markdown）建议先不做，等你真的要迁移时再说' },
    ] },
    { k: 'cat', t: '④ UI 画板要出的', c: [
      { k: 'leaf', t: '总览页：五组 + 时间线 + 一条记忆的三个动作 + 空态' },
      { k: 'leaf', t: '回执展开态：「本轮记住 6 件事」逐条 + 改 / 删 / 不要记这类' },
      { k: 'leaf', t: '隐身：开关在 ⋯ 菜单的位置 + 开着时头部的可见标记' },
      { k: 'leaf', t: '记忆 → 存为上下文卡的那一步（与现有卡片新建弹层的关系）' },
    ] },
  ],
}

const ASK = header('PixelVault · D56a · ① 反问 · 2026-09-19', '助手记忆：范围 · 存储 · 总览页 · 隐私 · 四题', 'owner 2026-09-19 用选择框答完四题，全部取建议档：Q1 A 拆三片先做记忆 · Q2 A 新开记忆表 · Q3 A 按域分组 + 时间线 · Q4 A 自动跳过 + 手动隐身。绿框 = owner 选定。② 思维导图在右侧，是 ③ 要你确认的那张；黄虚线 = 还没定、等你一句话。') + q1 + q2 + q3 + q4

const MAP = header('PixelVault · D56a · ② 思维导图 · 2026-09-19', '记忆 · 决策树（Q1–Q4 已定）', '四题的答案已经落进这棵树。黄虚线四条是这一轮还没定的，都不挡 ④ 画板：注入条数与每域上限 · 语义去重 · 导出。没有批注就进 ④ 画板。') + tree(D56, 300)

for (const [name, html] of [['DesignD56Ask.dc.html', page('D56a ① 反问', ASK)], ['DesignD56Map.dc.html', page('D56a ② 思维导图', MAP)]]) {
  writeFileSync(join(OUT, name), html)
  console.log('wrote', name)
}
