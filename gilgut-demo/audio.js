// 길굿 데모 — 사물(장구·북·꽹과리·징) 합성음. 정식 버전은 샘플 기반으로 대체 예정.
const GilgutAudio = (() => {
  let ctx = null, bus, tone, duckG, volG, noiseBuf;
  let pm = 1; // 야간 음높이 계수

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    bus = ctx.createGain();
    tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 16000;
    duckG = ctx.createGain(); volG = ctx.createGain(); volG.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    bus.connect(tone); tone.connect(duckG); duckG.connect(volG); volG.connect(comp); comp.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const now = () => (ctx ? ctx.currentTime : 0);

  function dest(pan) {
    if (!pan) return bus;
    const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(bus); return p;
  }
  function env(t, peak, decay, attack = 0.002) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  function osc(type, f0, f1, t, glide, dur, out) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    o.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, ftype, freq, q, out) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    s.connect(f); f.connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  // 장구 궁편 (쿵)
  function kung(t, vel = 1, pan = 0) {
    const d = dest(pan);
    const g = env(t, 0.9 * vel, 0.3); g.connect(d);
    osc('sine', 150 * pm, 62 * pm, t, 0.12, 0.35, g);
    const c = env(t, 0.25 * vel, 0.025); c.connect(d);
    noise(t, 0.04, 'lowpass', 900, 0.7, c);
  }
  // 장구 채편 (덕)
  function deok(t, vel = 1, pan = 0) {
    const d = dest(pan);
    const n = env(t, 0.5 * vel, 0.07, 0.001); n.connect(d);
    noise(t, 0.09, 'bandpass', 2100 * pm, 1.2, n);
    const g = env(t, 0.32 * vel, 0.06, 0.001); g.connect(d);
    osc('triangle', 520 * pm, 380 * pm, t, 0.05, 0.08, g);
  }
  // 북
  function buk(t, vel = 1, pan = 0, damp = false) {
    const d = dest(pan);
    const g = env(t, 1.0 * vel, damp ? 0.16 : 0.48); g.connect(d);
    osc('sine', 108 * pm, 47 * pm, t, 0.18, 0.55, g);
    const c = env(t, (damp ? 0.5 : 0.3) * vel, damp ? 0.09 : 0.05); c.connect(d);
    noise(t, 0.12, 'lowpass', damp ? 1400 : 420, 0.7, c);
  }
  // 꽹과리 — 고음을 누그러뜨린 음색 (저역 통과 4.2kHz)
  function kk(t, vel = 1, pan = 0, open = true) {
    const d = dest(pan);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4200; lp.Q.value = 0.5;
    const g = env(t, 0.15 * vel, open ? 0.3 : 0.065, 0.001);
    g.connect(lp); lp.connect(d);
    const base = 590 * pm, ratios = [1, 1.34, 1.87, 2.51, 3.14], amps = [1, 0.7, 0.55, 0.4, 0.25];
    ratios.forEach((r, i) => {
      const a = ctx.createGain(); a.gain.value = amps[i]; a.connect(g);
      osc(i < 2 ? 'square' : 'triangle', base * r, base * r * 0.995, t, 0.2, open ? 0.35 : 0.1, a);
    });
  }
  // 징
  function jing(t, vel = 1, pan = 0) {
    const d = dest(pan);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(2800, t); lp.frequency.exponentialRampToValueAtTime(520, t + 2.5);
    const dur = 2.2 + 2.2 * vel;
    const g = env(t, 0.5 * vel, dur, 0.012);
    g.connect(lp); lp.connect(d);
    const base = 172 * pm, ratios = [1, 2.0, 2.76, 3.9, 5.2], amps = [1, 0.5, 0.35, 0.2, 0.1];
    ratios.forEach((r, i) => {
      const a = ctx.createGain(); a.gain.value = amps[i]; a.connect(g);
      osc('sine', base * r * 0.965, base * r, t, 0.7, dur, a);
    });
    const c = env(t, 0.2 * vel, 0.06); c.connect(d);
    noise(t, 0.08, 'lowpass', 600, 0.7, c);
  }

  function setDuck(on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    duckG.gain.cancelScheduledValues(t);
    duckG.gain.setTargetAtTime(on ? 0.2 : 1, t, on ? 0.03 : 0.25); // 낮출 땐 즉시, 올릴 땐 천천히
  }
  function setNight(on) {
    pm = on ? 0.84 : 1;
    if (ctx) tone.frequency.setTargetAtTime(on ? 2300 : 16000, ctx.currentTime, 0.4);
  }
  function setVolume(v) { if (ctx) volG.gain.setTargetAtTime(v, ctx.currentTime, 0.05); else pendingVol = v; }
  let pendingVol = null;

  return { init, now, kung, deok, buk, kk, jing, setDuck, setNight, setVolume, get ready() { return !!ctx; } };
})();
