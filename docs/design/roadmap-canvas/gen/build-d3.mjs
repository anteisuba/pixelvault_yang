// D3 · API key 门 + /settings + 顶栏胶囊：① 反问（五题带选项 + 小线框 + 建议）
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
  .mock { background:${WORKBENCH}; border-radius:10px; padding:12px; min-height:120px; position:relative; overflow:hidden }
  .pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:999px; border:1px solid ${BORDER}; background:#fff; font-size:11px }
  .rec-tag { ${MONO} font-size:10px; letter-spacing:.06em; text-transform:uppercase; color:#fff; background:${FG}; border-radius:999px; padding:2px 8px; display:inline-block; margin-left:8px; vertical-align:middle }
  .pros { font-size:12px; color:#404040; line-height:1.55 } .pros span { color:${MUTED} }
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
const dot = (c) => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c};flex:none"></span>`
const bar = (w, h = 8, c = '#d4d4d4', extra = '') => `<div style="width:${w};height:${h}px;border-radius:4px;background:${c};${extra}"></div>`
const opt = (letter, title, desc, mock, pros, rec = false) => `<div class="opt${rec ? ' rec' : ''}"><div><b>${esc(letter)} · ${esc(title)}</b>${rec ? '<span class="rec-tag">建议</span>' : ''}</div><div class="mock">${mock}</div><div class="desc">${esc(desc)}</div><div class="pros">${pros.map((p) => `<div>· ${esc(p)}</div>`).join('')}</div></div>`
const reply = (n, q, a) => `<div style="margin-top:22px;display:grid;grid-template-columns:200px 1fr;gap:0;border:1px solid oklch(0.85 0.08 85);border-radius:10px;overflow:hidden;background:#fff"><div style="padding:12px 14px;background:oklch(0.97 0.04 85);border-right:1px solid oklch(0.85 0.08 85)"><div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:oklch(0.45 0.1 85)">owner 批注 ${n}</div><div style="margin-top:6px;font-size:13px;line-height:1.5;color:#404040">${esc(q)}</div></div><div style="padding:12px 14px;font-size:12.5px;line-height:1.6;color:#0a0a0a">${a.map((x) => `<div style="display:flex;gap:8px"><span style="color:#737373;flex:none">·</span><span>${esc(x)}</span></div>`).join('')}</div></div>`
const q = (n, title, why, opts) => `<div class="q"><h2>Q${n} · ${esc(title)}</h2><p class="why">${esc(why)}</p><div class="opts">${opts.join('')}</div></div>`

// ── 小线框 ──
const shellFrame = (inner) => `<div style="display:flex;gap:8px;height:150px"><div style="width:52px;border-radius:8px;background:#e6e6e2"></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};position:relative;overflow:hidden">${inner}</div></div>`
const settingsPage = `<div style="display:flex;height:100%"><div style="width:96px;border-right:1px solid ${BORDER};padding:10px 8px;display:flex;flex-direction:column;gap:7px;font-size:10px"><div style="font-weight:600">API key</div><div style="color:${MUTED}">用量</div><div style="color:${MUTED}">偏好</div><div style="color:${MUTED}">助手人设</div><div style="color:${MUTED}">记忆</div></div><div style="flex:1;padding:10px 12px;display:flex;flex-direction:column;gap:6px">${['fal', 'OpenAI', '火山 Ark', 'NovelAI'].map((p, i) => `<div style="display:flex;align-items:center;gap:8px;font-size:10.5px;padding:5px 8px;border:1px solid ${BORDER};border-radius:6px">${dot(i === 1 ? RED : i > 1 ? '#c4c4c4' : GREEN)}<span style="flex:1">${p}</span><span class="tok" style="font-size:9.5px">${[31, 5, 9, 4][i]} 模型</span></div>`).join('')}</div></div>`
const drawer = `<div style="position:absolute;inset:0;background:rgba(0,0,0,.18)"></div><div style="position:absolute;top:0;right:0;bottom:0;width:62%;background:#fff;box-shadow:${SH_FLOAT};padding:10px 12px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600"><span>设置</span><span style="color:${MUTED}">×</span></div><div style="display:flex;gap:6px;font-size:9.5px;color:${MUTED}"><span style="color:${FG};border-bottom:1.5px solid ${FG}">key</span><span>用量</span><span>偏好</span><span>人设</span><span>记忆</span></div>${['fal', 'OpenAI', '火山 Ark'].map((p, i) => `<div style="display:flex;align-items:center;gap:8px;font-size:10px;padding:4px 8px;border:1px solid ${BORDER};border-radius:6px">${dot(i === 1 ? RED : GREEN)}<span style="flex:1">${p}</span></div>`).join('')}</div>`

const q1 = q(1, '/settings 是整页还是右侧大抽屉', '13 要新增「key · 用量 · 偏好 · 助手人设 · 记忆总览」五块；现在只有一个 key 抽屉（ApiKeyManager · Sheet），从侧栏底部、画布 ⌘K、账户菜单三处打开。', [
  opt('A', '整页路由 /settings', '左侧分区导航 + 右侧内容；每块一个子路由（/settings/keys …），可直链、可回退、手机变纵向列表。', shellFrame(settingsPage), ['五块内容都有地方长；记忆总览这种长列表只有整页装得下', '缺 key 弹层里的「管理全部 key」直接跳 /settings/keys', '代价：离开当前工作台一次'], true),
  opt('B', '右侧大抽屉（Sheet 560px）', '任何页都能开，不离开工作台；分区变顶部 tab；URL 带 ?settings=keys 以便直链。', shellFrame(drawer), ['配 key 不打断正在写的提示词', '记忆总览、用量明细在 560px 里拥挤，要二级滚动', '与现有 ApiKeyManager 抽屉是同一形态，改造量最小']),
  opt('C', '整页为主 + key 抽屉保留', 'A 的整页承载五块；现有 key 抽屉只保留「快速看健康 / 加一把」，内容与 /settings/keys 同一组件。', shellFrame(settingsPage.replace('flex:1;padding:10px 12px', 'flex:1;padding:10px 12px;opacity:.55') + `<div style="position:absolute;top:0;right:0;bottom:0;width:46%;background:#fff;box-shadow:${SH_FLOAT};padding:10px 12px;font-size:10px"><div style="font-weight:600;margin-bottom:6px">API key</div>${['fal', 'OpenAI'].map((p, i) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;border:1px solid ${BORDER};border-radius:6px;margin-bottom:4px">${dot(i ? RED : GREEN)}<span style="flex:1">${p}</span></div>`).join('')}<div style="color:${MUTED};margin-top:6px">全部设置 →</div></div>`), ['两个面都保留，但多一处要维护同步', '快捷抽屉与整页的边界要写清（抽屉只读 + 加 key，编辑去整页）']),
])

const q2 = q(2, 'key 页按什么组织一行', '一把 key 解锁多个模型（fal 31 个），同一 provider 又可能有两把 key（个人 / 工作）；现在 ApiKeyManager 是「按 key 一行」。', [
  opt('A', '按 provider 一行，展开管多把', '行 = provider 名 · 健康点 · 解锁 N 模型 · 本月用量；点开才看到这家的每把 key（标签 · 末四位 · 上次校验 · 删除）。', `<div style="display:flex;flex-direction:column;gap:6px">${[['fal.ai', GREEN, '31 模型', '$12.40'], ['OpenAI', RED, '5 模型 · 401 失效', '—'], ['火山 Ark', '#c4c4c4', '9 模型 · 未配置', '—']].map(([p, c, m, u]) => `<div style="display:flex;align-items:center;gap:10px;font-size:11px;padding:8px 10px;background:#fff;border:1px solid ${BORDER};border-radius:8px">${dot(c)}<span style="flex:1;font-weight:500">${p}</span><span class="tok">${m}</span><span class="tok" style="color:${MUTED}">${u}</span></div>`).join('')}<div style="margin-left:22px;display:flex;gap:6px;font-size:10px;color:${MUTED}"><span class="pill">个人 · …a3f9 ${dot(GREEN)}</span><span class="pill">工作 · …c201 ${dot(GREEN)}</span><span class="pill">+ 加一把</span></div></div>`, ['新用户先看到「哪家没配」，失效的排最前标红', '与选择器渠道面板的绿 / 黄点同一套语义', '多把 key 是少数人的事，折进二级'], true),
  opt('B', '按 key 一行（现状）', '每把 key 一行：标签 · provider · 健康 · 能力表；provider 重复出现。', `<div style="display:flex;flex-direction:column;gap:6px">${[['fal 个人', 'fal.ai'], ['fal 工作', 'fal.ai'], ['OpenAI', 'OpenAI'], ['Fish', 'Fish Audio']].map(([k, p]) => `<div style="display:flex;align-items:center;gap:10px;font-size:11px;padding:7px 10px;background:#fff;border:1px solid ${BORDER};border-radius:8px">${dot(GREEN)}<span style="flex:1">${k}</span><span class="tok" style="color:${MUTED}">${p}</span></div>`).join('')}</div>`, ['改动最小', '看不出「还有哪家没配」，列表随 key 数变长']),
  opt('C', '按模态分组（图 · 视频 · 音频 · 3D）', '每组下列 provider；一家跨多组会重复出现（fal 四组都有）。', `<div style="display:flex;flex-direction:column;gap:6px;font-size:11px">${['图片 · fal · OpenAI · 火山 · NovelAI', '视频 · fal · 火山 · MiniMax', '音频 · Fish · ElevenLabs'].map((t) => `<div style="padding:7px 10px;background:#fff;border:1px solid ${BORDER};border-radius:8px">${t}</div>`).join('')}</div>`, ['贴近「我要做视频，缺谁的 key」', 'fal 一把 key 出现四次，重复感强']),
])

const ring = (pct, txt) => `<div style="display:inline-flex;align-items:center;gap:6px"><svg width="22" height="22" viewBox="0 0 22 22"><circle cx="11" cy="11" r="9" stroke="${BORDER}" stroke-width="3" fill="none"/><circle cx="11" cy="11" r="9" stroke="${FG}" stroke-width="3" fill="none" stroke-dasharray="${(pct * 56.5).toFixed(1)} 56.5" stroke-linecap="round" transform="rotate(-90 11 11)"/></svg><span style="font-size:11px">${txt}</span></div>`
const q3 = q(3, '用量 / 额度怎么表达（页内与胶囊里）', '平台额度这一档不存在；能显示的只有：Runner 自托管月额度（42 / 300）、按各渠道单价累计的本月花费估算（用自己的 key，真实账单在 provider 那边）。', [
  opt('A', '只显数字', '胶囊：「¥86」或「42 / 300」纯数字；页内一张表：provider · 本月次数 · 估算花费；Runner 一行「42 / 300 · 月底重置」。', `<div style="display:flex;flex-direction:column;gap:8px"><div class="pill" style="height:26px">$86.20 <span style="color:${MUTED}">本月</span></div><div style="font-size:11px;display:flex;flex-direction:column;gap:4px">${[['fal', '128 次', '$61.10'], ['OpenAI', '40 次', '$25.10'], ['Runner', '42 / 300', '¥0']].map(([p, n, c]) => `<div style="display:flex;gap:10px;padding:5px 8px;background:#fff;border:1px solid ${BORDER};border-radius:6px"><span style="flex:1">${p}</span><span class="tok">${n}</span><span class="tok">${c}</span></div>`).join('')}</div></div>`, ['文字最少，符合你「尽量减少文字」', '估算花费要标「估算」，与真实账单不一致时不背锅'], true),
  opt('B', '环形进度', '胶囊里一个小环 + 数字；只有 Runner 有分母能画环，用 key 的花费没有上限，环没意义。', `<div style="display:flex;gap:14px;align-items:center">${ring(0.14, '42 / 300')}${ring(0.6, '$86')}<span style="font-size:11px;color:${MUTED}">← 第二个环的分母是什么？</span></div>`, ['一眼看饱和度', '除 Runner 外没有分母，环会误导']),
  opt('C', '数字 + 用户自设预算条', '用户在 /settings 设一个月预算（可不设）；设了才出细进度条，胶囊里数字变色（接近预算 → warning）。', `<div style="display:flex;flex-direction:column;gap:8px"><div class="pill" style="height:26px;color:${AMBER};border-color:${AMBER}">$86 / $100</div>${bar('100%', 6, BORDER)}${bar('86%', 6, AMBER, 'margin-top:-6px')}<div style="font-size:10.5px;color:${MUTED}">未设预算时 = A</div></div>`, ['给了「别花超」的闸，也不逼没需求的人设', '多一个设置项与一条阈值逻辑']),
])

const q4 = q(4, '助手人设与记忆总览放哪', '56 说记忆总览「进 /settings」；人设三档（助手重审 2026-09-09）现在在助手面板里切。两者都是「关于助手」的设置。', [
  opt('A', '都进 /settings 的「助手」分区', '/settings/assistant：人设三档 · 记忆总览（可见可编 · 来源可溯）· 隐身模式 · 敏感类目开关。助手面板只留一个「设置 →」入口。', `<div style="font-size:11px;display:flex;flex-direction:column;gap:6px"><div style="display:flex;gap:6px">${['简洁', '标准 ✓', '详尽'].map((t) => `<span class="pill">${t}</span>`).join('')}</div>${['喜欢暗色霓虹街景 · 来自 3 次生成', '常用 Seedance 2.5 · 火山', '不要记：地址 / 支付'].map((t) => `<div style="padding:5px 8px;background:#fff;border:1px solid ${BORDER};border-radius:6px;display:flex;justify-content:space-between"><span>${t}</span><span style="color:${MUTED}">✎</span></div>`).join('')}</div>`, ['「关于我」的东西集中一处，符合 13 的清单', '记忆是长列表，整页才装得下'], true),
  opt('B', '留在助手面板里', '人设与记忆都在助手面板的齿轮里；/settings 不碰助手。', `<div style="display:flex;gap:8px;height:120px"><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER}"></div><div style="width:46%;border-radius:8px;background:#fff;border:1px solid ${BORDER};padding:8px;font-size:10px"><div style="display:flex;justify-content:space-between"><span>助手</span><span>⚙</span></div><div style="margin-top:6px;color:${MUTED}">人设 · 记忆 · 隐身</div></div></div>`, ['就地改，不跳页', '记忆总览在窄面板里只能一屏几条']),
  opt('C', '两处入口，同一页', '助手面板齿轮直接打开 /settings/assistant（整页或 Q1 选的形态），不另做一套。', `<div style="font-size:11px;color:#525252;line-height:1.6">助手 ⚙ → /settings/assistant<br>侧栏 / 胶囊 → /settings → 助手<br>同一组件，两条路</div>`, ['A 的收纳 + B 的就近', '要保证从面板跳过去再回来不丢会话（返回键）']),
])

const capsule = (inner) => `<div style="display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 6px 0 10px;border-radius:999px;background:color-mix(in oklab,#fff 78%,transparent);backdrop-filter:blur(12px);border:1px solid rgba(0,0,0,.08);box-shadow:${SH_FLOAT};font-size:11.5px">${inner}</div>`
const avatar = `<span style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#bbb,#888);display:inline-block"></span>`
const q5 = q(5, '应用内顶栏胶囊与侧栏底部账户行的关系', '14 说胶囊（头像 · 额度 · 语言 · key）是 /settings 唯一入口，两态：首页浮岛 / 应用内右上小胶囊。现在侧栏底部已有「积分读数 + 头像菜单」一行。', [
  opt('A', '胶囊替代侧栏底部行', '侧栏只剩导航；账户与额度全部搬到右上胶囊，桌面与手机同一颗（手机在顶栏右侧）。', `<div style="display:flex;gap:8px;height:130px"><div style="width:52px;border-radius:8px;background:#e6e6e2"></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};position:relative"><div style="position:absolute;top:8px;right:8px">${capsule(`<span class="tok">$86</span><span style="width:1px;height:14px;background:${BORDER}"></span><span style="color:${MUTED}">EN</span>${avatar}`)}</div></div></div>`, ['一处入口，14 的「唯一入口」成立', '侧栏折叠时账户仍可达（胶囊不随侧栏走）', '要处理胶囊与页面自己右上角内容（画布工具栏）的位置冲突'], true),
  opt('B', '两处并存', '侧栏底部保留读数 + 头像；胶囊只在首页浮岛出现，应用内不加。', `<div style="display:flex;gap:8px;height:130px"><div style="width:52px;border-radius:8px;background:#e6e6e2;position:relative"><div style="position:absolute;bottom:6px;left:6px;right:6px;height:18px;border-radius:9px;background:#d0d0cc"></div></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER}"></div></div>`, ['改动最小', '与 14 冲突：应用内没有胶囊，/settings 入口仍藏在头像菜单']),
  opt('C', '桌面侧栏行 · 手机胶囊', '桌面保留侧栏底部行（加「设置」项）；手机没有侧栏，用顶栏胶囊。', `<div style="display:flex;gap:14px;align-items:flex-end"><div style="display:flex;gap:6px;height:110px"><div style="width:44px;border-radius:8px;background:#e6e6e2;position:relative"><div style="position:absolute;bottom:6px;left:5px;right:5px;height:16px;border-radius:8px;background:#d0d0cc"></div></div><div style="width:90px;border-radius:8px;background:#fff;border:1px solid ${BORDER}"></div></div><div style="width:64px;height:110px;border-radius:12px;background:#e6e6e2;position:relative"><div style="position:absolute;top:6px;right:5px;width:34px;height:14px;border-radius:7px;background:#fff;border:1px solid ${BORDER}"></div></div></div>`, ['各端沿用各自习惯位置', '两套入口两套状态，14 的「两态」变成「两处」']),
])


const dockFrame = (capsulePos, dockOpen = true, extra = '') => `<div style="display:flex;gap:8px;height:140px"><div style="width:52px;border-radius:8px;background:#e6e6e2"></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};position:relative;overflow:hidden">${dockOpen ? `<div style="position:absolute;top:6px;right:6px;bottom:6px;width:38%;border-radius:8px;background:#fafafa;border:1px solid ${BORDER};padding:8px;font-size:10px"><div style="display:flex;justify-content:space-between;color:${MUTED}"><span>助手</span><span>⚙</span></div>${extra}</div>` : ''}${capsulePos}</div></div>`
const cap = `<span class="tok">$86</span><span style="width:1px;height:14px;background:${BORDER}"></span><span style="color:${MUTED}">EN</span>${avatar}`
const q5b = q('5′', '选 A 的话胶囊与助手面板冲突怎么解', '画布的助手面板是 fixed right-6 top-6 bottom-6、可拖宽（默认 ~400px），占满右边整条；工作台助手停靠也在右侧。右上角胶囊与它必然重叠，要定一条让位规则。', [
  opt('A1', '胶囊锚在舞台右上，面板开时随面板左移', '胶囊的 right = 面板宽 + 间距，跟面板同一条动效曲线滑动；面板关了回到视口右上。手机没有面板，胶囊在顶栏右侧不变。', dockFrame(`<div style="position:absolute;top:8px;right:calc(38% + 14px)">${capsule(cap)}</div>`), ['胶囊永远可见、位置可预期（总在「内容区右上」）', '面板拖宽时胶囊跟着走，一个 CSS 变量即可（--assistant-dock-w）', '要避开画布自己右上角的控件：现在那里没有常驻控件（工具栏在左 / 下）'], true),
  opt('A2', '面板开时胶囊并入面板头部', '面板关：胶囊在视口右上；面板开：胶囊缩成头像 + 额度并到面板头部一行（替代那颗齿轮的位置）。', dockFrame(`<div style="position:absolute;top:8px;right:8px;opacity:.25">${capsule(cap)}</div>`, true, `<div style="position:absolute;top:6px;right:8px;display:flex;align-items:center;gap:6px"><span class="tok">$86</span>${avatar}</div>`), ['右上角始终只有一样东西', '胶囊有两种形态两套位置，动效与状态多一倍', '面板头部本来就挤（人设 chip · 续跑 · 收起）']),
  opt('A3', '胶囊改到左上（侧栏顶端）', '把账户 / 额度放在侧栏顶端 logo 旁；右上角完全让给助手。', `<div style="display:flex;gap:8px;height:140px"><div style="width:52px;border-radius:8px;background:#e6e6e2;position:relative"><div style="position:absolute;top:6px;left:6px;right:6px;height:20px;border-radius:10px;background:#fff;border:1px solid ${BORDER}"></div></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};position:relative"><div style="position:absolute;top:6px;right:6px;bottom:6px;width:38%;border-radius:8px;background:#fafafa;border:1px solid ${BORDER}"></div></div></div>`, ['零冲突', '与 14「首页浮岛 / 应用内右上」的两态设想不一致；侧栏折叠成图标时胶囊没地方放']),
])

// ─── D3 mind map ───
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

const D3 = {
  k: 'root', t: 'D3 · 缺 key 有去处 → 全部设置一页 → 一个入口',
  c: [
    { k: 'cat', t: '目标', c: [
      { k: 'leaf', t: '缺 key 的模型 / 渠道一律灰显可点 → 面 1（现有 QuickSetupDialog，10 已接）；「全部 key · 用量 · 偏好 · 助手人设 · 记忆」第一次有家' },
      { k: 'leaf', t: '四处 key 入口（侧栏底部抽屉 · 账户菜单 · 画布 ⌘K · 顶栏）收成一处：侧栏最底「设置」→ /settings；头像只管去主页' },
    ] },
    { k: 'cat', t: '决策（① 已答）', c: [
      { k: 'leaf', t: 'Q1 = A 整页路由 /settings，左侧分区导航 + 子路由（/settings/keys · usage · preferences · assistant）；手机变纵向列表' },
      { k: 'leaf', t: 'Q2 = A key 页按 provider 一行（健康点 · 解锁 N 模型 · 本月用量），点开管这家的多把 key；失效排最前标红' },
      { k: 'leaf', t: 'Q3 = A 用量只显数字：provider · 本月次数 · 估算花费（标「估算」）；Runner 一行 42 / 300 · 月底重置；不画环' },
      { k: 'leaf', t: 'Q4 = A 人设三档 · 记忆总览 · 隐身 · 敏感类目 都进 /settings/assistant；助手面板只留「设置 →」' },
      { k: 'leaf', t: 'Q5 = A3 胶囊改到侧栏顶端（logo 旁）：只有头像，不显额度；右上角整条让给助手。首页浮岛保持 14 的设想' },
      { k: 'leaf', t: 'Q6 = owner 定案：头像 → 个人主页（/u/用户名）；侧栏最底一行「设置」→ /settings；两者都不弹菜单；API 失效不显红点，进设置页才看到' },
    ] },
    { k: 'cat', t: 'key 门（13 · 一条规则）', c: [
      { k: 'sub', t: '面 1', c: [ { k: 'leaf', t: 'QuickSetupDialog 原样：设置 {渠道} · 三步 · 验证并激活；从选择器渠道面板黄点、生成键「缺 key」、空态引导卡（52）三处打开，验证通过回到原动作' }, { k: 'leaf', t: '底部一行「管理全部 key →」跳 /settings/keys（新增的唯一改动）' } ] },
      { k: 'sub', t: '删', c: [ { k: 'leaf', s: 'gap', t: 'ApiKeyDrawerTrigger + Sheet 抽屉（侧栏底部）· ShellApiKeys 的第二个抽屉入口 · StudioApiRoutesSection · 3D / LoRA 各自的缺 key 提示条 → 全部指向面 1 或 /settings/keys' } ] },
    ] },
    { k: 'cat', t: '/settings（13 · 新页）', c: [
      { k: 'sub', t: '骨架', c: [ { k: 'leaf', t: '桌面：左 200px 分区导航（API key · 用量 · 偏好 · 助手）+ 右内容 720px；手机：一级列表 → 二级页，返回键回列表' }, { k: 'leaf', t: '路由 /settings → 重定向 /settings/keys；每个分区可直链；从工作台来的带 ?from= 以便「返回」' } ] },
      { k: 'sub', t: 'API key', c: [ { k: 'leaf', t: '行 = provider 名 · 健康点（绿 / 红 401 / 灰未配置）· 解锁 N 模型 · 本月用量；点开：这家的每把 key（标签 · 末四位 · 上次校验 · 删除）+「加一把」= 面 1' }, { k: 'leaf', t: '排序：失效 → 已配 → 未配置（失效只在这里标红，入口处不挂红点）；未配置行的「配置」直接开面 1' }, { k: 'leaf', t: 'ApiKeyManager 的内容整体搬进来做这一页，抽屉壳删掉' } ] },
      { k: 'sub', t: '用量', c: [ { k: 'leaf', t: '表：provider · 本月次数 · 估算花费（按渠道单价累计，标「估算 · 以 provider 账单为准」）；Runner 行 42 / 300 + 重置日；底部合计' }, { k: 'leaf', t: '数据源：现有 useUsageSummary + 单价表；不新造统计表，缺的字段列成 ⑤ 的依赖' } ] },
      { k: 'sub', t: '偏好', c: [ { k: 'leaf', t: '语言 · 显示名 · 默认打开哪个工作台 · 生成完成通知；从头像菜单搬来，菜单随之删' } ] },
      { k: 'sub', t: '助手', c: [ { k: 'leaf', t: '人设三档 chip（简洁 / 标准 / 详尽）· 记忆总览（每条：内容 · 来源「来自 N 次生成」· 编辑 / 删除）· 隐身模式开关 · 不记的类目（地址 / 支付 …）' }, { k: 'leaf', s: 'open', t: '记忆的数据形状还没落（56 未做）：本页先出 UI 与空态，56 落地后接真数据' } ] },
    ] },
    { k: 'cat', t: '入口与胶囊（14）', c: [
      { k: 'sub', t: '应用内', c: [ { k: 'leaf', t: '侧栏顶端：logo 右侧一颗头像（28px），点击 = 跳个人主页 /u/用户名（不弹菜单）；折叠成图标时头像留在顶端图标列；不挂任何红点' }, { k: 'leaf', t: '侧栏最底一行「设置」（齿轮 + 文字，折叠只剩齿轮）→ /settings；替代原来的积分读数 + 头像菜单整行；额度只在 /settings/usage 看' }, { k: 'leaf', t: '手机：顶栏胶囊里的头像 → 主页；「设置」进 MobileShell 抽屉最底一行' } ] },
      { k: 'sub', t: '首页', c: [ { k: 'leaf', t: '浮岛胶囊保留 14 的设想：登录后显头像 → 主页 + 一颗齿轮 → /settings；未登录显「登录」；不显额度' } ] },
      { k: 'sub', t: '退出登录', c: [ { k: 'leaf', t: '头像菜单删了以后，退出放 /settings 底部一行；语言切换进偏好；编辑资料留在主页（现状）' } ] },
    ] },
    { k: 'cat', t: '④ UI 画板要出的', c: [
      { k: 'leaf', t: '/settings 四个分区各一版（桌面）+ 手机一级列表与 key 二级页' },
      { k: 'leaf', t: 'key 行三态（健康 / 失效 / 未配置）+ 展开态（多把 key）+ 面 1 底部「管理全部 key →」一行' },
      { k: 'leaf', t: '侧栏顶端头像 + 最底「设置」行（展开 / 折叠）+ 首页浮岛胶囊两态 + 手机抽屉底行' },
    ] },
  ],
}
const MAP = header('PixelVault · D3 · ② 思维导图 · 2026-09-18', 'D3 决策树 · Q1–Q5 全部已定', '① 六题答完：Q1–Q4 = A；Q5 = A3；Q6 = 头像 → 主页、侧栏最底「设置」→ /settings、不显红点。这棵树是 ③ 要你确认的东西：没有红点或批注，我就进 ④ 出 /settings 四分区、key 行三态、侧栏头像与首页浮岛的实际尺寸画板。黄虚线 = 依赖别的条目才能落地。') + tree(D3, 250)

const sideTop = (inner, collapsed = false) => `<div style="display:flex;gap:8px;height:130px"><div style="width:${collapsed ? 44 : 120}px;border-radius:8px;background:#e6e6e2;position:relative;padding:8px;font-size:10px;color:${MUTED}"><div style="display:flex;align-items:center;justify-content:space-between;gap:6px">${inner}</div>${collapsed ? '' : `<div style="margin-top:12px;display:flex;flex-direction:column;gap:6px"><div>工作台</div><div>画布</div><div>画廊</div><div>素材</div></div>`}</div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER}"></div></div>`
const av = (sz = 22, dotOn = false) => `<span style="position:relative;display:inline-block;width:${sz}px;height:${sz}px;border-radius:50%;background:linear-gradient(135deg,#bbb,#888)">${dotOn ? `<span style="position:absolute;top:-1px;right:-1px;width:7px;height:7px;border-radius:50%;background:${RED};border:1.5px solid #fff"></span>` : ''}</span>`
const gear = `<span style="display:inline-flex;width:22px;height:22px;border-radius:6px;align-items:center;justify-content:center;color:${MUTED}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></span>`
const q6 = q(6, '头像直接开 /settings 后，个人主页放哪', '现在头像菜单里有三项：查看主页（/u/用户名，公开的创作者页：头像 · bio · 作品 · 编辑资料）· API 密钥 · 退出登录。Q5 = A3 把菜单删了、头像专职设置，「个人主页」就没了入口。主页是「我」的公开面，设置是「我」的私密面。', [
  opt('B1', '顶端两颗：头像 → 主页，齿轮 → 设置', '侧栏顶端 logo 右侧并排头像与齿轮；头像点进公开主页（符合多数产品的头像语义），齿轮点进 /settings，失效 key 红点挂在齿轮上。折叠时两颗竖排在图标列顶端。', sideTop(`<span style="font-weight:600;color:${FG}">PV</span><span style="display:flex;gap:6px;align-items:center">${av(22)}${gear.replace('color:' + MUTED, 'color:' + MUTED + ';position:relative')}<span style="position:relative;left:-9px;top:-8px;width:7px;height:7px;border-radius:50%;background:${RED};border:1.5px solid #fff"></span></span>`), ['两个去处各一次点击，都不弹菜单（保住你「不弹菜单」的要求）', '红点归齿轮，语义准（失效的是 key 不是人）', '顶端多一颗图标；折叠态顶端变两格'], true),
  opt('B2', '头像 → /settings，主页做成设置里第一张卡', '/settings 顶部一张「我」卡：头像 · 显示名 · bio 一行 ·「查看主页 →」「编辑资料」；主页从设置进，一次点击 + 一次点击。', `<div style="display:flex;height:130px;gap:8px"><div style="width:44px;border-radius:8px;background:#e6e6e2"></div><div style="flex:1;border-radius:8px;background:#fff;border:1px solid ${BORDER};padding:10px;font-size:10px"><div style="display:flex;align-items:center;gap:8px;padding:8px;border:1px solid ${BORDER};border-radius:8px">${av(26)}<div style="flex:1"><div style="font-weight:600;color:${FG}">fulina</div><div style="color:${MUTED}">bio 一行…</div></div><span class="pill" style="height:20px">查看主页 →</span></div><div style="margin-top:8px;color:${MUTED}">API key · 用量 · 偏好 · 助手</div></div></div>`, ['顶端只有一颗头像，最干净', '编辑资料本来就属于设置，放一起顺', '看自己主页要两跳；头像点了不是主页，与常见语义相反']),
  opt('B3', '主页进侧栏导航，头像专职设置', '「我的主页」作为导航项与 画廊 / 素材 并列（图标：人形）；头像仍直开 /settings。', sideTop(`<span style="font-weight:600;color:${FG}">PV</span>${av(22, true)}`).replace('<div>素材</div>', `<div>素材</div><div style="color:${FG}">我的主页</div>`), ['主页与其它「看内容」的页面同级，符合它是浏览面的身份', '头像单颗、直开设置，Q5 原样', '导航多一项；「我的主页」在导航里略显自恋——可命名「主页」']),
  opt('B4', '头像点一下开设置，长按 / 右键开小菜单', '默认单击 = /settings；长按或右键出「查看主页 · 退出登录」两项。', sideTop(`<span style="font-weight:600;color:${FG}">PV</span>${av(22)}`), ['顶端最省', '隐藏手势没人发现，手机长按与系统菜单冲突；不建议']),
])

const ASK = header('PixelVault · D3 · ① 反问 · 2026-09-18', 'API key 门 + /settings + 顶栏胶囊 · 五题', 'D2 落地后，缺 key 的渠道点进去有了面 1（QuickSetupDialog），但「全部 key · 用量 · 偏好 · 助手人设 · 记忆」还没有家，胶囊（14）也还没定与侧栏的关系。五题各给 A / B / C 与小线框，加黑边的是我的建议。owner 已答：Q1–Q4 = A；Q5 = A3（胶囊改到侧栏顶端，不显额度，点击直接开 /settings）。Q6 owner 定案：头像 → 主页，侧栏最底「设置」→ /settings，不显红点。② 思维导图已按此改。已定不再问：缺 key 一律灰显可点 → 面 1；没有平台额度档；面 1 是现有 QuickSetupDialog 原样。') + q1 + q2 + q3 + q4 + q5 + q5b + q6 + reply('Q6 定案', '点击头像跳个人主页；侧边栏最底层加一颗「设置」按钮进 /settings；API 失效不显红点，进设置页才看到什么失效了。', ['头像（侧栏顶端）→ /u/用户名；「设置」（侧栏最底一行，齿轮 + 文字，折叠时只剩齿轮）→ /settings。两个都不弹菜单。', '不做任何红点 / 角标：失效 key 只在 /settings/keys 里排最前标红。', '手机：顶栏胶囊里的头像 → 主页；「设置」进 MobileShell 抽屉的最底一行。首页浮岛胶囊：头像 → 主页，旁边一颗齿轮 → 设置。'])

for (const [name, html] of [['DesignD3Ask.dc.html', page('D3 ① 反问', ASK)], ['DesignD3Map.dc.html', page('D3 ② 思维导图', MAP)]]) { writeFileSync(join(OUT, name), html); console.log('wrote', name) }
