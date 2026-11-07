// SEMNEST — the item bank: 80 pairs of models (20 per level; at every level
// five are equivalent, five have the left model (A) nested in the right one
// (B), five the other way round and five are neither).
//
// Every relation is proven in .dev/proofs (one page per item) and checked
// numerically by .dev/verify_bank.js (this engine) and .dev/verify_bank.R
// (lavaan and psychonetrics).
//
// Item fields
//   id, level (1 Easy, 2 Medium, 3 Hard, 4 Psychometrika)
//   rel    'equiv' | 'AinB' (A is nested in B) | 'BinA' | 'neither'
//   obs    observed variables (shared by both models)
//   A, B   model syntax (see sem.js); all variances are free and not drawn
//   pos    optional positions of observed / latent variables, in grid units
//          (posA / posB for one side only); default: observed in a row,
//          factors above their indicators, higher-order factors above those
//   res    optional residual directions in degrees (0 = right, 90 = down)
//   why    the short explanation shown after answering
(function (global) {
  'use strict';
  const SN = global.SN = global.SN || {};

  const ys = (n) => Array.from({ length: n }, (_, i) => 'y' + (i + 1));
  const sum = (a, b) => ys(b).slice(a - 1).join(' + ');      // "y{a} + ... + y{b}"
  const cfa2 = 'F1 =~ y1 + y2 + y3; F2 =~ y4 + y5 + y6';
  const cfa3x2 = 'F1 =~ y1 + y2; F2 =~ y3 + y4; F3 =~ y5 + y6';
  const cfa3x3 = 'F1 =~ y1 + y2 + y3; F2 =~ y4 + y5 + y6; F3 =~ y7 + y8 + y9';
  const cfa4x2 = 'F1 =~ y1 + y2; F2 =~ y3 + y4; F3 =~ y5 + y6; F4 =~ y7 + y8';
  const corr3 = 'F1 ~~ F2 + F3; F2 ~~ F3';
  const corr4 = 'F1 ~~ F2 + F3 + F4; F2 ~~ F3 + F4; F3 ~~ F4';
  const bif3x3 = 'S1 =~ y1 + y2 + y3; S2 =~ y4 + y5 + y6; S3 =~ y7 + y8 + y9; G =~ ' + sum(1, 9);
  const bif4x2 = 'S1 =~ y1 + y2; S2 =~ y3 + y4; S3 =~ y5 + y6; S4 =~ y7 + y8; G =~ ' + sum(1, 8);
  const macA = 'X3 ~ X1 + X2; X4 ~ X1 + X2 + X3; X5 ~ X4 + X2; X1 ~~ X2';
  const macPos = { X1: [0, 0], X2: [0, 2], X3: [1.7, 0], X4: [1.7, 1], X5: [1.7, 2] };
  const macRes = { X3: 0, X4: 0, X5: 0 };
  const tri = { A: [0, 1.25], B: [1.1, 0], C: [2.2, 1.25] };
  const sq = { y1: [0, 0], y2: [1.6, 0], y3: [1.6, 1.6], y4: [0, 1.6] };
  // network sides drawn as clusters (the factor side keeps the row layout)
  const tri2 = { y1: [1, 1.15], y2: [0.25, 2.3], y3: [1.75, 2.3], y4: [4, 1.15], y5: [3.25, 2.3], y6: [4.75, 2.3] };
  const sq2 = { y1: [0.4, 0.95], y2: [2.0, 0.95], y3: [2.0, 2.3], y4: [0.4, 2.3], y5: [4.6, 0.95], y6: [6.2, 0.95], y7: [6.2, 2.3], y8: [4.6, 2.3] };
  const star = { y1: [1.5, 1.15], y2: [0.2, 2.3], y3: [1.5, 2.3], y4: [2.8, 2.3] };

  const items = [
    // ================================================================
    // EASY
    // ================================================================
    { id: 'E01', level: 1, rel: 'equiv', obs: ['A', 'B', 'C'], pos: { A: [0, 0], B: [1.4, 0], C: [2.8, 0] },
      A: 'B ~ A; C ~ B', B: 'A ~ B; C ~ B',
      why: 'Both models say that A and C are unrelated once you know B. Turning the first arrow around does not change that, so both reproduce exactly the same covariance matrices.' },
    { id: 'E02', level: 1, rel: 'equiv', obs: ['A', 'B', 'C', 'D'], pos: { A: [0, 0], B: [1.4, 0], C: [2.8, 0], D: [4.2, 0] },
      A: 'B ~ A; C ~ B; D ~ C', B: 'C ~ D; B ~ C; A ~ B',
      why: 'A chain read backwards is still a chain: in both models every variable only "talks" to its neighbours. Same conditional independencies, same fit on every dataset.' },
    { id: 'E03', level: 1, rel: 'equiv', obs: ys(6),
      A: cfa2 + '; F2 ~ F1', B: cfa2 + '; F1 ~~ F2',
      why: 'With only two factors, a regression F1 → F2 and a correlation F1 ↔ F2 both spend one parameter on the single covariance between the factors. The fit is identical.' },
    { id: 'E04', level: 1, rel: 'equiv', obs: ['A', 'B', 'C'], pos: tri,
      A: 'B ~ A; C ~ A + B', B: 'A ~~ B + C; B ~~ C',
      why: 'Both models are saturated: they have as many parameters (6) as there are variances and covariances. Every saturated model reproduces any covariance matrix, so all saturated models are equivalent.' },
    { id: 'E05', level: 1, rel: 'equiv', obs: ys(3),
      A: 'F =~ y1 + y2 + y3', B: 'y1 ~~ y2 + y3; y2 ~~ y3',
      why: 'A one-factor model with three indicators has 3 loadings and 3 residual variances: 6 parameters for 6 (co)variances. It is just-identified (saturated), like the model with all covariances free.' },

    { id: 'E06', level: 1, rel: 'AinB', obs: ys(6),
      A: cfa2 + '; F1 ~~ F2', B: 'F1 =~ y1 + y2 + y3 + y4; F2 =~ y4 + y5 + y6; F1 ~~ F2',
      why: 'B is A plus one cross-loading (F1 → y4). Fix that loading to zero and you get A back, so A is nested in B.' },
    { id: 'E07', level: 1, rel: 'AinB', obs: ys(6),
      A: 'F =~ ' + sum(1, 6), B: cfa2 + '; F1 ~~ F2',
      why: 'A one-factor model is a two-factor model whose factors correlate perfectly (r = 1). So the one-factor model is nested in the two-factor model.' },
    { id: 'E08', level: 1, rel: 'AinB', obs: ['A', 'B', 'C'], pos: { A: [0, 0], B: [1.4, 0], C: [2.8, 0] },
      A: 'B ~ A; C ~ B', B: 'B ~ A; C ~ A + B',
      why: 'B adds the direct effect A → C (and is saturated). Setting that effect to zero gives A: A is nested in B.' },
    { id: 'E09', level: 1, rel: 'AinB', obs: ys(6),
      A: cfa3x2 + '; F2 ~ F1; F3 ~ F2', B: cfa3x2 + '; ' + corr3,
      why: 'B leaves the three factor covariances free (a saturated latent block). The chain F1 → F2 → F3 restricts them (no direct F1–F3 link), so A is nested in B.' },
    { id: 'E10', level: 1, rel: 'AinB', obs: ys(6),
      A: cfa2, B: cfa2 + '; F1 ~~ F2',
      why: 'Orthogonal factors are correlated factors with the correlation fixed to zero: A is nested in B.' },

    { id: 'E11', level: 1, rel: 'BinA', obs: ys(6),
      A: cfa2 + '; F1 ~~ F2; y3 ~~ y4', B: cfa2 + '; F1 ~~ F2',
      why: 'A is B plus one residual covariance (y3 ↔ y4). Fix it to zero and you get B, so B is nested in A.' },
    { id: 'E12', level: 1, rel: 'BinA', obs: ['A', 'B', 'C'], pos: { A: [0, 0], B: [0, 1.6], C: [1.6, 0.8] },
      A: 'C ~ A + B; A ~~ B', B: 'C ~ A + B',
      why: 'B is A with the covariance between the predictors fixed to zero (A and B independent). B is nested in A.' },
    { id: 'E13', level: 1, rel: 'BinA', obs: ys(4),
      A: 'F =~ ' + sum(1, 4), B: 'F =~ a*y1 + a*y2 + a*y3 + a*y4',
      why: 'B forces all loadings to be equal (label a). That is a special case of A, where the loadings are free: B is nested in A.' },
    { id: 'E14', level: 1, rel: 'BinA', obs: ['X', 'y1', 'y2', 'y3'], pos: { X: [0, 1], y1: [1.2, 2], y2: [2.2, 2], y3: [3.2, 2], F: [2.2, 1] },
      A: 'F =~ y1 + y2 + y3; F ~ X; y1 ~ X', B: 'F =~ y1 + y2 + y3; F ~ X',
      why: 'A adds a direct effect of the covariate X on item y1. Fixing it to zero gives B, so B is nested in A.' },
    { id: 'E15', level: 1, rel: 'BinA', obs: ['A', 'B', 'C'], pos: { A: [0, 0.8], B: [1.6, 0], C: [1.6, 1.6] },
      A: 'B ~ A; C ~ A', B: '',
      why: 'B has no paths at all: only variances (the independence or "baseline" model). It is nested in every model with the same variables, including A.' },

    { id: 'E16', level: 1, rel: 'neither', obs: ['A', 'B', 'C'], pos: { A: [0, 0], B: [1.4, 0], C: [2.8, 0] },
      A: 'B ~ A; C ~ B', B: 'B ~ A + C',
      why: 'The chain says A and C are independent given B; the collider says A and C are independent (period), but dependent given B. Each restriction is violated by the other model.' },
    { id: 'E17', level: 1, rel: 'neither', obs: ys(6),
      A: cfa2 + '; F1 ~~ F2; y1 ~~ y2', B: cfa2 + '; F1 ~~ F2; y5 ~~ y6',
      why: 'Same number of parameters, but each model frees a residual covariance that the other fixes to zero. Neither can mimic the other.' },
    { id: 'E18', level: 1, rel: 'neither', obs: ys(6),
      A: cfa2, B: 'F =~ ' + sum(1, 6),
      why: 'A forces the two clusters to be uncorrelated; B forces all items through one factor, so the clusters must correlate. Neither restriction holds in the other model.' },
    { id: 'E19', level: 1, rel: 'neither', obs: ['A', 'B', 'C'], pos: tri,
      A: 'B ~ A; C ~ B', B: 'C ~ A; B ~ C',
      why: 'Different mediators: A says A and C are independent given B, B says A and B are independent given C. Both are chains, but they make different claims.' },
    { id: 'E20', level: 1, rel: 'neither', obs: ys(6),
      A: cfa3x2 + '; F2 ~ F1; F3 ~ F2', B: cfa3x2 + '; F3 ~ F1 + F2',
      why: 'A chain (F1 and F3 independent given F2) against a collider (F1 and F2 independent). Each model has a restriction the other violates.' },

    // ================================================================
    // MEDIUM
    // ================================================================
    { id: 'M01', level: 2, rel: 'equiv', obs: ys(4),
      A: 'F =~ ' + sum(1, 4) + '; y3 ~~ y4', B: 'F1 =~ y1 + y2; F2 =~ y3 + y4; F1 ~~ F2',
      why: 'Both models imply a single restriction, the tetrad σ13·σ24 = σ14·σ23, and nothing else (9 parameters each). The residual covariance does the same job as splitting off a second factor.' },
    { id: 'M02', level: 2, rel: 'equiv', obs: ys(9),
      A: cfa3x3 + '; G =~ F1 + F2 + F3', B: cfa3x3 + '; ' + corr3,
      why: 'A second-order factor on three first-order factors has three loadings for three factor covariances: it is just-identified, so it reproduces any correlation pattern among three factors.' },
    { id: 'M03', level: 2, rel: 'equiv', obs: ys(5),
      A: 'F1 =~ y1 + y2; F2 =~ y3 + y4 + y5; F1 ~~ F2', B: 'F =~ ' + sum(1, 5) + '; y1 ~~ y2',
      why: 'A factor with only two indicators adds exactly one free covariance (between those two items) on top of a single common factor. That is what the residual covariance y1 ↔ y2 does in B.' },
    { id: 'M04', level: 2, rel: 'equiv', obs: ['A', 'B', 'C', 'D'], pos: { A: [0, 0], B: [0, 1.7], C: [1.6, 0], D: [3.2, 0.85] }, res: { C: -90, D: -45 },
      A: 'A ~~ B; C ~ A; D ~ C + A + B', B: 'A ~~ B; C ~ A; D ~ A + B; C ~~ D',
      why: 'Replacing rule (Lee & Hershberger): C → D may be replaced by a residual covariance C ↔ D because the predictors of D include all predictors of C. Both models only claim that C and B are independent given A.' },
    { id: 'M05', level: 2, rel: 'equiv', obs: ys(6),
      A: cfa3x2 + '; F2 ~ F1; F3 ~ F1 + F2', B: cfa3x2 + '; ' + corr3,
      why: 'Three structural paths among three factors make a saturated latent block, just like three free factor covariances. Same measurement part, same fit.' },

    { id: 'M06', level: 2, rel: 'AinB', obs: ys(8),
      A: cfa4x2 + '; G =~ F1 + F2 + F3 + F4', B: cfa4x2 + '; ' + corr4,
      why: 'With four first-order factors the second-order factor explains six covariances with four loadings, imposing two restrictions. B leaves the six covariances free: A is nested in B.' },
    { id: 'M07', level: 2, rel: 'AinB', obs: ys(6),
      A: cfa2 + '; F1 ~~ F2', B: 'F =~ ' + sum(1, 6) + '; y4 ~~ y5 + y6; y5 ~~ y6',
      why: 'Surprise: one factor plus free residual covariances among y4–y6 can mimic the second factor. The part of y4–y6 that F1 does not explain goes into those residual covariances. B has two more parameters, so A is nested in B.' },
    { id: 'M08', level: 2, rel: 'AinB', obs: ys(6), posA: { F1: [2.5, -0.3], F2: [2.5, 1.12] },
      A: 'F1 =~ y1 + y2 + y5 + y6; F2 =~ y3 + y4; F1 ~~ F2', B: cfa3x2 + '; ' + corr3,
      why: 'Merge the first and third factor of B (correlation 1) and you get A. So A, with its non-adjacent indicators, is nested in the three-factor model.' },
    { id: 'M09', level: 2, rel: 'AinB', obs: ['A', 'B', 'C', 'D'], pos: { A: [0, 0], B: [0, 1.7], C: [1.6, 0.85], D: [3.2, 0.85] },
      A: 'C ~ A + B; D ~ C', B: 'B ~ A; C ~ A + B; D ~ A + B + C',
      why: 'B has every possible path between the four variables: it is saturated. Any model on the same variables is nested in a saturated model.' },
    { id: 'M10', level: 2, rel: 'AinB', obs: ys(6),
      A: 'F1 =~ a*y1 + b*y2 + c*y3; F2 =~ a*y4 + b*y5 + c*y6; F1 ~~ F2', B: cfa2 + '; F1 ~~ F2',
      why: 'A forces the same loading pattern (a, b, c) on both factors; B leaves all loadings free. A is a constrained version of B.' },

    { id: 'M11', level: 2, rel: 'BinA', obs: ys(4), pos: Object.assign({ F: [0.8, 0.8] }, sq),
      A: 'y2 ~ y1; y3 ~ y1 + y2; y4 ~ y1 + y2 + y3', B: 'F =~ ' + sum(1, 4),
      why: 'A is a saturated path model (all six paths). Every model on these four variables, also a factor model, is nested in it.' },
    { id: 'M12', level: 2, rel: 'BinA', obs: ['X', 'y1', 'y2', 'y3', 'Y'], pos: { X: [0, 0.9], y1: [1.1, 2.1], y2: [2.1, 2.1], y3: [3.1, 2.1], Y: [4.2, 0.9], F: [2.1, 0.9] },
      A: 'F =~ y1 + y2 + y3; F ~ X; Y ~ F + X', B: 'F =~ y1 + y2 + y3; F ~ X; Y ~ F',
      why: 'Partial mediation (A) against full mediation (B). Full mediation is partial mediation with the direct effect X → Y fixed to zero.' },
    { id: 'M13', level: 2, rel: 'BinA', obs: ys(6),
      A: cfa3x2 + '; ' + corr3, B: 'F =~ ' + sum(1, 6) + '; y1 ~~ y2',
      why: 'A residual covariance between y1 and y2 acts like a separate two-indicator factor for them. So B is a two-factor model, which in turn is the three-factor model with F2 and F3 merged.' },
    { id: 'M14', level: 2, rel: 'BinA', obs: ['A', 'B', 'C', 'D', 'E'], pos: { A: [0, 0], B: [0, 1.7], C: [1.5, 0.85], D: [3, 0], E: [3, 1.7] },
      A: 'A ~~ B; C ~ A + B; D ~ C; E ~ C + D', B: 'A ~~ B; C ~ A + B; D ~ C; E ~ C',
      why: 'B is A without the path D → E. Fix that coefficient to zero and A becomes B.' },
    { id: 'M15', level: 2, rel: 'BinA', obs: ys(3),
      A: 'F =~ y1 + y2 + y3', B: 'y2 ~ y1; y3 ~ y2',
      why: 'The one-factor model with three indicators is saturated, so it contains every model for these three variables, including the chain y1 → y2 → y3.' },

    { id: 'M16', level: 2, rel: 'neither', obs: ys(6),
      A: 'F1 =~ y1 + y2 + y3 + y4; F2 =~ y4 + y5 + y6; F1 ~~ F2', B: 'F1 =~ y1 + y2 + y3; F2 =~ y3 + y4 + y5 + y6; F1 ~~ F2',
      why: 'The cross-loading sits on a different item (y4 in A, y3 in B). Each model has a loading that the other fixes to zero.' },
    { id: 'M17', level: 2, rel: 'neither', obs: ys(6),
      A: cfa2 + '; F1 ~~ F2', B: 'F =~ ' + sum(1, 6) + '; y1 ~~ y2',
      why: 'B behaves like a two-factor model with {y1, y2} as a separate factor; A splits the items as {y1, y2, y3} and {y4, y5, y6}. Different splits: neither is nested.' },
    { id: 'M18', level: 2, rel: 'neither', obs: ys(6),
      A: cfa2 + '; F1 ~~ F2; y3 ~~ y4', B: 'F1 =~ y1 + y2 + y3 + y4; F2 =~ y4 + y5 + y6; F1 ~~ F2',
      why: 'A residual covariance only adds covariance between y3 and y4. A cross-loading changes the covariances of y4 with all items. Same number of parameters, different restrictions.' },
    { id: 'M19', level: 2, rel: 'neither', obs: ['X', 'M1', 'M2', 'Y'], pos: { X: [0, 0.85], M1: [1.6, 0], M2: [1.6, 1.7], Y: [3.2, 0.85] },
      A: 'M1 ~ X; M2 ~ X; Y ~ M1 + M2', B: 'M1 ~ X; M2 ~ M1; Y ~ M2',
      why: 'Parallel mediators (A: M1 and M2 independent given X) against serial mediation (B: M1 → M2). A has more parameters but still cannot produce B.' },
    { id: 'M20', level: 2, rel: 'neither', obs: ys(4),
      A: 'F =~ ' + sum(1, 4) + '; y1 ~~ y2', B: 'F =~ ' + sum(1, 4) + '; y1 ~~ y3',
      why: 'Each model keeps a different tetrad: A implies σ13·σ24 = σ14·σ23, B implies σ12·σ34 = σ14·σ23. Neither model satisfies the other\'s restriction.' },

    // ================================================================
    // HARD
    // ================================================================
    { id: 'H01', level: 3, rel: 'equiv', obs: ys(4),
      A: 'F =~ ' + sum(1, 4) + '; y1 ~~ y2', B: 'F =~ ' + sum(1, 4) + '; y3 ~~ y4',
      why: 'Both are the same as a two-factor model {y1, y2} | {y3, y4}: either residual covariance frees the covariance within one pair, and the factor variance takes care of the other pair. Both imply only σ13·σ24 = σ14·σ23.' },
    { id: 'H02', level: 3, rel: 'equiv', obs: ys(4),
      A: 'F =~ ' + sum(1, 4) + '; y1 ~~ y2; y3 ~~ y4', B: 'F1 =~ y1 + y2; F2 =~ y3 + y4; F1 ~~ F2',
      why: 'Counting trap: A has 10 parameters for 10 moments but is not identified, and still implies σ13·σ24 = σ14·σ23. It is exactly as restrictive as the two-factor model B.' },
    { id: 'H03', level: 3, rel: 'equiv', obs: ys(9),
      A: bif3x3, B: 'F =~ ' + sum(1, 9) + '; y1 ~~ y2 + y3; y2 ~~ y3; y4 ~~ y5 + y6; y5 ~~ y6; y7 ~~ y8 + y9; y8 ~~ y9',
      why: 'A group factor with three indicators has three loadings for the three covariances within its group: it can produce any pattern there. That is exactly what three free residual covariances do.' },
    { id: 'H04', level: 3, rel: 'equiv', obs: ys(8),
      A: 'F =~ ' + sum(1, 8) + '; y1 ~~ y2; y3 ~~ y4; y5 ~~ y6; y7 ~~ y8', B: cfa4x2 + '; G =~ F1 + F2 + F3 + F4',
      why: 'In both models all covariances between pairs follow one general factor, and the covariance within each pair is free (a residual covariance in A, a first-order factor variance in B). Same 20 free parameters, same restrictions.' },
    { id: 'H05', level: 3, rel: 'equiv', obs: ['X', 'y1', 'y2', 'y3'], pos: { X: [0, 2], y1: [1, 2], y2: [2, 2], y3: [3, 2], F: [1.5, 1] },
      A: 'F =~ y1 + y2 + y3; F ~ X', B: 'F =~ X + y1 + y2 + y3',
      why: 'A covariate that predicts the factor (A) cannot be told apart from one more indicator of that factor (B). Both say that X relates to the items only through F.' },

    { id: 'H06', level: 3, rel: 'AinB', obs: ys(9),
      A: cfa3x3 + '; G =~ F1 + F2 + F3', B: bif3x3,
      why: 'Schmid–Leiman: a higher-order model is a bifactor model whose general and group loadings are proportional within each group (Yung, Thissen & McLeod, 1999). The bifactor model drops those proportionality constraints.' },
    { id: 'H07', level: 3, rel: 'AinB', obs: ys(9),
      A: cfa3x3 + '; ' + corr3, B: bif3x3,
      why: 'Three correlated factors are equivalent to a higher-order model (just-identified), and a higher-order model is nested in the bifactor model. So the correlated-factors model is nested in the bifactor model.' },
    { id: 'H08', level: 3, rel: 'AinB', obs: ys(6),
      A: cfa3x2 + '; F2 ~ F3; F1 ~ F2', B: cfa3x2 + '; F2 ~ F1; F3 ~ F1 + F2',
      why: 'The arrows in B point the other way, but B\'s latent block is saturated: it reproduces any covariance matrix of the three factors, including the one implied by A\'s chain.' },
    { id: 'H09', level: 3, rel: 'AinB', obs: ['A', 'B', 'C', 'D'], pos: { A: [0, 2], B: [1, 2], C: [2, 2], D: [3, 2], F: [1.5, 1] },
      A: 'B ~ A; C ~ A; D ~ A', B: 'F =~ A + B + C + D',
      why: 'Let A be a perfect indicator of F (residual variance 0): then F is A, and the factor model becomes the path model with A as the common cause. A is nested in B.' },
    { id: 'H10', level: 3, rel: 'AinB', obs: ys(6),
      A: 'F =~ ' + sum(1, 6) + '; y1 ~~ y2; y3 ~~ y4', B: cfa3x2 + '; ' + corr3,
      why: 'Each residual covariance within a pair acts like a two-indicator factor. A is a one-factor model with two such pairs; the three-factor model B also frees the third pair.' },

    { id: 'H11', level: 3, rel: 'BinA', obs: ys(8),
      A: cfa4x2 + '; ' + corr4, B: 'F =~ ' + sum(1, 8) + '; y1 ~~ y2; y3 ~~ y4; y5 ~~ y6; y7 ~~ y8',
      why: 'B is equivalent to a second-order model over four two-indicator factors (one general factor plus a free covariance within each pair), and that is nested in four freely correlated factors.' },
    { id: 'H12', level: 3, rel: 'BinA', obs: ['X', 'y1', 'y2', 'y3'], pos: { X: [0, 2], y1: [1, 2], y2: [2, 2], y3: [3, 2], F: [1.5, 1] },
      A: 'F =~ X + y1 + y2 + y3; X ~~ y1', B: 'F =~ y1 + y2 + y3; F ~ X',
      why: 'B (X predicts F) is equivalent to the one-factor model with X as fourth indicator. A is that same model plus a residual covariance, so B is nested in A.' },
    { id: 'H13', level: 3, rel: 'BinA', obs: ['X1', 'X2', 'X3', 'X4', 'X5'], pos: macPos, res: macRes,
      A: macA, B: 'X3 ~ X1 + X2; X4 ~ X1 + X2; X5 ~ X4; X1 ~~ X2; X3 ~~ X4',
      why: 'Swapping X3 → X4 for the residual covariance X3 ↔ X4 is allowed (same predictors), so that change alone gives an equivalent model. B also drops X2 → X5, which makes it nested in A.' },
    { id: 'H14', level: 3, rel: 'BinA', obs: ys(6),
      A: 'F =~ ' + sum(1, 6) + '; y1 ~~ y2; y3 ~~ y4; y5 ~~ y6', B: 'F1 =~ y1 + y2 + y3 + y4; F2 =~ y5 + y6; F1 ~~ F2',
      why: 'A two-indicator factor (F2 in B) is equivalent to one residual covariance on top of one factor. So B is one factor plus y5 ↔ y6, which is A with two of its residual covariances fixed to zero.' },
    { id: 'H15', level: 3, rel: 'BinA', obs: ys(8), posB: { F1: [2.5, 0.25], F2: [4.5, 1] },
      A: cfa4x2 + '; ' + corr4, B: 'F1 =~ y1 + y2 + y5 + y6; F2 =~ y3 + y4 + y7 + y8; F1 ~~ F2',
      why: 'Merge F1 with F3 and F2 with F4 (correlations of 1) in the four-factor model and you get B. Non-adjacent indicators do not matter for nesting.' },

    { id: 'H16', level: 3, rel: 'neither', obs: ys(4),
      A: 'y2 ~ y1; y3 ~ y2; y4 ~ y3', B: 'F =~ ' + sum(1, 4),
      why: 'The chain makes y1 and y3 independent given y2; the factor model never makes items conditionally independent given another item. The factor model implies tetrads, which the chain violates.' },
    { id: 'H17', level: 3, rel: 'neither', obs: ['X1', 'X2', 'X3', 'X4', 'X5'], pos: macPos, res: macRes,
      A: macA, B: 'X3 ~ X1 + X2; X4 ~ X1 + X2 + X3; X5 ~ X2; X1 ~~ X2; X4 ~~ X5',
      why: 'An illegal use of the replacing rule: X4 → X5 cannot become X4 ↔ X5, because X5\'s predictors (X2) do not include those of X4. The models make different independence claims about X5.' },
    { id: 'H18', level: 3, rel: 'neither', obs: ys(9),
      A: cfa3x3 + '; G =~ F1 + F2 + F3', B: 'F =~ ' + sum(1, 9) + '; y1 ~~ y2 + y3; y2 ~~ y3',
      why: 'B forces the items of the second and third cluster to follow one general factor exactly; A gives every cluster its own factor. But A restricts the first cluster, which B leaves free. Neither contains the other.' },
    { id: 'H19', level: 3, rel: 'neither', obs: ['X', 'y1', 'y2', 'y3', 'y4'], pos: { X: [0, 1], y1: [1, 2], y2: [2, 2], y3: [3, 2], y4: [4, 2], F1: [1.5, 1], F2: [3.5, 1] },
      A: 'F1 =~ y1 + y2; F2 =~ y3 + y4; F1 ~ X; F2 ~ F1', B: 'F1 =~ y1 + y2; F2 =~ y3 + y4; F2 ~ X; F1 ~ F2',
      why: 'Both are mediation chains starting at X, but with a different mediator. A says X and F2 are independent given F1; B says X and F1 are independent given F2.' },
    { id: 'H20', level: 3, rel: 'neither', obs: ys(8),
      A: cfa4x2 + '; G =~ F1 + F2 + F3 + F4', B: cfa4x2 + '; F2 ~ F1; F3 ~ F2; F4 ~ F3',
      why: 'Two ways to explain the correlations among four factors: one common cause (tetrad restrictions) or a chain (conditional independencies). Neither set of restrictions implies the other.' },

    // ================================================================
    // PSYCHOMETRIKA
    // ================================================================
    { id: 'P01', level: 4, rel: 'equiv', obs: ys(4),
      A: 'network y1 y2 y3 y4; y1 -- y2; y2 -- y3; y3 -- y4', B: 'y2 ~ y1; y3 ~ y2; y4 ~ y3',
      why: 'A Gaussian graphical model (GGM) whose graph is a path has the same conditional independencies as the directed chain: both are exactly the covariance matrices with a tridiagonal inverse.' },
    { id: 'P02', level: 4, rel: 'equiv', obs: ys(6), posB: tri2,
      A: cfa2, B: 'network ' + ys(6).join(' ') + '; y1 -- y2 + y3; y2 -- y3; y4 -- y5 + y6; y5 -- y6',
      why: 'Orthogonal factors make the covariance matrix block-diagonal, and so is its inverse (two separate cliques in the GGM). With three indicators each factor is saturated within its block.' },
    { id: 'P03', level: 4, rel: 'equiv', obs: ys(6),
      A: cfa3x2 + '; network F1 F2 F3; F1 -- F2; F2 -- F3', B: cfa3x2 + '; F2 ~ F1; F3 ~ F2',
      why: 'A latent network model (LNM) with edges F1 — F2 — F3 says F1 and F3 are independent given F2, exactly like the latent chain F1 → F2 → F3.' },
    { id: 'P04', level: 4, rel: 'equiv', obs: ys(8),
      A: bif4x2, B: cfa4x2 + '; G =~ F1 + F2 + F3 + F4',
      why: 'With two indicators per group factor, the bifactor model only frees the covariance within each pair on top of a general factor, and so does the higher-order model. Here the two models are equivalent, not merely nested!' },
    { id: 'P05', level: 4, rel: 'equiv', obs: ys(6),
      A: 'F =~ ' + sum(1, 6) + '; network y1 y2 y3; y1 -- y2 + y3; y2 -- y3', B: 'F =~ ' + sum(1, 6) + '; y1 ~~ y2 + y3; y2 ~~ y3',
      why: 'A residual network model (RNM): a fully connected block of residual partial correlations is the same as a fully free block of residual covariances (the inverse of a block-diagonal matrix is block-diagonal).' },

    { id: 'P06', level: 4, rel: 'AinB', obs: ys(4), posA: star,
      A: 'network y1 y2 y3 y4; y1 -- y2 + y3 + y4', B: 'F =~ ' + sum(1, 4),
      why: 'In the star network y1 explains all associations. Make y1 a perfect indicator of F (no residual variance) and the factor model reproduces the star: A is nested in B.' },
    { id: 'P07', level: 4, rel: 'AinB', obs: ys(8), posB: sq2,
      A: 'F1 =~ y1 + y2 + y3 + y4; F2 =~ y5 + y6 + y7 + y8', B: 'network ' + ys(8).join(' ') + '; y1 -- y2 + y3 + y4; y2 -- y3 + y4; y3 -- y4; y5 -- y6 + y7 + y8; y6 -- y7 + y8; y7 -- y8',
      why: 'Orthogonal factors give a block-diagonal covariance matrix, so its inverse is block-diagonal too: two fully connected clusters in the GGM. The GGM leaves each block free, the factors do not.' },
    { id: 'P08', level: 4, rel: 'AinB', obs: ys(6),
      A: cfa3x2 + '; network F1 F2 F3; F1 -- F2; F2 -- F3', B: cfa3x2 + '; G =~ F1 + F2 + F3',
      why: 'The latent chain network removes the F1 — F3 edge (one restriction). A second-order factor on three factors is just-identified, so it reproduces any latent covariance matrix.' },
    { id: 'P09', level: 4, rel: 'AinB', obs: ys(6),
      A: 'F =~ ' + sum(1, 6) + '; network y1 y2 y3 y4; y1 -- y2; y3 -- y4', B: cfa3x2 + '; ' + corr3,
      why: 'Isolated residual edges in an RNM are just residual covariances. And a residual covariance within a pair acts like a two-indicator factor, so A is the three-factor model with one pair not separated.' },
    { id: 'P10', level: 4, rel: 'AinB', obs: ['A', 'B', 'C', 'D'], pos: { A: [0, 0], B: [0, 1.7], C: [1.6, 0.85], D: [3.2, 0.85] },
      A: 'C ~ A + B; D ~ C', B: 'network A B C D; A -- B + C; B -- C; C -- D',
      why: 'B is the moral graph of the DAG in A (marry the parents of C). Every conditional independence in the GGM also holds in the DAG, but the DAG adds one: A and B are marginally independent.' },

    { id: 'P11', level: 4, rel: 'BinA', obs: ys(6),
      A: 'F =~ ' + sum(1, 6) + '; network y1 y2 y3; y1 -- y2; y2 -- y3', B: 'F =~ ' + sum(1, 6) + '; y1 ~~ y2',
      why: 'One residual covariance is one residual edge. A residual network with edges y1 — y2 — y3 contains the network with only y1 — y2, so B is nested in A.' },
    { id: 'P12', level: 4, rel: 'BinA', obs: ys(4), pos: sq,
      A: 'network y1 y2 y3 y4; y1 -- y2; y2 -- y3; y3 -- y4; y4 -- y1', B: 'y2 ~ y1; y3 ~ y2; y4 ~ y3',
      why: 'The directed chain equals the GGM with the path y1 — y2 — y3 — y4. The cycle network adds the edge y4 — y1, so it contains the chain.' },
    { id: 'P13', level: 4, rel: 'BinA', obs: ys(6), posB: tri2,
      A: cfa2 + '; F1 ~~ F2', B: 'network ' + ys(6).join(' ') + '; y1 -- y2 + y3 + y4; y4 -- y5 + y6',
      why: 'Give y1 and y4 zero residual variance and they become F1 and F2 themselves. The two-factor model then becomes this tree-shaped network, so B is nested in A.' },
    { id: 'P14', level: 4, rel: 'BinA', obs: ys(9),
      A: bif3x3, B: cfa3x3 + '; network F1 F2 F3; F1 -- F2 + F3; F2 -- F3',
      why: 'A fully connected latent network is just three correlated factors, and those are nested in the bifactor model (via the higher-order model and Schmid–Leiman).' },
    { id: 'P15', level: 4, rel: 'BinA', obs: ys(4),
      A: 'F =~ ' + sum(1, 4) + '; network y1 y2 y3 y4; y1 -- y2 + y3 + y4; y2 -- y3 + y4; y3 -- y4', B: 'F1 =~ y1 + y2; F2 =~ y3 + y4; F1 ~~ F2',
      why: 'A factor model whose residuals form a complete network is saturated (and not identified): it reproduces any covariance matrix. Every model is nested in it.' },

    { id: 'P16', level: 4, rel: 'neither', obs: ys(4), pos: Object.assign({ F: [0.8, 0.8] }, sq),
      A: 'network y1 y2 y3 y4; y1 -- y2; y2 -- y3; y3 -- y4; y4 -- y1', B: 'F =~ ' + sum(1, 4),
      why: 'The cycle network sets two partial correlations to zero (y1 — y3, y2 — y4); a factor model sets no partial correlation to zero but imposes tetrads. Both have 8 parameters, but the restrictions differ.' },
    { id: 'P17', level: 4, rel: 'neither', obs: ys(6),
      A: 'F =~ ' + sum(1, 6) + '; network y1 y2 y3; y1 -- y2; y2 -- y3', B: 'F =~ ' + sum(1, 6) + '; y1 ~~ y2; y2 ~~ y3',
      why: 'A residual chain network sets a residual partial correlation to zero (y1, y3); the residual covariances in B set the residual covariance itself to zero. Same picture, different restriction.' },
    { id: 'P18', level: 4, rel: 'neither', obs: ys(8), posB: sq2,
      A: 'F1 =~ y1 + y2 + y3 + y4; F2 =~ y5 + y6 + y7 + y8; F1 ~~ F2', B: 'network ' + ys(8).join(' ') + '; y1 -- y2 + y3 + y4; y2 -- y3 + y4; y3 -- y4; y5 -- y6 + y7 + y8; y6 -- y7 + y8; y7 -- y8',
      why: 'Correlated factors connect the clusters (the GGM cannot); the GGM leaves each cluster saturated (the factors impose tetrads). Neither is nested.' },
    { id: 'P19', level: 4, rel: 'neither', obs: ys(3), pos: { y1: [0, 1.3], y3: [1.2, 0], y2: [2.4, 1.3] },
      A: 'network y1 y2 y3; y1 -- y3; y3 -- y2', B: 'y3 ~ y1 + y2',
      why: 'The network says y1 and y2 are independent given y3; the collider says they are independent without conditioning (and dependent given y3).' },
    { id: 'P20', level: 4, rel: 'neither', obs: ys(8),
      A: cfa4x2 + '; network F1 F2 F3 F4; F1 -- F2; F2 -- F3; F3 -- F4; F4 -- F1', B: cfa4x2 + '; G =~ F1 + F2 + F3 + F4',
      why: 'Both explain the latent correlations with 8 parameters, but the cycle network zeroes two latent partial correlations while the general factor imposes two tetrads. Different restrictions, so neither is nested.' },
  ];

  const LEVELS = { 1: 'Easy', 2: 'Medium', 3: 'Hard', 4: 'Psychometrika' };
  SN.bank = { items, LEVELS };
})(typeof window !== 'undefined' ? window : globalThis);
