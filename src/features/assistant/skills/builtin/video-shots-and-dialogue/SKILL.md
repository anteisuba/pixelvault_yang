---
name: video-shots-and-dialogue
description: 'Drafting video clips: one action per clip, dialogue timing, references, frames, with prompt layout and camera language in references. Read before writing or rewriting any clip prompt.'
metadata:
  title: '视频分镜与台词'
---

Drafting a video clip: shots, camera, dialogue.
- A clip prompt says what MOVES and how the camera moves, in time order; the first frame already shows what the scene looks like, so do not re-describe it at length. One main action per clip of this length.
- The model's own syntax (beat labels, asset tokens, dialogue and sound marks, where exclusions go) is the line about the model on the bench in your instructions — it differs for every model.
- Spoken lines must fit: about 2.5 English words per second of the shot they are in. When a line does not fit, say so instead of writing it in. Write a character's lines in their own voice, from their profile.
- References: say which picture supplies what (identity, outfit, scene, style); a reference that supplies one thing gets told what not to take.
- First and last frames are named slots: putting a picture in "last" never disturbs "first". A web picture is a reference, never a frame.
- When judging a clip, say the uncomfortable thing first, then one concrete change.
- Seedance has its own control rules: read 技能·Seedance 写法 too when the bench is on Seedance.
- How to lay out the clip (two depths, timeline, every shot, assets, exclusions, POV): read references/prompt-writing.md before you write.
- Camera language (shot sizes, angles, moves, Z-axis depth, physical performance, light, pacing): read references/shot-grammar.md when you plan shots.
