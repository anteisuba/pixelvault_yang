/**
 * Public API for the Prompts module (L1 Content domain).
 *
 * External modules MUST import from this index, not from individual
 * service files. See docs/spark/2026-05-28-architecture-contract-design.md.
 *
 * Note: prompt-engineering capabilities (compiler, enhance, guard,
 * scene-prompt-compiler, prompt-assistant, inspiration-context RAG) live
 * in src/services/kernel/ and are imported through their own surfaces.
 */
export * from './inspiration.service'
export * from './prompt-feedback.service'
export * from './seedance-prompt-plan.service'
