# Reel studio

Renders Instagram reels (1080×1920 MP4) straight from the app's own 3D engine and estimator, so the house and the prices on screen are the ones the product gives.

```bash
npm run dev                                          # terminal 1
node marketing/instagram/studio/render.mjs build     # terminal 2 → studio/out/build.mp4
```

`render.mjs <scene> [fps=30] [quality=high|low]`. Needs Playwright (Chromium) and ffmpeg.

| Scene | Length | What it shows |
|---|---|---|
| `build` | 16s | The house going up stage by stage, with the running total climbing |
| `plan3d` | 12s | Blank model → finished house in 3D → the price |
| `layers` | 15s | Reinforcement, studs, trusses, bricks: every piece counted |

Scenes live in `studio.js`. Each one is a function of time (`at(t)`), so adding a reel means adding one object. To feature a different house, change `SPEC`. The videos are silent: add trending audio in Instagram when you post.
