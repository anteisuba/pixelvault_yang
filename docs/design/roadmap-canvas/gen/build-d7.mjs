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

const ASK = header('PixelVault · D7 · ① 反问 · 2026-09-18', '助手 · 一张脸 + 剧本节点 + op 回执 + 范围 · 五题', 'owner 2026-09-18：UI 先放一放，助手优先。已定不再问：Operator 唯一引擎 · 五动词 · 卡片五类 · 每轮结账 · 三档人设 · 记忆总览进 /settings（D3）· 手机半屏 Sheet · 「改」与「请求生成」按宿主 op 表重做、免费可撤销自动落、花钱才确认（第 6 页 DesignAssistant）。剩下五个要你拍的：dock 形态 · 收起态 · 剧本节点形态 · 改动回执 · 本轮范围。加黑边的是建议；答完出 ② 思维导图（含 21 op 表 spec 的骨架）。') + q1 + q2 + q3 + q4 + q5

for (const [name, html] of [['DesignD7Ask.dc.html', page('D7 ① 反问', ASK)]]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
