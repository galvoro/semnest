# SEMNEST

A Galvoro PLAY/LEARN capsule for PL5225 Structural Equation Modeling (NUS):
**nested, equivalent, or neither?**

Theme: dinosaur nests in a lost valley, kept quiet: sandstone paper with
faint map contours, fern and basalt; model A is lagoon teal, model B amber
(the eggs in the opening image); eggs as level medals, a map neatline and
ferns on the certificate. The opening image (a young hadrosaur studying a path
diagram next to a nest within a nest) is by ChatGPT; it also shows, softly out
of focus, behind the level screen and the certificate. The music is by Suno.

## PLAY

Four levels (Easy, Medium, Hard, Psychometrika), five rounds per game. Each round
shows two path diagrams, model **A** and model **B**, for the same observed
variables (side by side on desktop). On phones both models share one screen
(A above B, side by side when the phone is turned) with a row of four answer
buttons below, each a Venn diagram over its expression (A ≡ B, A ⊂ B, B ⊂ A,
neither); the feedback follows in a sheet, and tapping a model enlarges it
(pinch, double-tap or drag to zoom; switch between A and B in the popup). The
player answers:

| answer | meaning |
|---|---|
| A ≡ B | equivalent: same fit on every dataset |
| A ⊂ B | A is nested in B (strictly) |
| B ⊂ A | B is nested in A (strictly) |
| neither | neither model is nested in the other |

Scoring: 20 points per round; confusing *nested* and *equivalent* in the right
direction earns 8 (`CONFIG.POINTS`, `CONFIG.PARTIAL` in `game.js`). A certificate
needs 60 of 100 (stars at 70/80/90), with a bronze / silver / gold / platinum egg
for the level. After every answer the feedback shows the relation, a short
explanation, the number of parameters and degrees of freedom of both models,
and highlights what differs between the diagrams.

The bank has 131 items: Easy 31, Medium 36, Hard 34, Psychometrika 30, with
all four relations at every level. A game draws 5 items, with at most two of
each relation and at least three kinds when the pool allows it (`game.js`).

### Model types

After choosing a level, players can switch model types on and off:

| type | what it is about |
|---|---|
| CFA | factor models: loadings, factor and residual covariances, cross-loadings |
| Path analysis | models for observed variables only (DAGs, covariances) |
| SEM | structural effects: regressions between factors, covariates |
| Higher-order | second- (and third-) order factors |
| Bifactor | bifactor / hierarchical models, including bifactor-(S−1) |
| GGM | Gaussian graphical models (networks of observed variables) |
| Latent / residual | latent network models and residual network models |

Types build on each other: SEM on CFA and path analysis, higher-order on CFA,
bifactor on higher-order, GGM on path analysis, and latent/residual networks
on CFA and GGM (`SN.bank.BUILDS_ON`). The level screen keeps the switched-on
types closed under this: switching a type off also switches off every type
built on it, and switching one on also switches on what it builds on. An item
is in the game when every type its two models use, with what those build on,
is switched on (`SN.bank.needs`). Types that no item of a level uses are greyed
out there. A type cannot be switched off when fewer than five pairs would be
left; it then shows a lock. Each level remembers its own selection.

Network models (GGM, latent and residual networks) are in every level but
switched off by default below Psychometrika (`SN.bank.DEFAULT_OFF`). At Easy
they are simple: GGMs against path models and other GGMs, and "one factor =
one cluster" (E28 to E31). The certificate lists the model types only when they
differ from the default.

| level | types used | network pairs | default | always on | blocked combinations |
|---|---|---|---|---|---|
| Easy | CFA, path analysis, SEM, GGM | 10 of 31 | networks off | – | none (one of CFA and path analysis stays on) |
| Medium | all but bifactor | 9 of 36 | networks off | – | none (idem) |
| Hard | all seven | 5 of 34 | networks off | – | none (idem) |
| Psychometrika | all seven | 15 of 30 | all on | CFA | CFA alone, CFA + path analysis (one of SEM, higher-order and GGM stays on) |

`node .dev/check_bank.js` walks through every configuration a player can reach
and checks that each has at least five pairs (and that every closed set of
types with at least five pairs can be reached).

## LEARN

Two canvases (A and B) that both start as a one-factor model on six items. Draw
factors, arrows (loadings, effects between items, from items to factors and
between factors; feedback loops are allowed), covariances and network edges
(between items: GGM; between residuals: RNM; between factors: LNM); add or
remove items (on both sides). The layout follows PLAY: A and B side by side,
the relation and the COMPUTE and LIBRARY buttons in the middle.

**COMPUTE** decides the relation and shows the parameters and degrees of
freedom of both models. Every structural change clears the result until
COMPUTE is pressed again (Enter on a keyboard). For your own models the
relation is decided numerically, as in the PL5225 assignment: fit each model
to the covariance matrix implied by the other at random parameter values (the
NET idea of Bentler & Satorra, 2010), from several starting values.

**LIBRARY** lists every PLAY pair (filters: level and model type; the relation
is not shown in the list). A chosen pair is loaded with PLAY's layout and its
proven relation and explanation; once it is changed, the numerical check
takes over (undoing the change brings the proof back).
`.dev/check_library.js` loads all 131 pairs and checks that the editors
produce exactly the bank's models.

**Values** gives the models numbers (std.lv metric). The nested model (or either
model, when they are equivalent) can be edited with a slider; the other model
is fitted to the covariance matrix it implies and shows the values that
reproduce it exactly. As in Factor Lab (semPlot / qgraph, theme "colorblind"),
paths are then blue (positive) or red (negative), with colour strength and
width following the standardized value (lavaan's std.all); the labels show the
raw values, and the slider's bar runs from zero in the path's colour. Paths
with the same equality label move together. With *neither*, values cannot be
transferred; network models have no values (yet).

On phones LEARN looks like PLAY: A above B, the relation and the two buttons
below. Tapping a model opens it in a popup with the drawing tools; tapping the
relation shows it in full.

## Conventions (important for the "surprising" items)

A model is the set of covariance matrices it can produce. Parameters are
unrestricted real numbers, as in lavaan's default estimation: variances may be
negative (Heywood solutions). A is nested in B if B reproduces every covariance
matrix of A (up to closure, i.e. χ² = 0 when B is fitted to Σ_A). Under this
convention the textbook statements hold literally, e.g. a one-factor model with
three indicators is saturated, and a second-order factor on three first-order
factors is equivalent to three correlated factors.

## Correctness of the items

* **Proofs:** `.dev/proofs/semnest_proofs.pdf`, one page per item with the two
  diagrams and a proof. It is generated by `node .dev/proofs/build.js` from
  `bank.js` (diagrams and syntax) and `.dev/proofs/items.js` (the
  arguments), with the lemmas in `.dev/proofs/preamble.tex`. Every non-nesting
  argument is checked in exact rational arithmetic (`.dev/proofs/exact.js`):
  * separating polynomials must vanish on the containing model at random
    rational points and be non-zero at the listed witness point;
  * dimension arguments use exact Jacobian ranks.
* **Engine check:** `node .dev/verify_bank.js [--mixed]` fits each model to the
  other's implied covariance matrices (positive or mixed-sign parameter draws;
  a miss is rerun with many more starting values, which the feedback loop of
  P22 needs with mixed signs).
* **R check:** `Rscript .dev/verify_bank.R`, an independent check with lavaan
  and psychonetrics. Known exception: P22 (feedback loop with instruments).
  When the drawn loop gain b12·b21 exceeds 1, lavaan does not reach the exact
  fit from its default or random starting values, but it does (χ² = 0) from
  the analytic solution given in the proof.

## Files

| file | role |
|---|---|
| `index.html`, `styles.css` | screens, HUD, light / dark / auto themes |
| `sem.js` | RAM engine with network (precision) blocks; ML and least-squares fitting; Jacobian rank; nesting check |
| `bank.js` | the 131 items and the model types |
| `diagram.js` | layout of the path diagrams; SVG and TikZ output |
| `game.js` | app shell and PLAY |
| `learn.js`, `editor.js` | LEARN: COMPUTE, library, phone edit popup; the editor (adapted from Factor Lab) |
| `tutorial.js`, `diploma.js`, `audio.js` | briefing cards, certificate image, sound |
| `assets/` | favicon, map contours (`.dev/make_topo.js`), opening image (`title-wide.webp`, `title-mobile.webp`), music (`bgm.mp3`) |
| `cover.webp` | square cover for the Galvoro catalogue |

`.dev/` holds the verification scripts (`verify_bank.js`, `verify_bank.R`,
`check_bank.js` for the model-type filter), the proofs, `media_prompts.txt`
(the prompts for the images and the music; `make_title.sh` converts the
generated images in `.dev/media/`, which is not committed) and headless-Chrome
tests (`smoke_play.js`, `smoke_learn.js`, `check_library.js`,
`check_bgm_loop.js`, `gallery.html` for all 236 diagrams).
Dot-folders are never uploaded with the capsule.

## Media

* **Images (ChatGPT):** `sh .dev/make_title.sh` turns `.dev/media/landscape.png`,
  `portrait.png` and `squareimg.png` into `assets/title-wide.webp`,
  `assets/title-mobile.webp`, `cover.webp` (1080 x 1080) and
  `../squareimg/semnest.png` (for the cover upload).
* **Music (Suno):** `assets/bgm.mp3` (2:30, 100 BPM). It starts with the first
  click or key press and pauses while the tab is hidden. The track plays once
  from the start; then the 32 bars from 20.2 s loop (to 97.1 s plus a one-bar
  crossfade; `BGM_LOOP` in `audio.js`), found by beat analysis: rhythm and
  harmony match at the seam, and the lead-in and the cut-off at 2:30 are left
  out. `node .dev/check_bgm_loop.js` checks the seam and writes
  `.dev/out/bgm_seam.wav` to listen to.

## Running locally

```
python3 -m http.server 8765    # in this folder, then open http://localhost:8765/
```

Sacha Epskamp, National University of Singapore. CC-BY-4.0.
