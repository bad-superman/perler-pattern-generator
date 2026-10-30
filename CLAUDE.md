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
4. `nearestPaletteColor` maps each pixel to the closest color in the active bead palette (`paletteBrand`: default **MARD 221** via [`src/palettes/mard221.ts`](src/palettes/mard221.ts), or **Hama** via [`src/palettes/hama.ts`](src/palettes/hama.ts)) by squared RGB distance. Palette registry lives in [`src/palettes/index.ts`](src/palettes/index.ts).
5. Colors are ranked by frequency and truncated to `maxColors`; pixels are then re-quantized against only the selected palette so counts and the rendered grid stay consistent.
6. Each selected color uses its bead color code as the cell label; results populate `pattern` (`BeadCell[][]`) and `palette` (`PaletteColor[]` with bead `code`, optional Chinese `name`, and per-color counts).

**Key constants**: `getPaletteColors()` / `paletteBrand` state (MARD default, Hama optional; sidebar segmented control triggers `regenerate` on switch). Cell labels use the bead color `code`. Adding/reordering palette colors changes which beads images map to.

**Rendering**: the pattern renders as a CSS grid of `<span>` cells. `renderMode` toggles between `'symbols'` (色号/code labels per cell, larger `cellSize`) and `'solid'` (color-only). Cell text color flips to white for dark backgrounds based on a hex-value threshold.

**Responsive scaling**: a `ResizeObserver` + window `resize` listener recomputes `paperScale` so the full pattern fits the preview viewport without horizontal overflow (the verify scripts assert this fit/centering). Scale is applied via the `--paper-scale` CSS variable.

**Mirror**: `mirrored` state in `App.tsx` derives `displayPattern = mirrorPatternHorizontal(pattern)` (`src/pattern/ops.ts`). Preview grids, `PatternZoomView`, and the export canvas read `displayPattern`; `PatternEditor` and bead counts always use the untouched `pattern`. The toggle is display-only, not persisted, and never enters undo history. `verify-mirror.mjs` asserts the flip end-to-end.

**Export**: `exportPng` draws the pattern and legend directly on Canvas from in-memory `displayPattern`/`palette` state (subtitle gains "镜像" when mirrored), then saves via `file-saver` (`toBlob`). Printing uses the native `window.print()`.

**State coupling**: control changes (grid size, max colors, shape, palette brand) call `regenerate`, which re-reads the last processed file from `lastSourceFileRef` (or the hidden upload input) and re-runs the full pipeline.

**AI generation** (`src/agnes/`):
- `styles.ts` — six perler-oriented prompt presets; prompts center the subject, simplify background, and target compact bead patterns
- `cropSubject.ts` — trims AI output to non-background bounding box before quantization
- `client.ts` — `generateAgnesImages()` posts multipart form data to `/api/agnes/generate` and returns `{ files, usedFallback, providers, models, attempts }`; failures throw `AgnesGenerateError` carrying `attempts` too. The app shows a notice and tracks `ai_generate_fallback_used` when the fallback model produced the result, and emits one `ai_provider_attempt` PostHog event per server-side provider call (`provider`, `model`, `ok`, `http_status`, `reason`, `duration_ms`) so success rate and failure reasons can be broken down by provider
- Server logging: both entry points log `[ai] …` lines per request and per attempt via `formatAttemptLog`, with API keys masked to the last 4 chars (`maskKey`). On Cloudflare these are visible only via the real-time Functions log stream / `wrangler pages deployment tail`
- `server/ai/` — runtime-agnostic generation layer shared by both server entry points: `config.mjs` resolves `AI_DEFAULT_*` / `AI_FALLBACK_*` env (falling back to legacy `AGNES_*`), `providers/openaiImages.mjs` is the OpenAI-images-compatible adapter, `index.mjs` runs default → fallback per image with independent timeouts (`generateImages`). To add a vendor with a different protocol, add a `providers/<kind>.mjs` adapter and register its `kind` in `PROVIDER_KINDS` + `adapterFor`
- `server/agnes-proxy.mjs` — local dev HTTP proxy; parses multipart and delegates to `server/ai`
- `functions/api/agnes/generate.js` — Cloudflare Pages Function for production `/api/agnes/generate`; imports `server/ai` via relative path (wrangler bundles it). `GET` returns a secret-free summary of the default/fallback models
- Fallback is enabled by setting `AI_FALLBACK_MODEL`; any failure of the default provider (HTTP error, timeout, empty payload) triggers one retry on the fallback. Responses carry `provider: 'default' | 'fallback'` and `model`
- UI mode toggle: **本地转换** (immediate `generatePattern`) vs **AI 生成** (Agnes img2img → crop → `generatePattern` with `sharpQuantize` and recommended 48-grid default)
