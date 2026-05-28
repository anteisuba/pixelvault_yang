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
