---
name: make-pptx
description: >-
  Create or modify PowerPoint presentations (.pptx) that are fully native and
  editable in PowerPoint / WPS / Keynote. Use when the user asks for a PPT,
  slides, deck, presentation, 汇报, 幻灯片, 课件, or 演示文稿. Produces real
  text boxes, shapes, charts and tables (never screenshots) with a consistent
  professional design, then machine-validates the result before delivery.
---

# Making PowerPoint decks

You have two tools for this job: `create_pptx` (generates the file by running
your pptxgenjs script) and `inspect_pptx` (machine-checks the result). Follow
the workflow below exactly — it is what separates a polished deck from a messy
one.

## Workflow

1. **Plan silently**: decide the slide count, one core message per slide, and
   a palette (one primary color, one neutral, one accent; roughly 60% / 30% /
   10% usage). 5-12 slides is right for most requests unless the user asks
   otherwise.
2. **Write ONE script** that builds the entire deck, call `create_pptx` with
   it. Do not call the tool once per slide.
3. **Call `inspect_pptx`** on the output. Fix every reported issue (overflow,
   overlap, validation errors) by editing your script and re-running
   `create_pptx` to the same path. Re-inspect after fixing. A deck with
   reported issues must not be delivered.
4. **Reply with a file link** so the user can open it: `[File: name.pptx](relative/path.pptx)`
   plus a 2-3 sentence summary of the deck structure.

## Script contract

The tool runs your `script` as an ES module with a ready-to-use presentation
instance exposed as the global **`pptx`**. Build the deck on it — do not
redeclare `pptx`, and do not call `writeFile` (the tool writes the file to
`outputPath` after your script returns):

```js
pptx.layout = 'LAYOUT_16x9' // always first; 16:9 canvas = 10 x 5.625 inches
const title = pptx.addSlide()
title.addText('Quarterly Review', { x: 0.6, y: 2.2, w: 8.8, h: 1.2, fontSize: 32, bold: true })
// ... more slides ...
// done — the harness saves the file automatically
```

Never emit base64 file content in the script output.

## Design baseline (non-negotiable)

- **Canvas**: 10 x 5.625 inches (16:9). Every element gets explicit
  `x, y, w, h`. There is NO auto-layout — compute positions yourself.
- **Typography**: titles >= 20pt bold, body >= 14pt, captions >= 11pt. One
  font family per deck; for Chinese content use `fontFace: 'Microsoft YaHei'`
  (微软雅黑), for English 'Segoe UI' or 'Arial'. Line spacing 1.2-1.5 on body
  text (`lineSpacingMultiple`).
- **Margins**: keep >= 0.5in padding on every side. Nothing touches the edge.
- **Consistency**: reuse the same title position, accent bar, and footer
  positions on every content slide. Define a helper function in your script
  (e.g. `function contentSlide(kicker, title) {...}`) instead of repeating
  coordinates.
- **Density**: max ~6 bullets per slide, max ~15 words per bullet. If content
  overflows, split into two slides — do not shrink text below 14pt.
- **Visual variety**: alternate layouts (title slide / bullets + side panel /
  two columns / chart + takeaway / section divider / closing). Not every slide
  should look the same, but all should share the grid and palette.

## API quick reference (pptxgenjs)

```js
const s = pptx.addSlide()
s.addText('text', { x, y, w, h, fontSize, bold, color, align, fontFace, lineSpacingMultiple })
s.addShape('rect', { x, y, w, h, fill: { color: '1A73E8' } })       // no '#'!
s.addImage({ path: 'C:/abs/path.png', x, y, w, h })                  // local abs path or data:URL
s.addTable(rows, { x, y, w, colW: [2, 2, 2], fontSize: 12, autoPage: true })
s.addChart(pptx.ChartType.bar, [{ name: 'Q1', labels: ['East', 'West'], values: [12, 7] }], { x, y, w, h })
s.addNotes('speaker notes')  // put the spoken narrative here, not on the slide
```

- Colors are hex **without** `#` (e.g. `'1A73E8'`). An 8-digit hex or a
  leading `#` can corrupt the file.
- Charts stay native and editable — never render chart images.
- Long tables: set `autoPage: true` so rows continue onto new slides.
- Bullets: pass an array of `{ text, options: { bullet: true, fontSize } }`.

## Common failure modes (from inspect_pptx and user reports)

- Text overflowing its box because the string is longer than the width you
  budgeted — estimate ~1.9 chars per inch per 10pt of font size, then leave
  20% slack; or enable `fit: 'shrink'` on body text as a safety net.
- Elements overlapping because two blocks claim the same y-range — track a
  running `y` cursor per slide in your script instead of hardcoding every y.
- Charts with the wrong `dataLabelPosition` for the chart type (stacked bars
  only accept `ctr`, `inEnd`, `inBase`) — when unsure, omit the option.
- Combo charts need `valAxes` and `catAxes` arrays or PowerPoint discards the
  chart — avoid combos unless required.
- Colors entered with `#` — the top cause of "file needs repair" dialogs.
