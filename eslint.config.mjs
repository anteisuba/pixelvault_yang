import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";

// Spec 1 §7 boundary rules — Prompts + Kernel scope only.
// Other modules opt-in once their respective specs land. See
// docs/spark/2026-05-28-architecture-contract-design.md and roadmap.md.

/** L1+ paths that L0 Shared Kernel must NEVER import from. */
const KERNEL_FORBIDDEN_PATTERNS = [
  {
    group: [
      "@/services/prompts/**",
      "@/services/gallery/**",
      "@/services/assets/**",
      "@/services/cards/**",
      "@/hooks/prompts/**",
      "@/hooks/gallery/**",
      "@/hooks/assets/**",
      "@/hooks/cards/**",
      "@/components/business/prompts/**",
      "@/components/business/gallery/**",
      "@/components/business/assets/**",
      "@/components/business/cards/**",
    ],
    message:
      "L0 Shared Kernel must not import from L1 content domains. See docs/spark/2026-05-28-architecture-contract-design.md §3.2.",
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
