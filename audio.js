// SEMNEST — WebAudio synth sound effects (+ optional background music).
// Exposes window.GaltonAudio (same interface as the other Galvoro capsules).
// Background music: assets/bgm.mp3 (made with Suno), looped seamlessly from
// the WebAudio buffer (see BGM_LOOP).
(function (global) {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // -------- BGM --------
  // Loop points: the track plays from 0 s; after start + length it returns
  // to start (+ crossfade). The last `crossfade` seconds before the jump
  // blend into the music right after `start`, so the seam is inaudible.
  // Found by beat analysis of the track (99.9 BPM): the 32 bars from 20.22 s
  // return at 97.11 s (rhythm and harmony match); the 2-second lead-in and
  // the cut-off at the end (150 s) are not looped. null loops the whole file.
  const BGM_LOOP = { start: 20.22, length: 76.8905, crossfade: 2.4 };
  const BGM_FILE = 'assets/bgm.mp3';
  let bgmTargetVolume = 0.18;
  let bgmWanted = false;
  let bgm = null;            // { buf, loopStart, loopEnd } once decoded
  let bgmLoading = null;
  let bgmSrc = null, bgmGain = null;
  let bgmEl = null;          // HTMLAudio fallback

  function makeLoop(c, raw) {
    const sr = raw.sampleRate;
    if (!BGM_LOOP) return { buf: raw, loopStart: 0, loopEnd: raw.duration };
    const S0 = Math.round((BGM_LOOP.start || 0) * sr);
    const X = Math.round(BGM_LOOP.crossfade * sr), Lp = Math.round(BGM_LOOP.length * sr), E = S0 + Lp + X;
    if (E > raw.length) return { buf: raw, loopStart: 0, loopEnd: raw.duration };
    const out = c.createBuffer(raw.numberOfChannels, E, sr);
    for (let ch = 0; ch < raw.numberOfChannels; ch++) {
      const a = raw.getChannelData(ch), o = out.getChannelData(ch);
      o.set(a.subarray(0, E));
      // last bar: equal-power crossfade from the music at that point into
      // the bar after the loop start, so jumping from E back to S0 + X is
      // seamless
      for (let i = 0; i < X; i++) {
        const t = (i + 0.5) / X;
        o[S0 + Lp + i] = a[S0 + Lp + i] * Math.cos(t * Math.PI / 2) + a[S0 + i] * Math.sin(t * Math.PI / 2);
      }
    }
    return { buf: out, loopStart: (S0 + X) / sr, loopEnd: E / sr };
  }
  function bgmLoad(c) {
    if (bgm || bgmLoading) return bgmLoading;
    bgmLoading = fetch(BGM_FILE)
      .then(r => { if (!r.ok) throw new Error('no bgm'); return r.arrayBuffer(); })
      .then(ab => new Promise((res, rej) => c.decodeAudioData(ab, res, rej)))
      .then(raw => { bgm = makeLoop(c, raw); })
      .catch(() => { bgm = null; bgmFallback(); });
    return bgmLoading;
  }
  function bgmFallback() {
    if (bgmEl) return;
    try {
      bgmEl = new Audio(BGM_FILE);
      bgmEl.loop = true;
      bgmEl.preload = 'auto';
      bgmEl.volume = muted ? 0 : bgmTargetVolume;
      if (bgmWanted) bgmEl.play().catch(() => {});
    } catch (e) { bgmEl = null; }
  }
  function bgmPlay(c) {
    if (!bgmWanted || bgmSrc || !bgm) return;
    if (!bgmGain) { bgmGain = c.createGain(); bgmGain.connect(c.destination); }
    bgmGain.gain.setValueAtTime(muted ? 0 : bgmTargetVolume, c.currentTime);
    const src = c.createBufferSource();
    src.buffer = bgm.buf;
    src.loop = true;
    src.loopStart = bgm.loopStart;
    src.loopEnd = bgm.loopEnd;
    src.connect(bgmGain);
    src.start();
    bgmSrc = src;
  }
  function bgmStart() {
    if (!BGM_FILE) return;
    bgmWanted = true;
    if (bgmEl) { bgmEl.volume = muted ? 0 : bgmTargetVolume; bgmEl.play().catch(() => {}); return; }
    const c = ensure();
    if (!c || !global.fetch) { bgmFallback(); return; }
    if (bgm) bgmPlay(c);
    else bgmLoad(c).then(() => { if (bgm) bgmPlay(c); });
  }
  // while the page is hidden the music pauses (and resumes where it was)
  document.addEventListener('visibilitychange', () => {
    if (!bgmWanted) return;
    if (document.hidden) {
      if (ctx && ctx.state === 'running') ctx.suspend();
      if (bgmEl) bgmEl.pause();
    } else {
      if (ctx && ctx.state === 'suspended') ctx.resume();
      if (bgmEl) bgmEl.play().catch(() => {});
    }
  });
  function bgmStop() {
    bgmWanted = false;
    if (bgmSrc) { try { bgmSrc.stop(); } catch (e) {} bgmSrc = null; }
    if (bgmEl) { try { bgmEl.pause(); } catch (e) {} }
  }
  function applyBgmVolume() {
    const v = muted ? 0 : bgmTargetVolume;
    if (bgmGain && ctx) bgmGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
    if (bgmEl) bgmEl.volume = v;
  }
  function bgmSetVolume(v) {
    bgmTargetVolume = Math.max(0, Math.min(1, v));
    applyBgmVolume();
  }

  function setMuted(m) {
    muted = m;
    applyBgmVolume();
  }
  function isMuted() { return muted; }

  // -------- SFX primitives --------
  function tone({ freq = 440, dur = 0.1, type = 'square', gain = 0.08, slide = 0, delay = 0 }) {
    if (muted) return;
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.15, gain = 0.08, filter = 800, delay = 0 }) {
    if (muted) return;
    const c = ensure(); if (!c) return;
    const t0 = c.currentTime + delay;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = filter; bp.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t0); src.stop(t0 + dur);
  }

  // a marimba-like note: the fundamental and a short fourth partial
  function mallet(f, delay = 0, g = 0.08) {
    tone({ freq: f, dur: 0.26, type: 'sine', gain: g, delay });
    tone({ freq: f * 4, dur: 0.05, type: 'sine', gain: g * 0.35, delay });
  }

  const SFX = {
    click:   () => tone({ freq: 440, dur: 0.03, gain: 0.05 }),
    error:   () => tone({ freq: 180, dur: 0.15, type: 'sawtooth', gain: 0.08 }),
    coin:    () => { tone({ freq: 988,  dur: 0.06 });
                     tone({ freq: 1319, dur: 0.10, delay: 0.06 }); },
    pop:     () => tone({ freq: 900, dur: 0.05, gain: 0.10 }),
    levelup: () => [523, 659, 784, 1047].forEach((f, i) =>
                     tone({ freq: f, dur: 0.12, delay: i * 0.08, gain: 0.08 })),

    // ---- capsule-specific ----
    place:   () => { tone({ freq: 620, dur: 0.05, type: 'triangle', gain: 0.08 });
                     tone({ freq: 930, dur: 0.06, type: 'triangle', gain: 0.06, delay: 0.04 }); },
    connect: () => tone({ freq: 760, dur: 0.05, type: 'triangle', gain: 0.07, slide: 240 }),
    erase:   () => tone({ freq: 360, dur: 0.07, type: 'triangle', gain: 0.07, slide: -160 }),
    // wooden mallets and a log drum (a valley, not a garden)
    good:    () => { noise({ dur: 0.035, gain: 0.05, filter: 1400 });
                     mallet(440, 0, 0.08); mallet(659.3, 0.1, 0.075); mallet(880, 0.2, 0.06); },
    half:    () => { mallet(440, 0, 0.07); mallet(392, 0.12, 0.06); },
    wrong:   () => { tone({ freq: 98, dur: 0.3, type: 'sine', gain: 0.11, slide: -30 });
                     tone({ freq: 196, dur: 0.26, type: 'triangle', gain: 0.06, slide: -70 }); },
    // relation changed in LEARN
    shift:   () => { tone({ freq: 880, dur: 0.05, type: 'sine', gain: 0.05 });
                     tone({ freq: 1320, dur: 0.07, type: 'sine', gain: 0.045, delay: 0.05 }); },
    // an egg cracks, then a rising run
    hatch:   () => { [0, 0.09, 0.15].forEach(d => noise({ dur: 0.03, gain: 0.07, filter: 2600, delay: d }));
                     [392, 493.9, 587.3, 784].forEach((f, i) => mallet(f, 0.3 + i * 0.1, 0.075)); },
  };

  global.GaltonAudio = {
    SFX, tone, noise, setMuted, isMuted, ensure,
    bgm: { start: bgmStart, stop: bgmStop, setVolume: bgmSetVolume },
    _loop: { makeLoop, BGM_LOOP },          // for .dev/check_bgm_loop.js
  };
})(window);
