// SEMNEST — briefing cards (before the first round, and the "?" popup).
(function (global) {
  'use strict';
  const SN = global.SN = global.SN || {};

  const V = {
    equiv: '<svg class="venn" viewBox="0 0 64 40"><ellipse class="v-b" cx="32" cy="20" rx="17" ry="15.5"/><ellipse class="v-a dash" cx="32" cy="20" rx="17" ry="15.5"/></svg>',
    AinB: '<svg class="venn" viewBox="0 0 64 40"><ellipse class="v-b" cx="32" cy="20" rx="25" ry="17.5"/><ellipse class="v-a" cx="27" cy="21" rx="12" ry="10"/></svg>',
    BinA: '<svg class="venn" viewBox="0 0 64 40"><ellipse class="v-a" cx="32" cy="20" rx="25" ry="17.5"/><ellipse class="v-b" cx="37" cy="21" rx="12" ry="10"/></svg>',
    neither: '<svg class="venn" viewBox="0 0 64 40"><ellipse class="v-a" cx="23" cy="20" rx="15" ry="14"/><ellipse class="v-b" cx="41" cy="20" rx="15" ry="14"/></svg>',
  };
  SN.VENN = V;

  const CARDS = [
    { title: 'TWO MODELS, ONE NEST', c: 'var(--a)',
      body: 'Each round shows two models, <b>A</b> and <b>B</b>, for the same observed variables (squares). Circles are latent variables, ' +
        'arrows effects, curved arrows covariances, plain lines network edges (partial correlations; no line = independent given all others). Variances are free and not drawn.' },
    { title: 'HOW DO THEY RELATE?', c: 'var(--b)',
      body: 'Think of a model as the set of covariance matrices it can produce. ' +
        '<div class="vrow"><span>' + V.equiv + 'equivalent</span><span>' + V.AinB + 'A nested in B</span><span>' + V.BinA + 'B nested in A</span><span>' + V.neither + 'neither</span></div>' },
    { title: 'NESTED?', c: 'var(--leaf)',
      body: 'A is <b>nested</b> in B if B can produce everything A can (fit B to A\'s implied covariance matrix: χ² = 0). ' +
        '<b>Equivalent</b> = nested both ways: the same fit on every dataset. Parameters are free real numbers, as in lavaan.' },
    { title: 'SCORING', c: 'var(--twig)',
      body: 'Five pairs per game, 20 points each. Confusing <b>nested</b> and <b>equivalent</b> (in the right direction) earns 8. ' +
        'Score 60 of 100 for a certificate. Keys 1–4 answer, Enter goes on.' },
  ];

  const LEARN_CARDS = [
    { title: 'DRAW TWO MODELS', c: 'var(--a)',
      body: 'Both canvases start as a one-factor model. <b>Double-click</b> to add a factor and click its items; <b>Path</b> draws loadings or structural effects, ' +
        '<b>Covary</b> links residuals or factors, <b>Erase</b> removes.' },
    { title: 'WATCH THE RELATION', c: 'var(--b)',
      body: 'The middle panel shows how the models relate: equivalent, nested, or neither, plus their parameters and degrees of freedom. ' +
        'Add a residual covariance to one side and see what happens.' },
    { title: 'GIVE THEM NUMBERS', c: 'var(--leaf)',
      body: 'Press <b>Values</b>. Change the parameters of the nested (or an equivalent) model with the slider, ' +
        'and watch the other model find values that reproduce exactly the same covariance matrix.' },
    { title: 'NO SCORE', c: 'var(--twig)',
      body: 'Just explore. Can you make two models with different arrows equivalent? Can you find a model with more parameters that is still not more general?' },
  ];

  let onDone = null;
  function show(opts) {
    opts = opts || {};
    const scr = document.getElementById('screen-tutorial');
    const grid = document.getElementById('tut-cards');
    const btn = document.getElementById('tut-continue');
    grid.innerHTML = '';
    (opts.learn ? LEARN_CARDS : CARDS).forEach((c, k) => {
      const d = document.createElement('div');
      d.className = 'tut-card';
      d.style.setProperty('--c', c.c);
      d.style.animationDelay = (opts.popup ? 0 : 0.1 * k) + 's';
      d.innerHTML = '<h3>' + c.title + '</h3><p>' + c.body + '</p>';
      grid.appendChild(d);
    });
    btn.textContent = opts.popup ? 'BACK' : 'START';
    scr.querySelector('.tut-header').textContent = opts.learn ? 'LEARN: NESTING ON THE FLY' : 'HOW TO PLAY';
    scr.classList.toggle('popup', !!opts.popup);
    scr.classList.add('show');
    onDone = opts.onDismiss || null;
  }
  function hide() {
    document.getElementById('screen-tutorial').classList.remove('show', 'popup');
    const f = onDone; onDone = null;
    if (f) f();
  }
  function isOpen() { return document.getElementById('screen-tutorial').classList.contains('show'); }
  document.getElementById('tut-continue').addEventListener('click', () => {
    if (global.GaltonAudio) global.GaltonAudio.SFX.click();
    hide();
  });
  document.getElementById('tut-close').addEventListener('click', hide);

  SN.tutorial = { show, hide, isOpen };
})(window);
