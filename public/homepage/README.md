# Homepage feature-section media

Drop section art here, named by section id from `src/constants/homepage.ts`.

## File spec

- **Images**: `<id>.webp`, 16:10 aspect, ≥1600px wide, ≤300 KB
- **Videos**: `<id>.mp4`, h264, ≤8s loop, no audio, ≤2 MB.
  Optional poster: `<id>-poster.webp` (first-frame still).

Once a file is in place, set the `media` field for that section in
`src/constants/homepage.ts`:

```ts
// image
media: { type: 'image', src: '/homepage/imageEditing.webp', alt: '...' }

// video
media: {
  type: 'video',
  src: '/homepage/workflow.mp4',
  poster: '/homepage/workflow-poster.webp',
  alt: '...',
}
```

If `media` is left as `undefined` the section keeps the gradient fallback.

## Sections + suggested AI prompt

Run each prompt through GPT-Image-2 or Gemini 3 Pro Image in Studio
(`workflow` uses Veo 3.1 / Seedance 2.0 instead).

| Section id     | Type  | Prompt                                                                                                                                                                           |
| -------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `imageEditing` | image | A portrait of a young woman on the left + 3 stylised re-renders (Studio Ghibli / oil / watercolor) tiled on the right, soft editorial layout, plenty of negative space, 16:10.   |
| `video`        | image | A film-strip storyboard with 4 cinematic frames of a dragon swooping over mountains, golden-hour lighting, frame numbers along the top, 16:10.                                   |
| `lora`         | image | A contact sheet of training photos on the left + the resulting consistent character on the right, "before / after" label, soft warm light, 16:10.                                |
| `upscale`      | image | A single image split vertically — left half blurry low-res, right half tack-sharp 4× upscale, magnifier loupe over the seam, 16:10.                                              |
| `tts`          | image | A sound-wave ribbon flowing across the frame with a floating speech bubble of multilingual text, dark ink palette, 16:10.                                                        |
| `workflow`     | VIDEO | Node-based visual workflow editor; mouse drags a connection between an "image gen" node and an "upscale" node, then a "deploy" button pulses and turns green. 6–8s loop, silent. |
| `arena`        | image | Four AI portraits in a 2×2 grid, one tagged with a glowing "winner" ribbon and a small ELO scoreboard in the corner, 16:10.                                                      |
| `archive`      | image | A vast wall of generation thumbnails fading into the distance, a timeline ribbon along the bottom, earthy palette, 16:10.                                                        |
| `social`       | image | Three artwork cards stacked at gentle angles with avatars, like counts, and a "follow" badge, soft sky-blue background, 16:10.                                                   |
