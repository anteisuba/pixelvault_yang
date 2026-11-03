import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier'

import {
  MOCK_BASELINE_GLOBS,
  TEST_STANDARD_SYNTAX_RULES,
} from './scripts/test-standard/rules.mjs'

// 域边界（f-boundary，2026-11-02）。规矩见 docs/design/features-migration.md：
// 业务按域住在 src/features/<域>/，域外只走四个入口——
//   @/features/<域>         客户端组件
//   @/features/<域>/hooks   客户端 hook（不会把组件一起加载）
//   @/features/<域>/core    纯函数与常量
//   @/features/<域>/server  服务端
// 域内互相引用随便写完整路径。测试文件不拦（vi.mock 要按真实文件 mock）。
const FEATURE_DOMAINS = [
  'assets',
  'assistant',
  'canvas',
  'cards',
  'gallery',
  'lora',
  'prompts',
  'settings',
  'studio',
]
const FEATURE_ENTRY_ALLOW = [
  '!@/features/*/hooks',
  '!@/features/*/core',
  '!@/features/*/server',
]
const featureDeepImportPattern = (ownDomain) => ({
  group: [
    '@/features/*/**',
    ...FEATURE_ENTRY_ALLOW,
    ...(ownDomain ? [`!@/features/${ownDomain}/**`] : []),
  ],
  message:
    '跨域只走入口：@/features/<域>（组件）· /hooks · /core · /server。见 docs/design/features-migration.md。',
})
const NO_APP_ROUTES_PATTERN = {
  group: ['@/app/**', '!@/app/**/*.css'],
  message: '组件 / hook / service 不引 app 路由文件（样式表除外）。',
}

/** Icons come from `@/components/icons` (Phosphor base). `lucide-react` is no
 * longer a dependency, so the gate exists to keep it from coming back.
 *
 * ⚠ It rides `@typescript-eslint/no-restricted-imports` rather than the base
 * `no-restricted-imports` the boundary blocks use. A later flat-config block
 * REPLACES an earlier block's options for the SAME rule instead of merging
 * them — a single src-wide entry on the base rule would silently disarm every
 * module's sibling-import patterns (and vice versa). Two distinct rule ids
 * cannot collide, so this stays one entry no matter how many boundary blocks
 * land later. */
const LUCIDE_FORBIDDEN_PATHS = [
  {
    name: 'lucide-react',
    message:
      'Icons come from `@/components/icons` (Phosphor base, lucide names kept as aliases).',
  },
]

/** 动效库分工（`CLAUDE.md` + `ui-defaults.md` §4）。
 *
 * · **app 内只有 `motion`，且只从 `motion/react` 进**（服务端安全的那一档走
 *   `motion/react-client`）。`framer-motion` 是同一个库的旧包名，`package.json`
 *   里**没有**它 —— 写 `from 'framer-motion'` 不会报模块找不到（`motion` 把它
 *   作为传递依赖拖了进来），只会让一个幽灵包悄悄进 bundle。
 * · **GSAP 只给首页营销域**，而且只允许动态导入。截至 2026-09-20 首页一行
 *   GSAP 都没有 —— 规则照样立着，它守的是下一次有人想加的时候。
 *
 * ⚠ 与 Phosphor 图标门共用 `@typescript-eslint/no-restricted-imports`：flat
 * config 里**后一个块会整块替换同名规则的 options**，所以这两道门必须写在
 * 同一个 `paths` 数组里，⛔ 不能各起一个块。
 */
/** 字体只从 npm 包本地加载（owner 2026-10-27）：next/font/google 构建时去 Google
 * 拉，拉不到 Production Build 就挂。做法见 `src/i18n/fonts.ts`。 */
const FONT_FORBIDDEN_PATHS = [
  {
    name: 'next/font/google',
    message:
      '字体走 npm 包 + next/font/local（见 src/i18n/fonts.ts）：next/font/google 构建时联网拉字体，拉不到就挂。',
  },
]

const ANIMATION_LIBRARY_FORBIDDEN_PATHS = [
  {
    name: 'framer-motion',
    message:
      'app 内动效一律 `motion/react`（服务端安全的用 `motion/react-client`）。framer-motion 是 motion 的旧包名，项目没有这个依赖。',
  },
  {
    name: 'gsap',
    message:
      'GSAP 只给首页营销域（src/components/business/home-v4/**），且只动态导入。app 内用 motion/react。',
  },
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // ─── 域边界（f-boundary）───────────────────────────────────────
  // flat config 里同一条规则后一个块会整块替换前一个块的 options，所以每个
  // 文件只落进下面其中一个块：共享层一块、每个域各一块。
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/features/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [featureDeepImportPattern(null)] },
      ],
    },
  },
  {
    files: ['src/components/business/studio-shared/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [featureDeepImportPattern(null), NO_APP_ROUTES_PATTERN],
        },
      ],
    },
  },
  ...FEATURE_DOMAINS.map((domain) => ({
    files: [`src/features/${domain}/**/*.{ts,tsx}`],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [featureDeepImportPattern(domain), NO_APP_ROUTES_PATTERN],
        },
      ],
    },
  })),
  // ─── E1-b · Phosphor icon gate ─────────────────────────────────
  // Every icon in `src/**` resolves through `@/components/icons`. The whole
  // tree is migrated and `lucide-react` is uninstalled, so this is one entry,
  // not a widening list. See LUCIDE_FORBIDDEN_PATHS for why it rides the
  // typescript-eslint rule id and not the base one.
  // ─── 33 ② · 动效库门 ───────────────────────────────────────────
  // 同一条规则 id 管两件事（见 ANIMATION_LIBRARY_FORBIDDEN_PATHS 头注里的
  // flat-config 替换陷阱）：图标基座 + 动效库分工。
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            ...LUCIDE_FORBIDDEN_PATHS,
            ...ANIMATION_LIBRARY_FORBIDDEN_PATHS,
            ...FONT_FORBIDDEN_PATHS,
          ],
        },
      ],
    },
  },
  // 首页营销域是 GSAP 唯一的家：把 gsap 这一条摘掉，图标门与 framer-motion
  // 门照旧（整块替换 → 必须把要保留的两条重新列一遍）。
  {
    files: ['src/components/business/home-v4/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            ...LUCIDE_FORBIDDEN_PATHS,
            ...FONT_FORBIDDEN_PATHS,
            ...ANIMATION_LIBRARY_FORBIDDEN_PATHS.filter(
              (entry) => entry.name !== 'gsap',
            ),
          ],
        },
      ],
    },
  },
  // ─── 前台请求门 ────────────────────────────────────────────────
  // 前台调自家 /api 一律走 apiFetch：会话 token 过期时门口回 401，它续一次会话
  // 再重发（2026-10-29 助手出图报「Failed with status 404」）。裸 fetch 绕过这一步，
  // 组件/hook 里的 fetch 还违反「组件不 fetch」。拉媒体文件等确需裸 fetch 的地方
  // 就地 eslint-disable 并写明理由。
  {
    files: [
      'src/lib/api-client/**/*.{ts,tsx}',
      'src/hooks/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/contexts/**/*.{ts,tsx}',
      'src/features/*/components/**/*.{ts,tsx}',
      'src/features/*/hooks/**/*.{ts,tsx}',
    ],
    ignores: ['src/lib/api-client/api-fetch.ts', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            '调自家 /api 用 src/lib/api-client 里的包装（底层 apiFetch）；组件和 hook 不直接发请求。',
        },
      ],
    },
  },
  // ─── 错误显示门（o-errors 第三轮，2026-11-03）─────────────────────
  // 界面上的报错一律走 useErrorText（errText.api / generation / thrown），见
  // docs/design/errors.md §6。下面三种旧写法会把服务端 / 浏览器的英文原话直接摆到界面上：
  //   1. `response.error ?? t('…')` / `?? 'English'`：原话优先，翻译只是兜底；
  //   2. toast 里塞 `result.error` / `err.message`（含 `t('x', { reason: result.error })`）；
  //   3. 组件里 `err instanceof Error ? err.message : …`。
  // 只是把原话往下传（`payload.error ?? ''` 交给分类器）不拦。服务端 / api-client /
  // 分类器本身要读原话，不在范围内。
  {
    files: [
      'src/hooks/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      'src/contexts/**/*.{ts,tsx}',
      'src/features/*/components/**/*.{ts,tsx}',
      'src/features/*/hooks/**/*.{ts,tsx}',
    ],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "LogicalExpression[operator=/^(\\?\\?|\\|\\|)$/][left.type='MemberExpression'][left.property.name='error'][left.object.name=/^(response|result|res|payload|json|data|body)$/]:not([right.type='Literal'][right.value=''])",
          message:
            '别让原话优先：用 useErrorText 的 errText.api / errText.generation(response, t(…))。见 docs/design/errors.md §6。',
        },
        {
          selector:
            "CallExpression[callee.object.name='toast'] MemberExpression[property.name='error'][object.name=/^(response|result|res|payload|json|data|body)$/]",
          message:
            'toast 里别放服务端原话：用 errText.api / errText.generation 把它变成一句人话。',
        },
        {
          selector:
            "CallExpression[callee.object.name='toast'] MemberExpression[property.name='message'][object.name=/^(e|err|error|cause)$/]",
          message: 'toast 里别放异常原话：用 errText.thrown(err, t(…))。',
        },
        {
          // `err instanceof Error ? err.message : t('…')`：翻译只在没有原话时才出现。
          selector:
            "ConditionalExpression[test.operator='instanceof'][test.right.name='Error'][consequent.property.name='message'][alternate.type='CallExpression'][alternate.callee.name=/^t([A-Z]\\w*)?$/]",
          message:
            '异常原话别压过翻译：用 errText.thrown(err, t(…))。见 docs/design/errors.md §6。',
        },
        {
          // `setError(err instanceof Error ? err.message : …)`：原话直接进界面状态。
          selector:
            "CallExpression[callee.name=/^set\\w*Error$/] > ConditionalExpression[test.operator='instanceof'][consequent.property.name='message']",
          message:
            '界面状态里别存异常原话：用 errText.thrown(err, t(…))。见 docs/design/errors.md §6。',
        },
      ],
    },
  },
  // ─── 测试标准门（o-tests，2026-11-03）──────────────────────────
  // 只假边界、不真等，见 docs/references/testing.md「测试标准」。规矩上线前已有的
  // 文件在 scripts/test-standard/mock-baseline.json，名单只减不增。
  {
    files: ['**/*.test.{ts,tsx}'],
    ignores: MOCK_BASELINE_GLOBS,
    rules: {
      'no-restricted-syntax': ['error', ...TEST_STANDARD_SYNTAX_RULES],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated Salesforce metadata/types are not part of the app source tree.
    '.sfdx/**',
    'workers/**/.wrangler/**',
    'workers/**/node_modules/**',
  ]),
])

export default eslintConfig
