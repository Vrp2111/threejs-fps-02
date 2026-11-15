// Procedural sound: every effect is synthesized with WebAudio, no audio files.
// One AudioContext, created on first user gesture; all nodes short-lived
// except the quiet wind loop. Master gain keeps the mix under control.
export function createAudio() {
  let ctx = null;
  let master = null;
  let wind = null;
  let muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Quiet wind bed: looped noise through a slow lowpass wobble.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320;
      const g = ctx.createGain(); g.gain.value = 0.018;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = 140;
      lfo.connect(lfoGain); lfoGain.connect(lp.frequency); lfo.start();
      src.connect(lp); lp.connect(g); g.connect(master); src.start();
      wind = { src, g };
    } catch { return false; }
    return true;
  }

  function noiseBurst(dur, filterType, freq, gain, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  function tone(freq, dur, type, gain, slideTo = 0, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // Distance-attenuated shot: near shots crack, far shots thud.
  function shot(kind, dist = 0) {
    if (!ensure()) return;
    const att = 1 / (1 + dist * 0.055);
    const vol = 0.55 * att + 0.06;
    if (kind === 'sniper') { noiseBurst(0.28, 'lowpass', 900, vol); tone(160, 0.22, 'sine', vol * 0.8, 55); }
    else if (kind === 'dmr') { noiseBurst(0.2, 'bandpass', 1100, vol); tone(150, 0.18, 'sine', vol * 0.75, 60); }
    else if (kind === 'shotgun') { noiseBurst(0.22, 'bandpass', 700, vol); tone(120, 0.16, 'sine', vol * 0.7, 50); }
    else if (kind === 'rifle') { noiseBurst(0.12, 'bandpass', 1400, vol); tone(190, 0.09, 'square', vol * 0.22, 90); }
    else if (kind === 'smg') { noiseBurst(0.09, 'bandpass', 1800, vol * 0.85); }
    else { noiseBurst(0.1, 'bandpass', 1600, vol * 0.9); }
  }

  return {
    ensure,
    shot,
    dryFire() { if (ensure()) tone(1400, 0.03, 'square', 0.08); },
    reload() { if (!ensure()) return; tone(900, 0.04, 'square', 0.1); tone(600, 0.04, 'square', 0.12, 0, 0.28); tone(1100, 0.05, 'square', 0.12, 0, 0.55); },
    hitmarker(kill) { if (!ensure()) return; tone(kill ? 1320 : 990, 0.05, 'sine', 0.14); if (kill) tone(1760, 0.09, 'sine', 0.14, 0, 0.06); },
    hurt() { if (!ensure()) return; noiseBurst(0.12, 'lowpass', 500, 0.3); tone(90, 0.14, 'sine', 0.25, 45); },
    step(run) { if (!ensure()) return; noiseBurst(0.05, 'lowpass', run ? 500 : 380, run ? 0.05 : 0.035); },
    jump() { if (ensure()) noiseBurst(0.06, 'lowpass', 600, 0.08); },
    plantBeep(final) { if (!ensure()) return; tone(final ? 1760 : 1180, 0.07, 'square', 0.12); },
    explode() {
      if (!ensure()) return;
      noiseBurst(0.9, 'lowpass', 900, 0.9);
      tone(70, 0.8, 'sine', 0.7, 28);
      noiseBurst(0.4, 'bandpass', 300, 0.5, 0.05);
    },
    bounce() { if (ensure()) tone(320, 0.05, 'sine', 0.1, 180); },
    flash() { if (!ensure()) return; tone(2400, 0.3, 'sine', 0.12, 1800); noiseBurst(0.15, 'highpass', 3000, 0.12); },
    smoke() { if (ensure()) noiseBurst(0.5, 'lowpass', 700, 0.22); },
    buy() { if (!ensure()) return; tone(880, 0.06, 'sine', 0.14); tone(1320, 0.08, 'sine', 0.14, 0, 0.07); },
    deny() { if (ensure()) tone(220, 0.12, 'square', 0.12, 160); },
    roundWin() { if (!ensure()) return; [523, 659, 784].forEach((f, i) => tone(f, 0.16, 'sine', 0.16, 0, i * 0.11)); },
    roundLose() { if (!ensure()) return; [392, 330, 262].forEach((f, i) => tone(f, 0.18, 'sine', 0.15, 0, i * 0.12)); },
    plantStart() { if (!ensure()) return; tone(660, 0.08, 'square', 0.1); tone(880, 0.08, 'square', 0.1, 0, 0.1); },
    defuseStart() { if (!ensure()) return; tone(990, 0.08, 'square', 0.1); tone(990, 0.08, 'square', 0.1, 0, 0.12); },
    click() { if (ensure()) tone(700, 0.03, 'square', 0.07); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
  };
}
