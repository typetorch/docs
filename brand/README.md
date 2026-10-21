# TypeTorch logo

<img src="typetorch.svg" width="96" alt="TypeTorch logo">

The TypeTorch mark is an orange tile with a white **TT** and a flame. The tile carries its own background, so the same
file works on light and dark backgrounds, and it stays readable down to 16 px (favicons, the Studio toolbar).

## Files

| File | Use |
|---|---|
| `typetorch.svg` | The source. Use it wherever SVG works (web pages, READMEs, favicons). |
| `typetorch-16.png` … `typetorch-1024.png` | PNG exports at 16, 32, 48, 64, 128, 180, 192, 256, 512 and 1024 px, transparent corners. |
| `typetorch-180.png` | `apple-touch-icon`. |
| `typetorch-192.png`, `typetorch-512.png` | Web app manifest icons. |
| `favicon.ico` | 16, 32 and 48 px in one file, for `/favicon.ico`. |

Every TypeTorch product takes the mark from here. In a README outside this repo, link the raw file:

```md
<img src="https://raw.githubusercontent.com/typetorch/docs/main/brand/typetorch.svg" width="64" alt="TypeTorch">
```

## Colours

| Token | Hex | Where |
|---|---|---|
| Tile, top left | `#fb7a32` | gradient start |
| Tile, bottom right | `#d9480f` | gradient end |
| Flame core | `#e8590c` | also the accent on `dash.typetorch.dev` |
| Letters and flame | `#ffffff` | |

## Rules

- Don't recolour the tile, stretch it, or put the letters on a background without the tile.
- Leave clear space around the tile of at least a quarter of its width.
- The Studio plugin's toolbar icon is `typetorch-32.png` (and `typetorch-64.png` for high-DPI), uploaded to Roblox as
  an image asset.
