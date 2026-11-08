// Background music loop: decodes assets/bgm.mp3 in headless Chrome, builds the
// loop with audio.js (GaltonAudio._loop.makeLoop) and checks the seam: the
// level just before the jump back must match the level just after it. Also
// writes .dev/out/bgm_seam.wav (6 s before + 6 s after the jump) to listen to.
//   node .dev/check_bgm_loop.js [baseURL]
const { launch } = require('./cdp.js');
const fs = require('fs'), path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8811/semnest/';
(async () => {
  const b = await launch({ width: 800, height: 600, port: 9396 });
  let bad = 0;
  try {
    await b.goto(BASE + 'index.html');
    const r = await b.eval(`(async () => {
      const ab = await (await fetch('assets/bgm.mp3')).arrayBuffer();
      const c = new OfflineAudioContext(2, 48000, 48000);
      const raw = await c.decodeAudioData(ab);
      const L = GaltonAudio._loop.makeLoop(c, raw);
      const sr = L.buf.sampleRate, d = L.buf.getChannelData(0);
      const rms = (t0, t1) => { let s = 0, n = 0; for (let i = Math.round(t0 * sr); i < Math.round(t1 * sr); i++) { s += d[i] * d[i]; n++; } return 20 * Math.log10(Math.sqrt(s / n)); };
      // the seam as heard: [loopEnd - 6, loopEnd) then [loopStart, loopStart + 6)
      const a = L.buf.getChannelData(0), bb = L.buf.numberOfChannels > 1 ? L.buf.getChannelData(1) : a;
      const n6 = 6 * sr, out = [];
      const e = Math.round(L.loopEnd * sr), s0 = Math.round(L.loopStart * sr);
      for (let i = e - n6; i < e; i++) out.push(a[i], bb[i]);
      for (let i = s0; i < s0 + n6; i++) out.push(a[i], bb[i]);
      // jump size at the seam (sample discontinuity)
      const jump = Math.abs(a[e - 1] - a[s0]);
      return { dur: raw.duration, sr, loopStart: L.loopStart, loopEnd: L.loopEnd,
        before: rms(L.loopEnd - 1, L.loopEnd), after: rms(L.loopStart, L.loopStart + 1), jump,
        pcm: Array.from(out, v => Math.round(Math.max(-1, Math.min(1, v)) * 32767)) };
    })()`);
    console.log(`track ${r.dur.toFixed(2)} s at ${r.sr} Hz; plays 0 -> ${r.loopEnd.toFixed(2)} s, then loops ${r.loopStart.toFixed(2)} -> ${r.loopEnd.toFixed(2)} s (${(r.loopEnd - r.loopStart).toFixed(2)} s)`);
    console.log(`level 1 s before the jump ${r.before.toFixed(1)} dB, 1 s after ${r.after.toFixed(1)} dB; sample jump ${r.jump.toFixed(4)}`);
    if (Math.abs(r.before - r.after) > 3 || r.jump > 0.05) { bad++; console.log('FAIL: audible seam likely'); }
    // WAV for listening
    const pcm = Int16Array.from(r.pcm), hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length * 2, 4); hdr.write('WAVEfmt ', 8);
    hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(r.sr, 24);
    hdr.writeUInt32LE(r.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length * 2, 40);
    fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'out', 'bgm_seam.wav'), Buffer.concat([hdr, Buffer.from(pcm.buffer)]));
    console.log('wrote .dev/out/bgm_seam.wav (the jump is at 6 s)');
  } catch (e) { bad++; console.log('ERROR', e.message); }
  await b.close();
  process.exitCode = bad ? 1 : 0;
})();
