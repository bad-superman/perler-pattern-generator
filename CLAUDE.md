# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A fully client-side React app that turns an uploaded image into a printable perler-bead (拼豆) pattern. All image processing happens in the browser via the Canvas API — there is no backend. The UI copy is in Chinese.

## Commands

- `npm run dev` — start the Vite dev server (default `http://127.0.0.1:5173`; the verify scripts assume this URL)
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

The entire app is `src/App.tsx` (~375 lines) plus CSS. There are no other modules.

**Pattern generation pipeline** (`generatePattern` in `App.tsx`):
1. `loadImage` decodes the `File` into an `HTMLImageElement`.
2. `fitGridToImage` computes grid dimensions (`cols`/`rows`) from the "最长边" (long-side) `gridSize` and `shape` — either preserving the original aspect ratio (`'ratio'`) or forcing a square.
3. The image is drawn onto an off-screen canvas at grid resolution; each pixel becomes one bead cell.
4. `nearestPaletteColor` maps each pixel to the closest color in `PERLER_PALETTE` (25 fixed perler colors) by squared RGB distance.
5. Colors are ranked by frequency and truncated to `maxColors`; pixels are then re-quantized against only the selected palette so counts and the rendered grid stay consistent.
6. Each selected color gets a symbol from the `SYMBOLS` string; results populate `pattern` (`BeadCell[][]`) and `palette` (`PaletteColor[]` with per-color counts).

**Key constants** (top of `App.tsx`): `PERLER_PALETTE` (the fixed bead color set) and `SYMBOLS` (single-glyph labels assigned to colors in frequency order). Adding/reordering palette colors changes which beads images map to.

**Rendering**: the pattern renders as a CSS grid of `<span>` cells. `renderMode` toggles between `'symbols'` (letter/glyph per cell, larger `cellSize`) and `'solid'` (color-only). Cell text color flips to white for dark backgrounds based on a hex-value threshold.

**Responsive scaling**: a `ResizeObserver` + window `resize` listener recomputes `paperScale` so the full pattern fits the preview viewport without horizontal overflow (the verify scripts assert this fit/centering). Scale is applied via the `--paper-scale` CSS variable.

**Export**: `exportPng` uses `html-to-image`'s `toPng` on the pattern ref (at `pixelRatio: 4`) and saves via `file-saver`. Printing uses the native `window.print()`.

**State coupling**: control changes (grid size, max colors, shape) call `regenerate`, which re-reads the original file from the hidden upload `<input>` ref and re-runs the full pipeline — the source file is never stored in state, only re-read from the DOM input.
