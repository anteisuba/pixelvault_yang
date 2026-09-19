// D56b · 调查像 Claude：② 思维导图 + ④ 一块画板（快搜回答 / 深入调查 / 一组反问 / 直喂分析）
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
  .sec { margin-top:30px; display:flex; align-items:baseline; gap:12px } .sec b { font-size:16px; font-weight:600 } .sec span { font-size:12px; color:${MUTED} }
  .lab { ${MONO} font-size:10.5px; letter-spacing:.05em; color:${MUTED} }
  .tok { ${MONO} font-size:10.5px; color:#525252 }
  .cap { margin-top:10px; font-size:12px; line-height:1.55; color:#525252; max-width:560px }
  svg.ic { width:16px; height:16px; stroke:currentColor; fill:none; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; display:block; flex:none }
  .tree { display:flex; align-items:center }
  .kids { display:flex; flex-direction:column; gap:10px; position:relative; padding-left:32px }
  .kids::before { content:''; position:absolute; left:0; top:0; bottom:0; border-left:1.5px solid #d4d4d4 }
  .br { display:flex; align-items:center; position:relative }
  .br::before { content:''; position:absolute; left:-33px; top:50%; width:33px; border-top:1.5px solid #d4d4d4; z-index:1 }
  .br:first-child::after, .br:last-child::after { content:''; position:absolute; left:-34px; width:5px; background:#fff; z-index:0 }
  .br:first-child::after { top:0; height:50% } .br:last-child::after { top:50%; height:50% } .br:only-child::after { top:0; height:100% }
  .tree > .br::before, .tree > .br::after { display:none }
  sup.c { ${MONO} font-size:9px; color:${MUTED}; margin-left:1px; border:1px solid ${BORDER}; border-radius:4px; padding:0 3px; vertical-align:super; line-height:1.2 }
`
const I = {
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  play: '<path d="M8 5v14l11-7z"/>', globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M9 13h6M9 17h6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', chev: '<path d="m9 18 6-6-6-6"/>', pin: '<path d="M12 17v5M5 17h14l-2-5V6a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v6z"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="10" r="1.5"/><path d="M21 16l-5-5-8 8"/>', plus: '<path d="M5 12h14M12 5v14"/>', up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
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
const frame = (inner, bg = WORKBENCH, pad = 22) => `<div style="background:${bg};border-radius:16px;padding:${pad}px;position:relative;display:inline-block;vertical-align:top">${inner}</div>`
const state = (title, inner, note = '') => `<div style="display:inline-block;vertical-align:top;margin:0 24px 24px 0"><div style="font-size:13px;font-weight:600;margin-bottom:8px">${esc(title)}</div>${inner}${note ? cap(note) : ''}</div>`
const btn = (t, { primary = false, small = false, icon = '' } = {}) => `<span style="display:inline-flex;align-items:center;gap:6px;height:${small ? 28 : 34}px;padding:0 ${small ? 10 : 14}px;border-radius:999px;font-size:${small ? 12.5 : 13}px;font-weight:500;${primary ? `background:${FG};color:#fff` : `background:#fff;color:${FG};border:1px solid ${BORDER}`}">${icon}${esc(t)}</span>`

// ─── ② 思维导图 ───
const accent = (h, l = 0.45, c = 0.11) => `oklch(${l} ${c} ${h})`
const tint = (h) => `oklch(0.965 0.022 ${h})`, tintBorder = (h) => `oklch(0.88 0.05 ${h})`, tintText = (h) => `oklch(0.38 0.11 ${h})`
function node(n, hue) {
  if (n.k === 'root') return `<div style="background:${accent(hue)};color:#fff;font-size:22px;font-weight:600;padding:14px 22px;border-radius:12px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  if (n.k === 'cat') return `<div style="background:${tint(hue)};color:${tintText(hue)};border:1px solid ${tintBorder(hue)};font-size:14px;font-weight:600;padding:8px 14px;border-radius:8px;white-space:nowrap;flex:none">${esc(n.t)}</div>`
  return `<div style="display:flex;align-items:baseline;background:#f5f5f5;font-size:13px;line-height:1.5;padding:6px 10px;border-radius:6px;max-width:${n.w ?? 560}px;flex:none"><span>${esc(n.t)}</span></div>`
}
const branch = (n, hue) => `<div class="br">${node(n, hue)}${n.c?.length ? `<div class="kids">${n.c.map((c) => branch(c, hue)).join('')}</div>` : ''}</div>`
const tree = (root, hue) => `<div class="tree" style="margin-top:20px">${branch(root, hue)}</div>`

const D56B = {
  k: 'root', t: '56b · 调查：像 Claude 一样给资料',
  c: [
    { k: 'cat', t: '呈现（Q1）', c: [
      { k: 'leaf', t: '一段正文回答，句尾小角标指向来源；图片与视频封面直接嵌在正文里，点开看大图 / 跳原站' },
      { k: 'leaf', t: '正文逐字流式输出（owner 09-19）：现在只有 streaming 占位与收尾态、正文按段到达，要改成 token 级 delta 或客户端逐字渲染' },
      { k: 'leaf', t: '底部一排来源卡：站点图标 + 标题 + 域名；「参考依据 · N 张图」折叠列表退场，钉住改为钉来源卡' },
    ] },
    { k: 'cat', t: '深度（Q2）', c: [
      { k: 'leaf', t: '快搜默认：一轮 Serper + 读前 3 页全文，几秒出答案，不提钱' },
      { k: 'leaf', t: '深入调查：现有 research-planner / fanout 多轮 + 读全文 + B 站 / Danbooru / 维基连接器。入口两处：说「深入查」，或回答底部的「深入调查」' },
      { k: 'leaf', t: '进度是加载态不是常驻卡（owner 09-19）：一行「深入调查中 · 读全文 5/7」带微光，点开才展开步骤；跑完收成一行折在回答上方' },
    ] },
    { k: 'cat', t: '四种资料', c: [
      { k: 'leaf', t: '文字 = 正文本身 · 图片 = 现有 image 证据 · 链接 = 来源卡 · 视频 = 新增 video 证据（封面 + 时长 + 站点），点开新窗口播放，⛔ 不嵌播放器、不转存' },
    ] },
    { k: 'cat', t: '反问（Q3）', c: [
      { k: 'leaf', t: '与输入框同框（owner 09-19 改口）：选择框一排放在输入框上方，一次一题，选完自动进下一题，答案以小标签留在对话里；「其他，自己填」= 直接在输入框打字发送。⛔ 不在消息流里出问题卡，QuestionCard 退场' },
    ] },
    { k: 'cat', t: '分析（Q4 · 56c 并入）', c: [
      { k: 'leaf', t: '挂图 / 贴视频链接直接进当前多模态模型，回答就是普通正文；视频取关键帧 + 字幕 / 简介一起喂。ReferenceAnalysisCard 退场，56c 不再单独设计' },
    ] },
    { k: 'cat', t: '不做', c: [
      { k: 'leaf', t: '站内嵌视频播放器 · 下载转存视频 · 结构化分析卡 · 单独的证据页 · 搜索结果落库成记忆（56a 另算）' },
    ] },
  ],
}
const MAP = header('PixelVault · D56b · ② 思维导图 · 2026-09-19', '调查 · 决策树（Q1–Q4 已定）', 'owner 09-19：最重要的是网络调查（文字 / 图片 / 视频 / 链接都能给）、反问像 Claude 出选择框、图片视频分析全靠模型、整体像 Claude / GPT。四题全取建议档；看 ④ 后三条改口：深入调查做成加载态 · 正文逐字流式 · 反问与输入框同框一次一题。这棵树六支，没有待定项。') + tree(D56B, 250)

// ─── ④ 一块画板 ───
const dock = (inner, h = 520, { above = '', placeholder = '继续说，或把素材挂进来…' } = {}) => `<div style="width:420px;height:${h}px;background:#fff;border:1px solid ${BORDER};border-radius:16px;box-shadow:${SH_FLOAT};overflow:hidden;display:flex;flex-direction:column">
  <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid ${BORDER};font-size:12.5px"><span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#c9c9c4,#8a8a86);flex:none"></span><span style="font-weight:600">达妮娅</span><span style="flex:1"></span>${ic('dots', MUTED, 16)}</div>
  <div style="flex:1;padding:12px 14px;overflow:hidden;display:flex;flex-direction:column;gap:10px">${inner}</div>
  <div style="border-top:1px solid ${BORDER}">${above}<div style="padding:8px 10px;display:flex;align-items:center;gap:6px"><div style="flex:1;height:32px;border:1px solid ${BORDER};border-radius:10px;padding:0 10px;display:flex;align-items:center;font-size:12px;color:${MUTED}">${esc(placeholder)}</div><span style="width:32px;height:32px;border-radius:50%;background:${FG};display:flex;align-items:center;justify-content:center">${ic('up', '#fff', 15)}</span></div></div>
</div>`
const shimmer = `background:linear-gradient(90deg,${MUTEDBG} 25%,#e8e8e4 50%,${MUTEDBG} 75%);background-size:200% 100%;`
const caret = `<span style="display:inline-block;width:2px;height:13px;background:${FG};vertical-align:-2px;margin-left:1px"></span>`
const loadingLine = (text, { done = false, open = false } = {}) => `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:8px;${done ? `background:${MUTEDBG};` : shimmer}font-size:11.5px;color:${done ? MUTED : '#525252'}">${ic(done ? 'check' : 'search', done ? GREEN : '#525252', 13)}<span style="flex:1">${text}</span><span style="display:inline-block;transform:rotate(${open ? 90 : 0}deg)">${ic('chev', MUTED, 12)}</span></div>`
const userMsg = (t) => `<div style="align-self:flex-end;max-width:85%;background:${MUTEDBG};border-radius:12px;padding:8px 11px;font-size:12.5px;line-height:1.5">${t}</div>`
const cite = (n) => `<sup class="c">${n}</sup>`
const thumb = (w, h, label, video = false) => `<div style="width:${w}px;height:${h}px;border-radius:8px;background:linear-gradient(135deg,#d8d8d3,#b8b8b2);position:relative;flex:none;overflow:hidden">${video ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="width:26px;height:26px;border-radius:50%;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center">${ic('play', '#fff', 12)}</span></span><span style="position:absolute;right:5px;bottom:4px;${MONO}font-size:9px;color:#fff;background:rgba(0,0,0,.55);border-radius:4px;padding:1px 4px">${label}</span>` : ''}</div>`
const sourceCard = (site, title) => `<div style="flex:none;width:118px;border:1px solid ${BORDER};border-radius:8px;padding:6px 8px;font-size:10.5px;line-height:1.35;background:#fff"><div style="display:flex;align-items:center;gap:4px;color:${MUTED};margin-bottom:3px">${ic('globe', MUTED, 10)}<span class="tok" style="font-size:9px">${esc(site)}</span></div><div style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(title)}</div></div>`

const QUICK = dock(`
  ${userMsg('新海诚那种雨夜街道的画风，找点资料给我')}
  <div style="font-size:12.5px;line-height:1.65;color:#262626">这类画面的核心是<b>高饱和的霓虹反光 + 细密雨丝 + 逆光人物剪影</b>${cite(1)}。背景常用深蓝紫底，路面积水做镜面反射，招牌用橙红提亮${cite(2)}。你上传的参考图已经具备前两点，差的是逆光。</div>
  <div style="display:flex;gap:6px">${thumb(92, 62, '')}${thumb(92, 62, '')}${thumb(92, 62, '')}${thumb(92, 62, '12:40', true)}</div>
  <div style="font-size:12.5px;line-height:1.65;color:#262626">B 站这支拆解视频把三层光的叠法讲得最清楚${cite(3)}，看 3:20 起那一段就够。</div>
  <div style="display:flex;gap:6px;overflow:hidden">${sourceCard('zhihu.com', '新海诚式「雨夜霓虹」到底怎么画')}${sourceCard('pixiv.net', '雨夜街道 · 作品集')}${sourceCard('bilibili.com', '三层光叠法拆解 · 12:40')}</div>
  <div style="display:flex;align-items:center;gap:6px;margin-top:2px">${btn('深入调查', { small: true, icon: ic('search', FG, 13) })}${btn('钉住', { small: true, icon: ic('pin', FG, 13) })}<span style="flex:1"></span><span class="tok" style="font-size:10px;color:${MUTED}">搜了 6 条 · 读了 3 页</span></div>
`, 560)

const STREAMING = dock(`
  ${userMsg('新海诚那种雨夜街道的画风，找点资料给我')}
  ${loadingLine('搜了 6 条 · 读了 3 页', { done: true })}
  <div style="font-size:12.5px;line-height:1.65;color:#262626">这类画面的核心是<b>高饱和的霓虹反光 + 细密雨丝 + 逆光人物剪影</b>${cite(1)}。背景常用深蓝紫底，路面积水做镜面反${caret}</div>
`, 360)

const DEEP_LOADING = dock(`
  ${userMsg('深入查，我要做一组分镜，尽量全')}
  ${loadingLine('深入调查中 · 读全文 5 / 7 页 · 约 1 分钟')}
`, 300)

const DEEP_OPEN = dock(`
  ${userMsg('深入查，我要做一组分镜，尽量全')}
  ${loadingLine('深入调查中 · 读全文 5 / 7 页 · 约 1 分钟', { open: true })}
  <div style="margin:-4px 0 0 30px;display:flex;flex-direction:column;gap:5px;font-size:11.5px">
    ${[['check', '拆成 4 个子问题', GREEN], ['check', '搜索 · 18 条 · 知乎 · pixiv · B 站 · 维基', GREEN], ['search', '读全文 · 5 / 7 页', '#525252'], ['doc', '综合成带来源的回答', MUTED]].map(([k, t, c]) => `<div style="display:flex;align-items:center;gap:7px;color:${c}">${ic(k, c, 12)}<span>${t}</span></div>`).join('')}
  </div>
`, 300)

const DEEP_DONE = dock(`
  ${userMsg('深入查，我要做一组分镜，尽量全')}
  ${loadingLine('深入调查 · 20 次搜索 · 读了 7 页', { done: true })}
  <div style="font-size:12.5px;line-height:1.65;color:#262626">分镜可以按「三层光」推进：<b>先立霓虹底色，再压雨丝，最后逆光起人</b>${cite(1)}${cite(4)}。六镜里建议…</div>
`, 300)

const chipsRow = (label, step, opts) => `<div style="padding:8px 10px 2px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:baseline;gap:8px;font-size:11px;color:${MUTED}"><span style="font-weight:600;color:${FG}">${esc(label)}</span><span class="tok" style="font-size:10px">${step}</span></div><div style="display:flex;flex-wrap:wrap;gap:5px">${opts.map((o, i) => `<span style="padding:5px 10px;border-radius:8px;font-size:11.5px;border:1px solid ${i === 0 ? FG : BORDER};background:#fff">${esc(o)}</span>`).join('')}</div></div>`
const answerTag = (q, a) => `<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 8px;border-radius:6px;background:${MUTEDBG};font-size:11px"><span style="color:${MUTED}">${esc(q)}</span><span>${esc(a)}</span></span>`

const Q_STEP1 = dock(`
  ${userMsg('帮我把这段剧本排成分镜')}
  <div style="font-size:12.5px;line-height:1.6;color:#262626">先定三件事，下面选。</div>
`, 340, { above: chipsRow('镜头数量', '1 / 3', ['6 镜（推荐）', '9 镜', '12 镜']), placeholder: '或者直接打字回答…' })

const Q_STEP2 = dock(`
  ${userMsg('帮我把这段剧本排成分镜')}
  <div style="font-size:12.5px;line-height:1.6;color:#262626">先定三件事，下面选。</div>
  <div style="align-self:flex-end;display:flex;gap:5px">${answerTag('镜头', '6 镜')}</div>
`, 340, { above: chipsRow('时长风格', '2 / 3', ['短促快切（推荐）', '长镜头为主']), placeholder: '或者直接打字回答…' })

const Q_DONE = dock(`
  ${userMsg('帮我把这段剧本排成分镜')}
  <div style="font-size:12.5px;line-height:1.6;color:#262626">先定三件事，下面选。</div>
  <div style="align-self:flex-end;display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end">${answerTag('镜头', '6 镜')}${answerTag('时长', '短促快切')}${answerTag('角色', '伞下少女 + 男友')}</div>
  ${loadingLine('排分镜中…')}
`, 340)

const ANALYZE = dock(`
  <div style="align-self:flex-end;display:flex;flex-direction:column;align-items:flex-end;gap:5px;max-width:85%">${thumb(120, 80, '')}<div style="background:${MUTEDBG};border-radius:12px;padding:8px 11px;font-size:12.5px;line-height:1.5">这是什么画风，我想照着做一组</div></div>
  <div style="font-size:12.5px;line-height:1.65;color:#262626">这是<b>厚涂赛璐璐混合</b>：脸和手用赛璐璐硬边平涂，衣服和背景是厚涂笔触，光源单一偏暖。要照着做，提示词里写「cel shading face, painterly background, single warm key light」，比例 3:4 更贴。要不要我直接改到工作台的提示词框？</div>
`, 330)

const UI = header('PixelVault · D56b · ④ UI 画板 · 2026-09-19', '调查回答 · 深入调查 · 反问 · 直喂分析', '都在现有 420px 面板里。没有新面板、没有新页面、没有常驻卡。owner 09-19 三条改口已落：深入调查是加载态 · 正文逐字流式 · 反问与输入框同框一次一题。')
  + sec('快搜回答', 'Claude 式 · 正文逐字流出')
  + state('流出中', frame(STREAMING), '「搜了 6 条 · 读了 3 页」是收好的加载行；正文逐字流出，末尾一根光标。')
  + state('流完', frame(QUICK), '角标点开高亮来源卡；图片开灯箱，视频封面开新窗口。底部「深入调查」是第二档入口之一。')
  + sec('深入调查', '加载态 · 不是常驻卡')
  + state('默认：一行微光', frame(DEEP_LOADING), '只有这一行。微光在动，文字里带进度和预估。')
  + state('点开：步骤', frame(DEEP_OPEN), '点那一行才展开四步；再点收起。')
  + state('跑完：收成一行', frame(DEEP_DONE), '变成灰底一行折在回答上方，形状与快搜的加载行一致。')
  + sec('反问', '与输入框同框 · 一次一题')
  + state('第 1 题', frame(Q_STEP1), '一排选择框坐在输入框上方，推荐项实线排第一。想自己答就直接在输入框打字。')
  + state('选完进第 2 题', frame(Q_STEP2), '刚选的答案变成小标签留在对话里，选择框换成下一题。')
  + state('三题选完', frame(Q_DONE), '选择框消失，三个标签留下，助手直接开始干活。⛔ 没有「确定」按钮。')
  + sec('直喂分析', 'Q4 · 56c 并入')
  + state('挂图问画风', frame(ANALYZE), '没有分析卡，就是一段回答，末尾顺手问要不要落到工作台。视频同理：贴链接进来，取关键帧和字幕一起喂。')

for (const [name, html] of [['DesignD56bMap.dc.html', page('D56b ② 思维导图', MAP)], ['DesignD56bUI.dc.html', page('D56b ④ UI 画板', UI)]]) {
  writeFileSync(join(OUT, name), html)
  console.log('wrote', name)
}
