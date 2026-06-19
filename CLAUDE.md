# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A fully client-side React app that turns an uploaded image into a printable perler-bead (拼豆) pattern. Image quantization runs in the browser via the Canvas API. An optional **AI generation** mode calls Agnes Image 2.1 Flash through a small Node proxy (`server/agnes-proxy.mjs`) to stylize the reference image before the same quantization pipeline runs.

## Commands

- `npm run dev` — start the Vite dev server (default `http://127.0.0.1:5173`; the verify scripts assume this URL)
- `npm run dev:proxy` — start the local Node Agnes proxy on port 8787 (local dev AI generation)
- `npm run pages:dev` — build and run Cloudflare Pages + Functions locally via wrangler
- `npm run build` — type-check with `tsc -b` then build with Vite
- `npm run lint` — run ESLint over the repo
- `npm run preview` — serve the production build

There is no unit test runner. Verification is done end-to-end with Playwright via the `verify-*.mjs` / `generate-new-image.mjs` scripts (see below).

## Verification scripts

The `*.mjs` files at the repo root are standalone Playwright scripts (run with `node verify-layout.mjs`). They require the dev server to be running first. Each one:
- launches headless Chromium, navigates to the dev server, uploads a fixture image via the file input, and waits for `.legend-item` to confirm a pattern rendered;
- asserts on DOM structure (cell counts, legend items, layout geometry) and fails via `process.exit(1)` if expectations or console errors are violated;
- writes a screenshot (the committed `*.png` files) for visual review.

They assert against specific class names in `App.tsx` (`.pattern-grid`, `.legend-item`, `.paper-overview`, `.result-summary`, `.section-title`, etc.), so renaming those classes will break verification. The fixture image path is hardcoded (`/home/roy/.hermes/image_cache/...`) and overridable via `IMAGE_PATH` in some scripts.

## Architecture

The app is `src/App.tsx` plus CSS and small modules under `src/agnes/` and `src/palettes/`.

**Pattern generation pipeline** (`generatePattern` in `App.tsx`):
1. `loadImage` decodes the `File` into an `HTMLImageElement`.
2. `fitGridToImage` computes grid dimensions (`cols`/`rows`) from the "最长边" (long-side) `gridSize` and `shape` — either preserving the original aspect ratio (`'ratio'`) or forcing a square.
3. The image is drawn onto an off-screen canvas at grid resolution; each pixel becomes one bead cell.
4. `nearestPaletteColor` maps each pixel to the closest color in `HAMA_PALETTE` ([`src/palettes/hama.ts`](src/palettes/hama.ts), ~60 Hama Midi codes with community HEX values) by squared RGB distance.
5. Colors are ranked by frequency and truncated to `maxColors`; pixels are then re-quantized against only the selected palette so counts and the rendered grid stay consistent.
6. Each selected color gets a symbol from the `SYMBOLS` string; results populate `pattern` (`BeadCell[][]`) and `palette` (`PaletteColor[]` with Hama `code`, Chinese `name`, and per-color counts).

**Key constants**: `HAMA_PALETTE` (Hama bead color set; HEX is approximate for screen matching) and `SYMBOLS` (single-glyph labels assigned to colors in frequency order). Adding/reordering palette colors changes which beads images map to.

**Rendering**: the pattern renders as a CSS grid of `<span>` cells. `renderMode` toggles between `'symbols'` (letter/glyph per cell, larger `cellSize`) and `'solid'` (color-only). Cell text color flips to white for dark backgrounds based on a hex-value threshold.

**Responsive scaling**: a `ResizeObserver` + window `resize` listener recomputes `paperScale` so the full pattern fits the preview viewport without horizontal overflow (the verify scripts assert this fit/centering). Scale is applied via the `--paper-scale` CSS variable.

**Export**: `exportPng` uses `html-to-image`'s `toPng` on the pattern ref (at `pixelRatio: 4`) and saves via `file-saver`. Printing uses the native `window.print()`.

**State coupling**: control changes (grid size, max colors, shape) call `regenerate`, which re-reads the last processed file from `lastSourceFileRef` (or the hidden upload input) and re-runs the full pipeline.

**AI generation** (`src/agnes/`):
- `styles.ts` — six perler-oriented prompt presets (classic pixel, chibi, flat, 8-bit, craft, simplified real)
- `client.ts` — `generateAgnesImage()` posts multipart form data to `/api/agnes/generate`
- `server/agnes-proxy.mjs` — local dev proxy to Agnes API with `AGNES_API_KEY`
- `functions/api/agnes/generate.js` — Cloudflare Pages Function for production `/api/agnes/generate`
- UI mode toggle: **本地转换** (immediate `generatePattern`) vs **AI 生成** (Agnes img2img → `generatePattern`)
