// 测试标准的两条 lint 规矩（docs/references/testing.md「测试标准」，owner 2026-11-03）。
// eslint.config.mjs 与 src/test/test-standard.contract.test.ts 共用这一份。
import { readFileSync } from 'node:fs'

/**
 * 规矩 1「只假边界」：测试里 `vi.mock('@/…')` 只许假这些——网络（api-client）、
 * AI 服务商（llm）、R2、Clerk 登录（user.service）、路由跳转、加解密、日志。
 * 项目外的包（next-intl、sonner、motion…）不在 `@/` 下，本规则不管。
 */
export const MOCKABLE_OWN_MODULES = [
  'lib/logger',
  'lib/api-client',
  'lib/api-client/.+',
  'services/storage/r2',
  'services/llm-text\\.service',
  'services/llm(/.+)?',
  'i18n/navigation',
  'lib/crypto',
  'services/user\\.service',
]

export const MOCKABLE_OWN_MODULE_RE = new RegExp(
  `^@/(${MOCKABLE_OWN_MODULES.join('|')})$`,
)

/**
 * 棘轮：规矩上线时（2026-11-03）已经假了自己模块的文件。名单只减不增——
 * 文件迁好了就从名单删掉（契约测试会提醒），新文件不许进名单。
 */
export const MOCK_BASELINE = JSON.parse(
  readFileSync(new URL('./mock-baseline.json', import.meta.url), 'utf8'),
)

/** 给 eslint `ignores` 用：路径里的 `[id]`、`(main)` 是 glob 特殊字符，要转义。 */
export const MOCK_BASELINE_GLOBS = MOCK_BASELINE.map((file) =>
  file.replace(/[[\]()]/g, '\\$&'),
)

// esquery 的正则字面量里不能出现「/」，用 \x2F 代替。
const allowAlternation = MOCKABLE_OWN_MODULES.map((m) =>
  m.replaceAll('/', '\\x2F'),
).join('|')

export const TEST_STANDARD_SYNTAX_RULES = [
  {
    selector: `CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/][arguments.0.value=/^@\\x2F(?!(${allowAlternation})$)/]`,
    message:
      '只假边界：别 mock 自己的模块（service / hook / store / context / 组件 / 数据库），用真的串起来测；数据库用真库测试（*.int.test.ts）。见 docs/references/testing.md「测试标准」。',
  },
  {
    // `new Promise((r) => setTimeout(r, 3000))` 这类真等。0 / 1 拍那种让事件跑完的不拦。
    selector:
      "CallExpression[callee.name='setTimeout'][arguments.1.type='Literal'][arguments.1.value>=50]",
    message:
      "测试别真等：用 vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }) + advanceTimersByTimeAsync。见 docs/references/testing.md「测试标准」。",
  },
]
