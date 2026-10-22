/**
 * Public API for the Prompts module (L1 Content domain).
 *
 * External modules MUST import from this index, not from individual
 * service files. See docs/references/backend.md（分层契约）.
 *
 * Note: prompt-engineering capabilities (compiler, enhance, guard,
 * scene-prompt-compiler, prompt-assistant) live
 * in src/services/kernel/ and are imported through their own surfaces.
 */
export * from './prompt-feedback.service'
export * from './seedance-prompt-plan.service'
