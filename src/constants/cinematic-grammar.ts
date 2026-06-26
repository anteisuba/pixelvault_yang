/**
 * Model-neutral cinematic prompt grammar.
 *
 * Distilled from professional shot-language references into reusable
 * instruction blocks. Deliberately NOT branded to any one video model — the
 * same craft (emotional architecture, shot grammar, Z-axis depth,
 * physical-performance白描, light-as-emotion) is the single source of truth for
 * BOTH the ScriptDoc stages (outline / shot breakdown) and any per-model final
 * prompt step (e.g. the Seedance prompt planner). Keep the wording generic so a
 * new video model can reuse it as-is.
 *
 * Two layers, used at two different stages:
 *  - CINEMATIC_EMOTION_GRAMMAR → STORY layer (outline). What happens + why it
 *    moves the audience. No camera mechanics yet.
 *  - CINEMATIC_SHOT_GRAMMAR    → SHOT layer (breakdown / final prompt). How each
 *    beat is filmed: framing, depth, performance, light, pacing.
 */

/**
 * STORY-layer guidance for the outline stage. Moderate intensity by design:
 * a dual-emotion read and the beat arc as a soft guide, NOT a rigid scaffold of
 * mandatory fields — keeps outputs cinematic but light and broadly usable.
 */
export const CINEMATIC_EMOTION_GRAMMAR = `EMOTIONAL ARCHITECTURE — give the story a spine, not a flat list of events.
- Define a clear emotional through-line: where the piece starts emotionally and where it lands. The larger and more earned that shift, the stronger the result.
- Use this beat arc as a soft guide (not every beat is mandatory): anchor (establish the world + a hook in the first beats) -> disturbance -> escalation / struggle -> a tender or hopeful beat -> realization -> low point -> release -> a resonant tail. Keep beats few and purposeful.
- Give each beat a dual emotion: a surface feeling the audience reads first, and an inner undercurrent beneath it. Write emotion as behaviour, never as a bare label.
- Optionally thread 1-3 recurring motifs (an object, a gesture, a light) that recur and subtly mutate to track the emotional progression.
- Cut any beat that does not move the emotional through-line.`

/**
 * SHOT-layer grammar for the breakdown stage and per-model final prompts.
 * Camera vocabulary + the Z-axis depth trick (AI video reads camera-relative
 * depth far better than flat screen sides) + physical-performance白描 + light as
 * emotion + continuity + pacing.
 */
export const CINEMATIC_SHOT_GRAMMAR = `SHOT GRAMMAR — translate each beat into professional camera language.
- Give every shot an explicit shot size, angle, and movement using standard film terms: extreme wide / wide / full / medium / medium close-up / close-up / extreme close-up; eye-level / low-angle / high-angle / Dutch angle / over-the-shoulder / POV / bird's-eye; push-in (dolly in) / pull-out / pan / tilt / tracking / following / whip pan / crane / handheld / arc / dolly zoom (Hitchcock).
- State each shot's purpose — the emotion or information it delivers. Cut shots that add nothing.

Z-AXIS DEPTH — AI video renders camera-relative depth far better than flat screen sides; describe space relative to the camera, never as screen-left / screen-right.
- "enters from screen right" -> "enters from the camera's rear-right blind spot"
- "walks to screen left" -> "walks toward the depth of frame along the Z-axis"
- "appears from behind" (POV) -> "a hand reaches in from the lower-right corner of frame"
- "stands far away" -> "stands about three meters from the camera"
- "walks over" -> "approaches the camera along the Z-axis"

PHYSICAL PERFORMANCE — never use bare emotion labels; write the physical trace.
- Not "she is surprised" but "pupils dilate, lips part into an O, the inhale catches in her throat".
- Convey mood through muscle micro-movement, breathing rhythm, and light — not adjectives.

LIGHT AS EMOTION & CONTINUITY
- Specify hard / soft light, color temperature, and key-to-fill ratio that match the mood: warm soft low-ratio for safety / tenderness; cold hard high-ratio for isolation / tension; light receding to a faint rim for collapse; daylight pouring in along the Z-axis for release.
- Keep light direction, wind direction, and smoke flow physically consistent within a single scene.

PACING
- Think in precise second ranges and name the transition between shots (hard cut / dissolve / whip / match cut).
- One primary subject per beat; with multiple subjects set a clear focal priority and action order.`
