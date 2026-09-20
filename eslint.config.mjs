import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

// Boundary rules — scoped per spec. Other modules opt in once their
// respective specs land. See:
//   docs/spark/2026-05-28-architecture-contract-design.md (Spec 1)
//   docs/spark/2026-05-28-spec-2-studio-shared-layer.md (Spec 2)
//   docs/spark/2026-05-28-spec-3-cards-module.md (Spec 3)
//   docs/spark/2026-05-28-spec-4-image-module.md (Spec 4)
//   docs/spark/roadmap.md

/** L1+ paths that L0 Shared Kernel must NEVER import from. */
const KERNEL_FORBIDDEN_PATTERNS = [
  {
    group: [
      "@/services/prompts/**",
      "@/services/gallery/**",
      "@/services/assets/**",
      "@/services/cards/**",
      "@/services/image/**",
      "@/hooks/prompts/**",
      "@/hooks/gallery/**",
      "@/hooks/assets/**",
      "@/hooks/cards/**",
      "@/hooks/image/**",
      "@/components/business/prompts/**",
      "@/components/business/gallery/**",
      "@/components/business/assets/**",
      "@/components/business/cards/**",
      "@/components/business/image/**",
      "@/services/node/**",
      "@/hooks/node/**",
      "@/components/business/node/**",
    ],
    message:
      "L0 Shared Kernel must not import from L1+ modules. See docs/spark/2026-05-28-architecture-contract-design.md §3.2.",
  },
  {
    group: ["@/app/**", "@/contexts/**"],
    message:
      "L0 Shared Kernel must not import from app routes or React contexts (those are L1+).",
  },
];

/** Sibling L1 modules that L1 Prompts must NEVER import from. */
const PROMPTS_FORBIDDEN_SIBLINGS = [
  {
    group: [
      "@/services/gallery/**",
      "@/services/assets/**",
      "@/services/cards/**",
      "@/hooks/gallery/**",
      "@/hooks/assets/**",
      "@/hooks/cards/**",
      "@/components/business/gallery/**",
      "@/components/business/assets/**",
      "@/components/business/cards/**",
    ],
    message:
      "L1 content domains must not import from sibling L1 modules. Route through L0 Shared Kernel or use a cross-cutting capability there.",
  },
];

/** Sibling L1 modules that L1 Cards must NEVER import from. */
const CARDS_FORBIDDEN_SIBLINGS = [
  {
    group: [
      "@/services/gallery/**",
      "@/services/assets/**",
      "@/services/prompts/**",
      "@/hooks/gallery/**",
      "@/hooks/assets/**",
      "@/hooks/prompts/**",
      "@/components/business/gallery/**",
      "@/components/business/assets/**",
      "@/components/business/prompts/**",
    ],
    message:
      "L1 content domains must not import from sibling L1 modules. Route through L0 Shared Kernel or use a cross-cutting capability there.",
  },
];

/** L2 tools / L3 orchestrator paths that L1.5 Studio Shared must NEVER import from.
 *
 * Note: @/components/business/image/** is intentionally NOT in this list yet.
 * Spec 4 surfaced that StudioCanvas / StudioBottomDock (relocated by Spec 2)
 * still import 5 Image-owned components (CompareGrid, StudioGenerationErrorDialog,
 * StudioResultFeedback, VariantGrid, StudioKeepChangePanel). These are real
 * pre-existing L1.5 → L2 upward dependencies that need StudioCanvas/BottomDock
 * to be split or relocated before they can be enforced. Spec 6 owns that work.
 */
const STUDIO_SHARED_FORBIDDEN_PATTERNS = [
  {
    group: [
      "@/components/business/studio/edit/**",
      "@/components/business/studio/lora/**",
      "@/components/business/studio/node/**",
    ],
    message:
      "L1.5 Studio Shared must not import from L2 tools (edit/lora) or L3 orchestrator (node). Tools call into shared, not the other way around.",
  },
  {
    group: ["@/app/**"],
    message:
      "L1.5 Studio Shared must not import from app routes — keep components pure UI.",
  },
];

/** L3 Node and app paths that L2 Image must NEVER import from. */
const IMAGE_FORBIDDEN_PATTERNS = [
  {
    group: ["@/components/business/studio/node/**"],
    message: "L2 Image must not import from L3 orchestrator (Node).",
  },
  {
    group: ["@/app/**"],
    message:
      "L2 Image must not import from app routes — services/hooks are pure logic.",
  },
];

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
    name: "lucide-react",
    message:
      "Icons come from `@/components/icons` (Phosphor base, lucide names kept as aliases).",
  },
];

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
const ANIMATION_LIBRARY_FORBIDDEN_PATHS = [
  {
    name: "framer-motion",
    message:
      "app 内动效一律 `motion/react`（服务端安全的用 `motion/react-client`）。framer-motion 是 motion 的旧包名，项目没有这个依赖。",
  },
  {
    name: "gsap",
    message:
      "GSAP 只给首页营销域（src/components/business/home-v4/**），且只动态导入。app 内用 motion/react。",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // ─── Spec 1 boundary rules ─────────────────────────────────────
  {
    files: ["src/services/kernel/**/*.{ts,tsx}", "src/hooks/kernel/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: KERNEL_FORBIDDEN_PATTERNS }],
    },
  },
  {
    files: [
      "src/services/prompts/**/*.{ts,tsx}",
      "src/hooks/prompts/**/*.{ts,tsx}",
      "src/components/business/prompts/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: PROMPTS_FORBIDDEN_SIBLINGS }],
    },
  },
  // ─── Spec 2 boundary rules ─────────────────────────────────────
  {
    files: ["src/components/business/studio-shared/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: STUDIO_SHARED_FORBIDDEN_PATTERNS },
      ],
    },
  },
  // ─── Spec 3 boundary rules ─────────────────────────────────────
  {
    files: [
      "src/services/cards/**/*.{ts,tsx}",
      "src/hooks/cards/**/*.{ts,tsx}",
      "src/components/business/cards/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: CARDS_FORBIDDEN_SIBLINGS }],
    },
  },
  // ─── Spec 4 boundary rules ─────────────────────────────────────
  {
    files: [
      "src/services/image/**/*.{ts,tsx}",
      "src/hooks/image/**/*.{ts,tsx}",
      "src/components/business/image/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: IMAGE_FORBIDDEN_PATTERNS }],
    },
  },
  // ─── Spec 5a boundary rules ────────────────────────────────────
  {
    files: [
      "src/services/node/**/*.{ts,tsx}",
      "src/hooks/node/**/*.{ts,tsx}",
      "src/components/business/node/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**"],
              message:
                "L3 Node must not import from app routes — components/hooks/services are pure logic.",
            },
          ],
        },
      ],
    },
  },
  // ─── E1-b · Phosphor icon gate ─────────────────────────────────
  // Every icon in `src/**` resolves through `@/components/icons`. The whole
  // tree is migrated and `lucide-react` is uninstalled, so this is one entry,
  // not a widening list. See LUCIDE_FORBIDDEN_PATHS for why it rides the
  // typescript-eslint rule id and not the base one.
  // ─── 33 ② · 动效库门 ───────────────────────────────────────────
  // 同一条规则 id 管两件事（见 ANIMATION_LIBRARY_FORBIDDEN_PATHS 头注里的
  // flat-config 替换陷阱）：图标基座 + 动效库分工。
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            ...LUCIDE_FORBIDDEN_PATHS,
            ...ANIMATION_LIBRARY_FORBIDDEN_PATHS,
          ],
        },
      ],
    },
  },
  // 首页营销域是 GSAP 唯一的家：把 gsap 这一条摘掉，图标门与 framer-motion
  // 门照旧（整块替换 → 必须把要保留的两条重新列一遍）。
  {
    files: ["src/components/business/home-v4/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            ...LUCIDE_FORBIDDEN_PATHS,
            ...ANIMATION_LIBRARY_FORBIDDEN_PATHS.filter(
              (entry) => entry.name !== "gsap",
            ),
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Salesforce metadata/types are not part of the app source tree.
    ".sfdx/**",
    "workers/**/.wrangler/**",
    "workers/**/node_modules/**",
  ]),
]);

export default eslintConfig;
