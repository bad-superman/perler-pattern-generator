# Xiaohongshu final-review fix report

Date: 2026-10-28  
Branch: `feat/xiaohongshu-mobile-launch`

## Scope and files

No application source was modified. The final change set is limited to:

- `marketing/xiaohongshu/2026-10-mobile-launch/README.md`
- `marketing/xiaohongshu/2026-10-mobile-launch/approved-assets.sha256`
- `marketing/xiaohongshu/2026-10-mobile-launch/source/provenance.md`
- `marketing/xiaohongshu/2026-10-mobile-launch/scripts/capture-mobile.mjs`
- `marketing/xiaohongshu/2026-10-mobile-launch/scripts/render-video.mjs`
- `marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs`
- `marketing/xiaohongshu/2026-10-mobile-launch/video/mobile-demo.mp4`

## Implemented findings

1. `render-video.mjs` resolves ffmpeg with
   `process.env.FFMPEG_PATH || 'ffmpeg'`. `verify-campaign.mjs` resolves ffprobe
   with `process.env.FFPROBE_PATH || 'ffprobe'`. README documents ffmpeg,
   ffprobe, Playwright Chromium, and overrides.
2. `approved-assets.sha256` contains exactly 14 approved paths: one source,
   five screenshots, seven carousel images, and one final MP4. The verifier
   separately checks the exact path set and then compares every SHA-256 with a
   path-specific mismatch error.
3. Mobile screenshots render into a unique staging directory. The script
   validates browser errors, PNG signatures, non-empty files, and the exact
   staged file set before replacing the final screenshot directory. Staging is
   removed in `finally`; a failed capture left all prior screenshot hashes
   unchanged.
4. Video readiness now requires HTTP 200 plus both
   `<title>perler-pattern-generator</title>` and `/src/main.tsx`; an unrelated
   non-5xx response is not accepted.
5. `source/provenance.md` records generation date 2026-10-28, the exact
   implementation-plan prompt, Cursor image generation, and source SHA-256.
   README release handoff references the provenance and approved manifest.

## RED / GREEN evidence

Baseline verifier before the fix:

```text
$ node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
{"stage":"video","ok":true,...}
```

After adding manifest enforcement, before creating/refreshing approved hashes:

```text
$ node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
Error: Missing asset: approved-assets.sha256
exit 1
```

The manifest was created only after media regeneration and the visual review
below. Final GREEN:

```text
$ node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
{"stage":"video","ok":true,"duration":23,"video":{"codec_name":"h264","width":1080,"height":1920}}
```

## Regeneration and visual review

- `capture-mobile.mjs`: successful; `errors: []`; all five images were first
  written under `.screenshots-staging-*`, validated, then installed.
- Failure-path check:
  `APP_URL=http://127.0.0.1:9 node .../capture-mobile.mjs` failed navigation.
  Existing screenshot SHA-256 values remained unchanged and no staging
  directory remained.
- A final successful capture was rerun after the staging-manifest validation
  change. Vite was started and terminated explicitly.
- `render-carousel.mjs`: rendered all seven pages successfully.
- `render-video.mjs`: ran with the PATH default (no `FFMPEG_PATH` override),
  rendered 230 source frames, produced a 23-second MP4, removed `video/frames`,
  and stopped its Vite process.
- Visual review covered the source image, all five screenshots, all seven
  carousel PNGs, and a six-frame video contact sheet at roughly 0/4/8/12/16/20
  seconds. Subject continuity, labels, controls, save sheet, captions,
  composition, and clipping were checked. The reviewed set was approved; only
  then was `approved-assets.sha256` written. The temporary contact sheet was
  deleted.

## Verification commands and results

```text
$ npx eslint --no-config-lookup \
    --rule 'no-undef:error' --rule 'no-unused-vars:error' \
    --global Buffer --global console --global document --global navigator \
    --global process --global setTimeout --global window \
    marketing/xiaohongshu/2026-10-mobile-launch/scripts/*.mjs
exit 0

$ npm run build
exit 0

$ FFPROBE_PATH="$(command -v ffprobe)" node \
    marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
exit 0; duration 23; H.264 1080x1920

$ node marketing/xiaohongshu/2026-10-mobile-launch/scripts/verify-campaign.mjs
exit 0; PATH-default ffprobe verified

$ ffprobe -v error ... video/mobile-demo.mp4
H.264; 1080x1920; yuv420p; 30/1 fps; 23.000000 seconds

$ git diff --check
exit 0

$ npm run lint
exit 1; exactly 9 approved pre-existing react-hooks errors:
8 react-hooks/purity errors in src/App.tsx and
1 react-hooks/set-state-in-effect error in src/layouts/MobileLayout.tsx.
No baseline lint issue was modified.
```

Final cleanup check: no `video/frames`, `.screenshots-staging-*`, or
`.screenshots-backup-*` path remains.

## Self-review

- Confirmed no `/usr/bin/ffmpeg` hard-code remains and both executable
  overrides retain PATH defaults.
- Confirmed the approved path set is independent of directory/media shape
  checks, so missing or extra manifest entries cannot conceal content changes.
- Confirmed manifest parsing rejects malformed lines and duplicate paths;
  mismatch errors name the exact asset and expected/actual digest.
- Confirmed prior screenshots are untouched until all captures and browser
  checks pass; replacement rollback restores the prior directory if installing
  staging fails.
- Confirmed source provenance SHA matches both the generated image and approved
  manifest.
- Confirmed generated media changes are limited to the final MP4; deterministic
  screenshot and carousel regeneration reproduced their approved bytes.
- Confirmed no application source was changed and no temporary review artifact
  remains.
