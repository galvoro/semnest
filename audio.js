// SEMNEST — WebAudio synth sound effects (+ optional background music).
// Exposes window.GaltonAudio (same interface as the other Galvoro capsules).
// Background music: drop a track at assets/bgm.mp3 and set BGM_FILE below;
// until then the game is silent apart from the effects.
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
  // Loop points for assets/bgm.mp3 ("Quiet Calibration", 110.9 BPM, bar
  // 2.164 s), from .dev/loop_points.js: the first pass plays the original
  // intro; after 27 bars + 1 bar of crossfade (60.6 s, before the fade-out)
  // the music blends back into bar 2 and loops a 27-bar cycle, on the beat.
  // Set BGM_LOOP = null to loop the whole file instead.
  const BAR = 4 * 0.5409;
  const BGM_LOOP = { length: 27 * BAR, crossfade: BAR };
  const BGM_FILE = null;     // e.g. 'assets/bgm.mp3' once a track is added
  let bgmTargetVolume = 0.18;
  let bgmWanted = false;
  let bgm = null;            // { buf, loopStart, loopEnd } once decoded
  let bgmLoading = null;
  let bgmSrc = null, bgmGain = null;
  let bgmEl = null;          // HTMLAudio fallback

  function makeLoop(c, raw) {
    const sr = raw.sampleRate;
    if (!BGM_LOOP) return { buf: raw, loopStart: 0, loopEnd: raw.duration };
    const X = Math.round(BGM_LOOP.crossfade * sr), Lp = Math.round(BGM_LOOP.length * sr), E = Lp + X;
    if (E > raw.length) return { buf: raw, loopStart: 0, loopEnd: raw.duration };
    const out = c.createBuffer(raw.numberOfChannels, E, sr);
    for (let ch = 0; ch < raw.numberOfChannels; ch++) {
      const a = raw.getChannelData(ch), o = out.getChannelData(ch);
      o.set(a.subarray(0, E));
      // last bar: equal-power crossfade from the music at that point into
      // the opening bar, so jumping from E back to X is seamless
      for (let i = 0; i < X; i++) {
        const t = (i + 0.5) / X;
        o[Lp + i] = a[Lp + i] * Math.cos(t * Math.PI / 2) + a[i] * Math.sin(t * Math.PI / 2);
      }
    }
    return { buf: out, loopStart: X / sr, loopEnd: E / sr };
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
    // a little bird: correct answer
    chirp:   () => { tone({ freq: 1900, dur: 0.07, type: 'sine', gain: 0.07, slide: 900 });
                     tone({ freq: 2300, dur: 0.08, type: 'sine', gain: 0.06, slide: 700, delay: 0.09 });
                     tone({ freq: 2600, dur: 0.11, type: 'sine', gain: 0.05, slide: -500, delay: 0.19 }); },
    half:    () => { tone({ freq: 1500, dur: 0.08, type: 'sine', gain: 0.06, slide: 500 });
                     tone({ freq: 1300, dur: 0.12, type: 'sine', gain: 0.05, slide: -300, delay: 0.1 }); },
    wrong:   () => tone({ freq: 260, dur: 0.3, type: 'triangle', gain: 0.07, slide: -110 }),
    // relation changed in LEARN
    shift:   () => { tone({ freq: 880, dur: 0.05, type: 'sine', gain: 0.05 });
                     tone({ freq: 1320, dur: 0.07, type: 'sine', gain: 0.045, delay: 0.05 }); },
    hatch:   () => [784, 988, 1175, 1568].forEach((f, i) =>
                     tone({ freq: f, dur: 0.16, type: 'triangle', delay: i * 0.1, gain: 0.08 })),
  };

  global.GaltonAudio = {
    SFX, tone, noise, setMuted, isMuted, ensure,
    bgm: { start: bgmStart, stop: bgmStop, setVolume: bgmSetVolume },
    _loop: { makeLoop, BGM_LOOP },          // for .dev/check_bgm_loop.js
  };
})(window);
