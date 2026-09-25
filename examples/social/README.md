# Social / launch visuals

Assets for X, LinkedIn, and the GitHub social preview. Source of truth is the `.d2` files
and `og-card.html`; the PNG/MP4 are rendered outputs (only the final ones are committed).

**Skip GIF.** Use the sharp PNG or MP4.

## Use these

| File | Platform |
|---|---|
| [`before-after-side.png`](before-after-side.png) | README, LinkedIn static, X still (2400×1350) |
| [`before-after.mp4`](before-after.mp4) | X video (same side-by-side, 5s hold, H.264) |
| [`og-card.png`](og-card.png) | GitHub social preview (1280×640) |

## Tools

| Tool | Role |
|---|---|
| [d2](https://d2lang.com) | Invented + honest diagrams → PNG (`--scale 2`) |
| Pillow (`compose-social.py`) | Labeled before\|after 16:9 (no qlmanage blur) |
| Headless Chrome (`og-card.html`) | OG card around the real `checkout-service.layout.svg` |
| ffmpeg | Still → MP4 for X |

## Regenerate

```bash
cd "$(git rev-parse --show-toplevel)"
export PATH="/opt/homebrew/bin:$PATH"

# 1. Before / after panels (intermediate PNGs, git-ignored)
d2 --pad 40 --scale 2.0 examples/social/before-invented.d2 examples/social/before-invented.png
d2 --pad 40 --scale 2.0 examples/social/after-honest.d2 examples/social/after-honest.png

# 2. Side-by-side PNG (Pillow)
python3 -m venv /tmp/had-social-venv
/tmp/had-social-venv/bin/pip install -q Pillow
/tmp/had-social-venv/bin/python examples/social/compose-social.py

# 3. MP4 for X
ffmpeg -y -loop 1 -t 5 -i examples/social/before-after-side.png \
  -vf "fps=30,format=yuv420p" -c:v libx264 -crf 16 -tune stillimage \
  -pix_fmt yuv420p -movflags +faststart examples/social/before-after.mp4

# 4. GitHub social preview card
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --window-size=1280,640 --force-device-scale-factor=1 \
  --screenshot=examples/social/og-card.png examples/social/og-card.html
```

## GitHub social preview

Repo → **Settings → General → Social preview** → upload `og-card.png`.

## Post tip

- **X / LinkedIn:** upload `before-after-side.png` (or `og-card.png`)
- **X video:** `before-after.mp4` (same art, 5s hold)
- Do not post a GIF
