# Social / launch visuals

Assets for X, LinkedIn, and GitHub social preview. Source of truth is the `.d2` files;
PNG/GIF are rendered outputs.

## Tools used

| Tool | Role |
|---|---|
| [d2](https://d2lang.com) (`brew install d2`) | Diagram → PNG |
| [ffmpeg](https://ffmpeg.org) (`brew install ffmpeg`) | Side-by-side, GIF, canvas pad |
| `sips` (macOS) | Resize |
| Cursor GenerateImage | Optional branded OG banner |

## Files

| File | Use |
|---|---|
| `before-invented.d2` / `.png` | Hallucinated “complete” diagram |
| `after-honest.d2` / `.png` | Honest request-path (accent + dashed companions) |
| `slide-before.png` / `slide-after.png` | 1280×720 slides |
| `before-after-side.png` | Static before\|after for LinkedIn |
| `before-after.gif` | Alternating GIF for X |
| `og-preview.png` | 1280×640 GitHub social preview candidate |
| `og-banner.png` | Branded 16:9 banner (title + install line) |

## Regenerate

```bash
cd "$(git rev-parse --show-toplevel)"
export PATH="/opt/homebrew/bin:$PATH"

d2 --pad 24 --scale 0.55 examples/social/before-invented.d2 examples/social/before-invented.png
d2 --pad 24 --scale 0.55 examples/social/after-honest.d2 examples/social/after-honest.png

sips -Z 1000 examples/social/before-invented.png --out /tmp/ha-before.png >/dev/null
sips -Z 1000 examples/social/after-honest.png --out /tmp/ha-after.png >/dev/null

ffmpeg -y -update 1 -i /tmp/ha-before.png \
  -vf "scale=1180:620:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:white" \
  examples/social/slide-before.png
ffmpeg -y -update 1 -i /tmp/ha-after.png \
  -vf "scale=1180:620:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:white" \
  examples/social/slide-after.png
ffmpeg -y -update 1 -i examples/social/slide-before.png -i examples/social/slide-after.png \
  -filter_complex "[0:v]scale=640:720[l];[1:v]scale=640:720[r];[l][r]hstack=inputs=2" \
  examples/social/before-after-side.png
ffmpeg -y -loop 1 -t 2.2 -i examples/social/slide-before.png -loop 1 -t 2.2 -i examples/social/slide-after.png \
  -filter_complex "[0:v][1:v]concat=n=2:v=1:a=0,fps=8,split[s0][s1];[s0]palettegen=max_colors=96[p];[s1][p]paletteuse=dither=bayer" \
  -loop 0 examples/social/before-after.gif
ffmpeg -y -update 1 -i examples/social/before-after-side.png \
  -vf "scale=1280:640:force_original_aspect_ratio=decrease,pad=1280:640:(ow-iw)/2:(oh-ih)/2:white" \
  examples/social/og-preview.png
```

## GitHub social preview

Repo → **Settings → General → Social preview** → upload `og-banner.png` or `og-preview.png`.

## Post tips

- **X:** attach `before-after.gif` (or the side PNG if GIF is heavy).
- **LinkedIn:** attach `before-after-side.png` or `og-banner.png`.
- Caption: invented vs honest; install `npx skills add albegosu/honest-arch-diagrams`.
