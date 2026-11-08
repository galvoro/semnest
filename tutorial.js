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

  // short enough to fit a phone screen without scrolling; .only-phone and
  // .only-desk pick the hint for the device
  const CARDS = [
    { title: 'TWO MODELS', c: 'var(--a)',
      body: 'Squares are observed, circles latent. Arrows are effects, curved arrows covariances, plain lines network edges ' +
        '(no line: independent given the rest). Variances are free and not drawn.<span class="only-phone"> Tap a model to enlarge it.</span>' },
    { title: 'HOW DO THEY RELATE?', c: 'var(--b)',
      body: 'A model is the set of covariance matrices it can produce.' +
        '<span class="vrow"><span>' + V.equiv + 'equivalent</span><span>' + V.AinB + 'A nested in B</span><span>' + V.BinA + 'B nested in A</span><span>' + V.neither + 'neither</span></span>' },
    { title: 'NESTED?', c: 'var(--leaf)',
      body: 'A is <b>nested</b> in B if B fits everything A produces (χ²&nbsp;=&nbsp;0). <b>Equivalent</b>: nested both ways. ' +
        'Parameters are free real numbers, as in lavaan.' },
    { title: 'SCORING', c: 'var(--twig)',
      body: 'Five pairs, 20 points each. Confusing <b>nested</b> and <b>equivalent</b> (in the right direction) earns 8; ' +
        '60 of 100 earns a certificate.<span class="only-desk"> Keys 1–4 answer, Enter goes on.</span>' },
  ];

  const LEARN_CARDS = [
    { title: 'DRAW TWO MODELS', c: 'var(--a)',
      body: 'Both start as one factor. <b>Double-click</b> to add a factor, then click its items. <b>Path</b> draws loadings or effects, ' +
        '<b>Covary</b> links residuals or factors, <b>Erase</b> removes.' },
    { title: 'WATCH THE RELATION', c: 'var(--b)',
      body: 'The middle panel shows how the models relate, with their parameters and df. Try adding a residual covariance.' },
    { title: 'GIVE THEM NUMBERS', c: 'var(--leaf)',
      body: 'Press <b>Values</b> and move a slider: the other model finds values that give exactly the same covariance matrix.' },
    { title: 'NO SCORE', c: 'var(--twig)',
      body: 'Can different arrows be equivalent? Can more parameters still be less general?' },
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
