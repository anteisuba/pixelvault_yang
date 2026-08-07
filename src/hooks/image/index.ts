/**
 * Public API for Image module hooks (L2 Tool).
 *
 * External modules MUST import from this index. See
 * docs/references/domains/studio.md.
 *
 * Note: use-image-model-options and use-image-upload stay in hooks/
 * flat — they're cross-cutting hooks consumed by L1.5 candidates and
 * other modules. Spec 6 handles them.
 */
export * from './use-inpaint'
export * from './use-reverse-image'
