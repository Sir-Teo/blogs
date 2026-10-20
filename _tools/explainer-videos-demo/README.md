# explainer-videos demo data

Generator for `assets/data/explainer-videos-demo.json`,
`assets/data/explainer-barcodes.webp`, and `assets/data/explainer-frames.webp`,
which drive the figures in
`_posts/2026-10-18-rendering-twenty-two-hours-of-math-from-code.markdown`.

- `build_data.py`:
  - **24 completed films** listed in `explainer-videos/README.md` (13 standalone
    films in `published/` + 10 parts of *Analysis, Built* in `renders/` + Part 1
    of *AI, Built*): extracts each film's duration (English and Chinese where
    rendered), chapter list, subtitle cue count, 300-column vertical color
    barcode (`explainer-barcodes.webp`), 90-bin active-pixel density curve using
    `tools/dead_air.py`'s threshold (`|rgb - #0E1117| > 24`), and 8 representative
    `384×216` keyframes (`explainer-frames.webp`) with their exact subtitle cues.
  - **Bilingual scene score** (`videos/analysis/analysis4/s05_contraction.py`,
    `Contraction`): reads the English (`144.8 s`) and Chinese (`151.3 s`)
    `.narration.json` word timestamps, `<bookmark/>` positions, and all 82
    partial-movie segments from `partial_movie_file_list.txt`, alongside the
    precomputed numerical arrays from `load("contraction")`.
  - **Semantic palette & pronunciation lexicon**: scans all 705 `.py` files under
    `videos/` for `C.<TOKEN>` references against `explainer/style.py` (222 active
    tokens, 11,085 references) and all `self.voiceover(...)` strings against
    `explainer/tts.py`'s 513 `LEXICON` rules (2,808 matches).
  - **Dead-air QA traces**: measures 2 Hz active-pixel coverage across four
    visual-pass commits (`57f5917`, `fe42ad6`, `afa2e89`, `13ef1de`) before and
    after moving `vo.wait_until()` holds past the initial drawing `self.play()`.

Run `./run.sh` with an `explainer-videos` checkout beside this repo (or
`EXPLAINER_VIDEOS=/path`).

Video watch links come from `renders/youtube/publication-state.json` in that
checkout. The generator accepts published records with `youtube_url`, `url`,
or `video_id`; films without a published YouTube entry have no watch link.
The 13 linked uploads are English masters (`language: en` in
`renders/youtube/metadata.json`); the article labels their watch links
"YouTube (EN)".
