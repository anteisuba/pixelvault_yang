/**
 * Public API for the Node module (L3 Orchestrator).
 *
 * Node is the topmost layer — it can call any downward module (L2, L1.5,
 * L1, L0); lower layers do not know Node exists.
 *
 * See docs/spark/2026-05-28-spec-5a-node-directorialization.md.
 *
 * Note: node-planner-route was sunk to src/services/kernel/ in
 * Spec 1 Action 1, and is consumed via @/services/kernel.
 */
export * from './node-workflow.service'
export * from './node-assistant.service'
export * from './script-breakdown.service'
export * from './story.service'
