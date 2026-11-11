// 길굿 데모 — 차량 신호 시뮬레이터 + 주행 장단 엔진
(() => {
  const A = GilgutAudio;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('gilgut.' + k)) ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem('gilgut.' + k, JSON.stringify(v)); } catch {} },
  };

  // ── 장단 · 권역 데이터 ──────────────────────────────────────────
  // 장구: D 덩 / K 쿵 / T 덕 / t 여린 덕 / g 기덕 / r 더러러러   북: B 센 / b 여린   꽹과리: G 갱 / j 지
  const JD = {
    gut:   { name: '굿거리',   steps: 12, div: 3, bpm: [54, 70],   spd: [0, 38] },
    jajin: { name: '자진모리', steps: 12, div: 3, bpm: [92, 118],  spd: [30, 78] },
    hwi:   { name: '휘모리',   steps: 8,  div: 2, bpm: [132, 150], spd: [70, 100] }, // 100km/h에서 빠르기 상한
  };
  const BASE = {
    gut:   { jg: ['D.gKr.K.gKr.', 'D.gKr.KtgKr.'], kk: 'G.jG.jG.jGj.', bk: 'B..b..B..b..' },
    jajin: { jg: ['D..K..K.TK..', 'D.TK.TK.TK.T'], kk: 'G.jG.jG.jG..', bk: 'B..B..B.bB..' },
    hwi:   { jg: ['D.TTK.T.', 'DTKTK.T.'],         kk: 'G.GjG.Gj',     bk: 'B...B.b.' },
  };
  const REGIONS = {
    udo:   { name: '호남우도', sub: '전라 서부 평야 · 느긋하고 가락이 촘촘한 판', color: '#d9a441', tempo: 0.95, bukGain: 1,
             pat: { gut: { jg: ['D.gKr.K.gKr.', 'DtgKr.KtgKrt'] }, jajin: { kk: 'GjjGjjG.jGj.' } } },
    jwado: { name: '호남좌도', sub: '전라 동부 산간 · 빠르고 쇠가락이 앞서는 판', color: '#4f9d7a', tempo: 1.04, bukGain: 0.9,
             pat: { gut: { kk: 'GjjG.jGjjGj.' }, jajin: { kk: 'G.GGjGG.GGjG' }, hwi: { kk: 'GjGjG.Gj' } } },
    yn:    { name: '영남',     sub: '경상 · 북이 힘 있게 받치는 판', color: '#cf4a34', tempo: 1.0, bukGain: 1.35,
             pat: { gut: { bk: 'B.bB..B.bB..' }, jajin: { bk: 'B.bB.bB.bB..', jg: ['D..K..K.TK..', 'D.KK.TK.TK..'] }, hwi: { bk: 'B.b.B.bb' } } },
    ut:    { name: '웃다리',   sub: '경기 · 충청 · 가볍고 엇박이 살아 있는 판', color: '#3d6fb3', tempo: 1.02, bukGain: 0.9,
             pat: { jajin: { kk: 'G.jGj.GjG.G.' }, hwi: { kk: 'GG.jGjG.' } } },
    yd:    { name: '영동',     sub: '강원 동해안 · 단순하고 곧게 밀고 가는 판', color: '#8a63b8', tempo: 1.06, bukGain: 1.1,
             pat: { gut: { kk: 'G..G..G..G..' }, jajin: { kk: 'G..G.jG..G.j', jg: ['D..K..D..K..', 'D..K..K.TK..'] }, hwi: { kk: 'G...G.G.' } } },
  };
  const pattern = (region, jd) => ({ ...BASE[jd], ...(REGIONS[region].pat[jd] || {}) });
  const INST = { janggu: '#d9553d', buk: '#b9ad98', kk: '#e2b23a', jing: '#4f8fd6' };
  const BANDS = ['jing', 'buk', 'janggu', 'kk']; // 안쪽 → 바깥
  const LEVEL_SECS = 8;      // 시연용: 고른 흐름 8초마다 악기 하나 추가 (실제 앱은 분 단위)
  const INST_BY_LEVEL = ['janggu', 'buk', 'kk', 'jing'];

  // ── 상태 ────────────────────────────────────────────────────────
  const S = {
    gear: 'P', enabled: true, target: 0, speed: 0,
    brakeHeld: false, stopHold: false, hardT: 0, braking: false,
    turn: null, wiper: 0, lights: false, mode: 'normal', cruise: false,
    region: 'udo', pendingRegion: null, level: 1, smooth: 0, brakeTimes: [],
    duckNav: false, duckCall: false, view: 'home',
  };
  let session = null;            // 진행 중인 한 판
  let sched = null;              // 스케줄러 상태
  let vis = [], cycles = [];     // 화면용 이벤트
  let lastRecord = null;

  // ── 자막 ────────────────────────────────────────────────────────
  function caption(tag, text) {
    const c = $('#caption');
    c.innerHTML = `<b>${tag}</b><span>${text}</span>`;
    c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
  }

  // ── 스케줄러 ────────────────────────────────────────────────────
  function pickJangdan(prev) {
    const v = S.speed;
    if (prev === 'gut') return v > 85 ? 'hwi' : v > 38 ? 'jajin' : 'gut';
    if (prev === 'jajin') return v > 78 ? 'hwi' : v < 30 ? 'gut' : 'jajin';
    return v < 30 ? 'gut' : v < 70 ? 'jajin' : 'hwi';
  }
  function startScheduler() {
    if (sched) return;
    sched = { next: A.now() + 0.08, step: 0, cycle: 0, jd: 'gut', cur: null, muteCycle: -1, timer: 0 };
    sched.timer = setInterval(tick, 25);
  }
  function stopScheduler() { if (sched) { clearInterval(sched.timer); sched = null; } }

  function startCycle(t) {
    if (S.pendingRegion) {            // 지역 전환은 한 장단이 끝나는 지점에서
      S.region = S.pendingRegion; S.pendingRegion = null;
      session.regions.push({ id: S.region, t: t - session.t0 });
      caption('Fused Location → 지역 가락', `경계를 넘었습니다 — 장단이 끝나는 지점에서 ${REGIONS[S.region].name} 가락으로 바뀝니다`);
      syncRegionUI();
    }
    const jd = sched.jd = pickJangdan(sched.jd), J = JD[jd], R = REGIONS[S.region];
    const k = (S.speed - J.spd[0]) / (J.spd[1] - J.spd[0]);
    const bpm = lerp(J.bpm[0], J.bpm[1], k) * R.tempo * (S.lights ? 0.92 : 1);
    const p = pattern(S.region, jd);
    const variant = S.cruise ? 0 : (sched.cycle % 4 === 3 ? 1 : 0); // 크루즈 중에는 안정된 반복
    sched.cur = { jd, steps: J.steps, stepDur: 60 / bpm / J.div, jg: p.jg[variant], kk: p.kk, bk: p.bk, capped: jd === 'hwi' && S.speed >= J.spd[1] };
    cycles.push({ t, steps: J.steps, stepDur: sched.cur.stepDur });
    if (cycles.length > 8) cycles.shift();
    session.garak.add(S.region + ':' + jd);
    sched.cycle++;
  }

  function hit(inst, t, vel, pan, step, fn) {
    fn();
    vis.push({ t, inst, vel, pan, step });
    if (session && session.events.length < 30000) session.events.push([t - session.t0, BANDS.indexOf(inst), vel]);
  }

  function tick() {
    if (!sched || !session) return;
    while (sched.next < A.now() + 0.12) {
      if (sched.step === 0) startCycle(sched.next);
      playStep(sched.step, sched.next);
      sched.next += sched.cur.stepDur;
      sched.step = (sched.step + 1) % sched.cur.steps;
    }
  }

  function playStep(i, t0) {
    const c = sched.cur, sd = c.stepDur;
    const t = t0 + (S.cruise ? 0 : (Math.random() - 0.5) * 0.012);
    const eco = S.mode === 'eco', sport = S.mode === 'sport';

    // 정차(신호 대기): 장단이 잦아들고 호흡만 유지
    if (S.speed < 1.5) {
      if (i === 0) hit('janggu', t, 0.3, 0, i, () => A.kung(t, 0.3));
      else if (i === c.steps / 2) hit('janggu', t, 0.16, 0, i, () => A.kung(t, 0.16));
      return;
    }
    const muted = sched.muteCycle === sched.cycle; // 제동 뒤 그 장단은 맺음

    // 장구 — 흐름
    let j = c.jg[i];
    if (eco && (j === 't' || j === 'r')) j = '.';
    if (sport && j === '.') j = 't';
    const J = (v, f) => hit('janggu', t, v, 0, i, f);
    if (j === 'D') J(1, () => { A.kung(t, 1); A.deok(t, 0.9); });
    else if (j === 'K') J(0.8, () => A.kung(t, 0.8));
    else if (j === 'T') J(0.75, () => A.deok(t, 0.8));
    else if (j === 't') J(0.3, () => A.deok(t, 0.3));
    else if (j === 'g') J(0.75, () => { A.deok(t - 0.05, 0.3); A.deok(t, 0.75); });
    else if (j === 'r') J(0.5, () => [0.5, 0.4, 0.3, 0.22].forEach((v, n) => A.deok(t + n * sd * 0.45, v)));

    // 북 — 편성 2단계부터 + 비(와이퍼)
    const bg = REGIONS[S.region].bukGain;
    let b = c.bk[i];
    if (eco && b === 'b') b = '.';
    if (S.level >= 2 && !muted && b !== '.') {
      const v = (b === 'B' ? 0.85 : 0.45) * bg;
      hit('buk', t, Math.min(1, v), 0, i, () => A.buk(t, v));
    } else if (S.wiper) {
      const on = S.wiper === 2 ? i % 2 === 1 : (c.steps === 12 ? i % 3 === 2 : i % 4 === 3);
      if (on) { const v = S.wiper === 2 ? 0.32 : 0.24; hit('buk', t, v, 0, i, () => A.buk(t, v, 0, true)); }
    }

    // 꽹과리 — 방향지시등이 켜진 쪽 스피커 / 편성 3단계부터 가운데
    let k = c.kk[i];
    if (eco && k === 'j') k = '.';
    if (sport && k === '.' && i % 2 === 1) k = 'j';
    const turning = !!S.turn;
    if (k !== '.' && (turning || (S.level >= 3 && !muted))) {
      const pan = S.turn === 'L' ? -0.9 : S.turn === 'R' ? 0.9 : 0;
      const v = (k === 'G' ? 0.9 : 0.45) * (turning ? 1 : 0.8);
      hit('kk', t, v, pan, i, () => A.kk(t, v, pan, k === 'G'));
    }

    // 징 — 합주(4단계)에서는 장단 머리에 여리게
    if (S.level >= 4 && i === 0 && !muted) hit('jing', t, 0.32, 0, i, () => A.jing(t, 0.32));
  }

  // ── 한 판의 시작과 끝 ───────────────────────────────────────────
  function startSession() {
    A.init(); A.setVolume($('#vol').value / 100);
    session = { date: new Date(), t0: A.now(), events: [], regions: [{ id: S.region, t: 0 }], garak: new Set(),
                dist: 0, brakes: 0, hard: 0, maxLevel: 1 };
    S.level = 1; S.smooth = 0; S.brakeTimes = []; vis = []; cycles = [];
    if (S.enabled) startScheduler();
    show('drive');
  }

  function endSession() {
    const ses = session; if (!ses) return;
    const playing = !!sched;
    stopScheduler();
    let wait = 300;
    if (playing) {                    // 맺음 가락
      const t0 = A.now() + 0.1;
      [0, 0.42, 0.78, 1.08, 1.32, 1.5, 1.64, 1.76, 1.86].forEach((o, n) => {
        const t = t0 + o, v = 0.5 + n * 0.05;
        hit('janggu', t, v, 0, 0, () => { A.kung(t, v); A.deok(t, v); });
        hit('buk', t, v, 0, 0, () => A.buk(t, v * 0.8));
        if (n % 2 === 0) hit('kk', t, v, 0, 0, () => A.kk(t, v * 0.8, 0, false));
      });
      const te = t0 + 2.3;
      hit('janggu', te, 1, 0, 0, () => { A.kung(te, 1); A.deok(te, 1); A.buk(te, 1); A.kk(te, 0.9, 0, true); });
      hit('jing', te, 1, 0, 0, () => A.jing(te, 1));
      wait = 3600;
    }
    ses.dur = Math.max(1, A.now() + (playing ? 2.6 : 0) - ses.t0);
    session = null;
    caption('주차 → 맺음 가락', '오늘의 판이 한 장의 장단 그림으로 저장됩니다');
    setTimeout(() => finalize(ses), wait);
  }

  function finalize(ses) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1000;
    drawPicture(cv, ses);
    const img = cv.toDataURL('image/jpeg', 0.88);
    const collected = store.get('collected', []);
    const fresh = [...ses.garak].filter(g => !collected.includes(g));
    store.set('collected', collected.concat(fresh));
    const visited = [...new Set(ses.regions.map(r => r.id))];
    const rec = {
      img, date: ses.date.toISOString(), dist: ses.dist, dur: ses.dur, regions: visited,
      maxLevel: ses.maxLevel, brakes: ses.brakes, hard: ses.hard,
      fresh: fresh.map(g => { const [r, j] = g.split(':'); return `${REGIONS[r].name} ${JD[j].name}`; }),
    };
    const tn = document.createElement('canvas'); tn.width = tn.height = 480;
    tn.getContext('2d').drawImage(cv, 0, 0, 480, 480);
    const recs = store.get('records', []);
    recs.unshift({ ...rec, img: undefined, thumb: tn.toDataURL('image/jpeg', 0.7) });
    store.set('records', recs.slice(0, 5));
    showRecord(rec);
    renderHome();
  }

  function showRecord(rec) {
    lastRecord = rec;
    $('#recImg').src = rec.img || rec.thumb;
    const d = new Date(rec.date);
    $('#recTitle').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일의 판`;
    const m = Math.floor(rec.dur / 60), s = Math.round(rec.dur % 60);
    $('#recStats').innerHTML = [
      ['거리', rec.dist.toFixed(2) + ' km'],
      ['시간', (m ? m + '분 ' : '') + s + '초'],
      ['지나온 권역', rec.regions.map(r => REGIONS[r].name).join(' → ')],
      ['합주', ['장구 독주', '장구·북', '장구·북·꽹과리', '사물 합주'][rec.maxLevel - 1] + ' 까지'],
      ['제동', `${rec.brakes}회` + (rec.hard ? ` (급제동 ${rec.hard}회)` : ' · 급제동 없음')],
    ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    $('#recNew').textContent = rec.fresh && rec.fresh.length ? '새로 모은 가락 — ' + rec.fresh.join(', ') : '';
    show('record');
  }

  // ── 한 판 그림 ──────────────────────────────────────────────────
  function drawPicture(cv, ses) {
    const g = cv.getContext('2d'), W = cv.width, cx = W / 2, R = W / 2;
    g.fillStyle = '#efe7d6'; g.fillRect(0, 0, W, W);
    for (let i = 0; i < 2600; i++) {   // 한지 결
      g.fillStyle = `rgba(120,95,50,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * W, Math.random() * W, 1 + Math.random() * 14, 1);
    }
    const ang = t => -Math.PI / 2 + (t / ses.dur) * Math.PI * 2 * 0.965;
    const band = [[0.24, 0.34], [0.37, 0.5], [0.53, 0.7], [0.73, 0.86]];
    const col = ['#2c5f9e', '#2a2622', '#c8452f', '#c9952b'];
    // 권역 띠
    ses.regions.forEach((r, n) => {
      const a0 = ang(r.t), a1 = ang(n + 1 < ses.regions.length ? ses.regions[n + 1].t : ses.dur);
      g.strokeStyle = REGIONS[r.id].color; g.lineWidth = R * 0.028; g.lineCap = 'butt';
      g.beginPath(); g.arc(cx, cx, R * 0.92, a0 + 0.012, Math.max(a0 + 0.02, a1 - 0.012)); g.stroke();
    });
    g.strokeStyle = 'rgba(60,45,20,.18)'; g.lineWidth = 1;
    band.forEach(b => { g.beginPath(); g.arc(cx, cx, R * b[0], 0, 7); g.stroke(); });
    // 소리 한 점 한 점
    g.lineCap = 'round';
    for (const [t, bi, vel] of ses.events) {
      const a = ang(t), [r0, r1] = band[bi], ca = Math.cos(a), sa = Math.sin(a);
      if (bi === 0) {                  // 징: 번지는 원
        const rr = R * (0.012 + 0.05 * vel), rm = R * (r0 + r1) / 2;
        g.fillStyle = 'rgba(44,95,158,.16)'; g.strokeStyle = col[0]; g.lineWidth = 1.5 + vel * 2.5;
        g.beginPath(); g.arc(cx + ca * rm, cx + sa * rm, rr, 0, 7); g.fill(); g.stroke();
        continue;
      }
      const re = r0 + (r1 - r0) * Math.min(1, 0.25 + vel * 0.75);
      g.strokeStyle = col[bi]; g.globalAlpha = 0.35 + vel * 0.6; g.lineWidth = 1.2 + vel * 2.6;
      g.beginPath(); g.moveTo(cx + ca * R * r0, cx + sa * R * r0); g.lineTo(cx + ca * R * re, cx + sa * R * re); g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#221d16'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `800 ${R * 0.13}px "Nanum Myeongjo","AppleMyungjo","Noto Serif KR",serif`;
    g.fillText('길굿', cx, cx - R * 0.02);
    g.font = `${R * 0.04}px -apple-system,"Apple SD Gothic Neo",sans-serif`; g.fillStyle = '#8a7d66';
    const d = ses.date; g.fillText(`${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`, cx, cx + R * 0.09);
  }

  // ── 주행 중 장단 원 ─────────────────────────────────────────────
  const ring = $('#ring'), rg = ring.getContext('2d');
  function drawRing() {
    const w = ring.clientWidth, h = ring.clientHeight, dpr = window.devicePixelRatio || 1;
    if (ring.width !== Math.round(w * dpr) || ring.height !== Math.round(h * dpr)) { ring.width = w * dpr; ring.height = h * dpr; }
    rg.setTransform(dpr, 0, 0, dpr, 0, 0); rg.clearRect(0, 0, w, h);
    const now = A.now(), cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.46;
    let cyc = null; for (const c of cycles) if (c.t <= now) cyc = c;
    const steps = cyc ? cyc.steps : 12;
    const rad = [0.34, 0.52, 0.72, 0.92];
    rg.lineWidth = 1; rg.strokeStyle = 'rgba(255,255,255,.07)';
    rad.forEach(r => { rg.beginPath(); rg.arc(cx, cy, R * r, 0, 7); rg.stroke(); });
    const sa = s => -Math.PI / 2 + (s / steps) * Math.PI * 2;
    for (let s = 0; s < steps; s++) {
      const a = sa(s); rg.fillStyle = 'rgba(255,255,255,.22)';
      rg.beginPath(); rg.arc(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02, s === 0 ? 3.5 : 1.8, 0, 7); rg.fill();
    }
    if (cyc && sched) {               // 장단의 흐름
      const a = sa(Math.min(steps, (now - cyc.t) / cyc.stepDur));
      rg.strokeStyle = 'rgba(255,255,255,.28)'; rg.lineWidth = 1.5;
      rg.beginPath(); rg.moveTo(cx + Math.cos(a) * R * 0.22, cy + Math.sin(a) * R * 0.22);
      rg.lineTo(cx + Math.cos(a) * R * 1.0, cy + Math.sin(a) * R * 1.0); rg.stroke();
    }
    vis = vis.filter(e => now - e.t < 1.6);
    for (const e of vis) {
      const age = now - e.t; if (age < 0) continue;
      const bi = BANDS.indexOf(e.inst), life = e.inst === 'jing' ? 1.6 : 0.7, k = 1 - age / life;
      if (k <= 0) continue;
      const a = sa(e.step) + (e.pan ? e.pan * 0.05 : 0), r = R * rad[bi];
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      rg.globalAlpha = k * (0.4 + e.vel * 0.6); rg.fillStyle = INST[e.inst];
      rg.beginPath(); rg.arc(x, y, (4 + e.vel * 13) * (1 + (1 - k) * (e.inst === 'jing' ? 2.4 : 0.7)), 0, 7); rg.fill();
      if (e.pan) {                    // 좌·우 스피커 표시
        rg.font = '600 15px sans-serif'; rg.textAlign = 'center';
        rg.fillText(e.pan < 0 ? '◀ L' : 'R ▶', cx + (e.pan < 0 ? -1 : 1) * R * 0.6, cy + R * 1.06);
      }
    }
    rg.globalAlpha = 1;
  }

  // ── 차량 물리 + 부드러운 운전 보상 ──────────────────────────────
  let last = performance.now();
  function frame() {
    const tNow = performance.now();
    const dt = Math.min(0.1, (tNow - last) / 1000); last = tNow;
    if (S.gear === 'D') {
      const hard = S.hardT > 0; if (hard) S.hardT -= dt;
      const braking = hard || S.brakeHeld || S.stopHold;
      if (braking && !S.braking && S.speed > 3) onBrake(hard);
      S.braking = braking;
      if (braking) S.speed = Math.max(0, S.speed - (hard ? 42 : S.brakeHeld ? 18 : 11) * dt);
      else if (S.speed < S.target) S.speed = Math.min(S.target, S.speed + 9 * dt);
      else S.speed = Math.max(S.target, S.speed - 6 * dt);
      if (session) {
        session.dist += S.speed * dt / 3600;
        if (S.speed > 8 && !hard && sched) {
          S.smooth += dt;
          if (S.smooth >= LEVEL_SECS && S.level < 4) {
            S.level++; S.smooth = 0; session.maxLevel = Math.max(session.maxLevel, S.level);
            caption('부드러운 운전 보상', `고른 흐름이 이어져 ${['', '', '북', '꽹과리', '징'][S.level]}이(가) 더해집니다 — 합주 ${S.level}/4`);
          }
        }
      }
    }
    updateUI();
  }
  function paint() { if (S.view === 'drive') drawRing(); requestAnimationFrame(paint); }

  function onBrake(hard) {
    if (!session) return;
    session.brakes++;
    const t = A.now() + 0.02, now = performance.now();
    if (sched) { hit('jing', t, hard ? 1 : 0.6, 0, sched.step, () => A.jing(t, hard ? 1 : 0.6)); sched.muteCycle = sched.cycle; }
    S.brakeTimes = S.brakeTimes.filter(x => now - x < 20000); S.brakeTimes.push(now);
    if (hard) {
      session.hard++; S.level = Math.max(1, S.level - 2); S.smooth = 0;
      caption('Vehicle — Brake (급제동)', '징이 크게 울리고 편성이 줄어듭니다 — 거친 조작에는 소리가 줄어드는 쪽으로만 반응');
    } else if (S.brakeTimes.length >= 3) {
      S.level = Math.max(1, S.level - 1); S.smooth = 0; S.brakeTimes = [];
      caption('Vehicle — Brake (잦은 제동)', '제동이 잦아 악기 하나가 빠집니다');
    } else caption('Vehicle — Brake → 징', '징이 한 번 울리며 장단을 맺습니다');
  }

  // ── 화면 ────────────────────────────────────────────────────────
  function show(v) {
    S.view = v;
    ['home', 'drive', 'record', 'map'].forEach(n => $('#view-' + n).classList.toggle('hidden', n !== v));
    if (v === 'map') renderMap();
  }
  function syncRegionUI() {
    $$('#regions button').forEach(b => {
      b.classList.toggle('on', b.dataset.v === S.region);
      b.classList.toggle('pending', b.dataset.v === S.pendingRegion);
    });
  }
  const ui = {};
  function setText(sel, v) { if (ui[sel] !== v) { ui[sel] = v; $(sel).textContent = v; } }
  function updateUI() {
    setText('#spd', String(Math.round(S.speed)));
    const R = REGIONS[S.region], stopped = S.gear === 'D' && S.speed < 1.5;
    setText('#dRegion', R.name); setText('#dRegionSub', R.sub);
    $('#dRegion').style.color = R.color;
    setText('#dJangdan', !S.enabled ? '쉬는 중' : stopped ? '숨 고르기' : JD[sched ? sched.jd : 'gut'].name);
    $('#dCap').classList.toggle('hidden', !(sched && sched.cur && sched.cur.capped && !stopped));
    $$('#dEns span').forEach((el, n) => el.classList.toggle('on', !!sched && !stopped && (n < S.level || (n === 2 && S.turn))));
    setText('#iviStatus', S.gear === 'P' ? '주차 중' : stopped ? '정차 — 신호 대기' : `주행 중 · ${S.mode === 'eco' ? '에코' : S.mode === 'sport' ? '스포츠' : '노멀'}${S.cruise ? ' · 크루즈' : ''}`);
    const badges = (S.duckNav || S.duckCall ? `<span class="badge duck">${S.duckCall ? '통화 중' : '길 안내 중'} · 음량 낮춤</span>` : '')
      + (S.wiper ? '<span class="badge rain">비</span>' : '') + (S.lights ? '<span class="badge">야간</span>' : '');
    if (ui.badges !== badges) { ui.badges = badges; $('#iviBadges').innerHTML = badges; }
    const d = new Date(); setText('#iviClock', `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
    $('#ivi').classList.toggle('night', S.lights);
    $('#brake').classList.toggle('on', S.brakeHeld); $('#hard').classList.toggle('on', S.hardT > 0);
    $('#stopHold').classList.toggle('on', S.stopHold);
    $('#turnL').classList.toggle('on', S.turn === 'L'); $('#turnR').classList.toggle('on', S.turn === 'R');
    $('#lights').classList.toggle('on', S.lights); $('#cruise').classList.toggle('on', S.cruise);
    $('#call').classList.toggle('on', S.duckCall); $('#nav').classList.toggle('on', S.duckNav);
    $('#btnPower').classList.toggle('off', !S.enabled);
    setText('#powerLabel', S.enabled ? '길굿 켜짐' : '길굿 꺼짐');
    if (+$('#target').value !== S.target) $('#target').value = S.target;
  }
  function seg(id, v) { $$(`#${id} button`).forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); }

  function renderHome() {
    $('#homeCollected').textContent = store.get('collected', []).length;
    const recs = store.get('records', []), box = $('#homeRecords');
    box.innerHTML = recs.length ? '' : '<span class="empty">아직 저장된 판이 없습니다</span>';
    recs.forEach(r => { const im = new Image(); im.src = r.thumb; im.onclick = () => S.gear === 'P' && showRecord(r); box.append(im); });
  }
  const SHAPES = {
    ut: '60,40 170,30 185,120 175,200 70,210 40,130', yd: '170,30 250,20 285,130 250,150 185,120',
    yn: '185,120 250,150 285,130 300,300 240,350 180,330 175,200', udo: '70,210 125,205 120,345 50,360 35,280',
    jwado: '125,205 175,200 180,330 120,345',
  };
  const CENTER = { ut: [112, 125], yd: [228, 85], yn: [235, 240], udo: [80, 280], jwado: [150, 270] };
  function renderMap() {
    const got = store.get('collected', []);
    $('#mapCount').textContent = got.length;
    $('#mapSvg').innerHTML = Object.keys(SHAPES).map(id => {
      const n = got.filter(g => g.startsWith(id + ':')).length, R = REGIONS[id], [x, y] = CENTER[id];
      return `<polygon points="${SHAPES[id]}" fill="${R.color}" fill-opacity="${n ? 0.25 + n * 0.22 : 0.04}" stroke="${n ? R.color : '#4a443a'}" stroke-width="2" stroke-linejoin="round"/>
        <text x="${x}" y="${y}" text-anchor="middle" font-size="15" fill="${n ? '#f1ebdf' : '#6d6558'}" font-family="serif">${R.name}</text>
        <text x="${x}" y="${y + 17}" text-anchor="middle" font-size="11" fill="${n ? '#f1ebdf' : '#6d6558'}">${n}/3</text>`;
    }).join('');
    $('#mapList').innerHTML = Object.keys(REGIONS).map(id =>
      `<li><i style="background:${REGIONS[id].color}"></i>${REGIONS[id].name}<span class="g">${Object.keys(JD).map(j =>
        `<span class="${got.includes(id + ':' + j) ? 'got' : ''}">${JD[j].name}</span>`).join('')}</span></li>`).join('');
  }

  // ── 차량 신호 입력 ──────────────────────────────────────────────
  const act = {
    gear(v) {
      if (v === S.gear) return;
      if (v === 'P') {
        if (S.speed > 3) return caption('기어', '완전히 멈춘 뒤에 P로 바꿀 수 있습니다');
        S.gear = 'P'; S.speed = 0; S.target = 0; S.stopHold = false; S.brakeHeld = false; S.turn = null; seg('gear', 'P');
        endSession();
      } else {
        A.init(); S.gear = 'D'; seg('gear', 'D'); startSession();
        caption('출발', S.enabled ? '한 판이 시작됩니다 — 장구가 흐름을 잡습니다. 가속 슬라이더를 올려 보세요' : '길굿이 꺼져 있습니다 — “길굿 시작”');
      }
    },
    target(v) { S.target = Math.max(0, Math.min(130, v)); if (S.target > 0 && S.stopHold) S.stopHold = false; },
    hard() { if (S.gear === 'D' && S.speed > 10) S.hardT = 1.0; },
    stopHold(on = !S.stopHold) {
      if (S.gear !== 'D') return;
      S.stopHold = on;
      if (on) caption('정차', '신호 대기 — 장단이 잦아들고 호흡만 유지합니다');
      else caption('재출발', '멈췄던 장단이 다시 풀려 나갑니다');
    },
    turn(side) {
      S.turn = S.turn === side ? null : side;
      if (S.turn) caption('Vehicle — TurnSignal → 꽹과리', `꽹과리 가락이 ${side === 'L' ? '왼쪽' : '오른쪽'} 스피커에서 들립니다 (이어폰·스테레오 권장)`);
    },
    wiper(v) { S.wiper = +v; seg('wiper', v); caption('Vehicle — Wiper → 북', S.wiper ? '비 오는 날 — 북이 낮게 깔리며 빗소리처럼 잦아집니다' : '비가 그쳤습니다'); },
    lights(on = !S.lights) { S.lights = on; A.setNight(on); caption('Vehicle — Light → 음색', on ? '야간 — 낮고 느린 음색으로 바뀝니다' : '주간 음색으로 돌아옵니다'); },
    mode(v) { S.mode = v; seg('mode', v); caption('Vehicle — DrivingMode → 편성 밀도', { eco: '에코 — 성긴 편성', normal: '노멀', sport: '스포츠 — 잔가락이 촘촘해집니다' }[v]); },
    cruise(on = !S.cruise) { S.cruise = on; caption('Vehicle — DrivingMode (크루즈)', on ? '크루즈 — 변주 없이 안정된 반복' : '크루즈 해제'); },
    region(id) {
      if (id === S.region) { S.pendingRegion = null; return syncRegionUI(); }
      if (session && sched) { S.pendingRegion = id; caption('Fused Location', `${REGIONS[id].name} 경계 진입 — 지금 장단이 끝나면 바뀝니다`); }
      else { S.region = id; if (session) session.regions.push({ id, t: A.now() - session.t0 }); }
      syncRegionUI();
    },
    nav() {
      if (S.duckNav) return;
      A.init(); S.duckNav = true; A.setDuck(true);
      caption('NaviHelper → 음량 낮춤', '길 안내가 나오면 즉시 음량을 낮춥니다 — 안내와 경고음을 가리지 않는 것이 최우선');
      try { const u = new SpeechSynthesisUtterance('삼백 미터 앞에서 오른쪽 방향입니다'); u.lang = 'ko-KR'; speechSynthesis.speak(u); } catch {}
      setTimeout(() => { S.duckNav = false; if (!S.duckCall) A.setDuck(false); }, 3800);
    },
    call(on = !S.duckCall) { A.init(); S.duckCall = on; A.setDuck(on || S.duckNav); if (on) caption('전화 수신 → 음량 낮춤', '통화 중에는 소리를 낮춥니다'); },
    power(on = !S.enabled) {
      S.enabled = on;
      if (session) { if (on) { A.init(); startScheduler(); } else stopScheduler(); }
      caption(on ? '🎙 “길굿 시작”' : '🎙 “길굿 멈춰”', on ? '길굿이 켜졌습니다' : '길굿을 멈췄습니다 — 화면을 만지지 않고 음성으로 끕니다');
    },
  };

  // ── 자동 시연 ───────────────────────────────────────────────────
  let autoTimers = [];
  const SCRIPT = [
    [0,   () => caption('자동 시연', '주차 상태에서 시작합니다. 운전자는 화면을 만지지 않습니다')],
    [2.5, () => act.power(true)],
    [5,   () => { act.gear('D'); act.target(28); caption('① 출발', '기어 D — 장구가 느린 굿거리로 흐름을 잡습니다'); }],
    [13,  () => act.turn('L')],
    [18,  () => { act.turn('L'); act.target(60); caption('② 가속', '속도가 오르면 자진모리로 — 고른 흐름이 이어지면 악기가 하나씩 더해집니다'); }],
    [31,  () => act.wiper(1)],
    [39,  () => act.region('yn')],
    [48,  () => act.nav()],
    [54,  () => { act.wiper(0); act.hard(); }],
    [62,  () => act.lights(true)],
    [69,  () => act.stopHold(true)],
    [78,  () => { act.stopHold(false); act.target(60); }],
    [82,  () => { act.lights(false); act.mode('sport'); act.target(112); caption('③ 스포츠 모드', '휘모리 — 속도가 더 올라도 빠르기는 상한에서 멈춥니다. 과속은 보상이 아닙니다'); }],
    [98,  () => act.turn('R')],
    [103, () => { act.turn('R'); act.mode('normal'); act.target(30); caption('④ 목적지 접근', '속도를 줄이면 장단도 느려집니다'); }],
    [111, () => act.stopHold(true)],
    [117, () => { act.gear('P'); }],
    [127, () => { caption('길굿', '내 차가 치는 장단, 지역마다 달라지는 길 위의 농악'); stopAuto(); }],
  ];
  function stopAuto() { autoTimers.forEach(clearTimeout); autoTimers = []; $('#auto').classList.remove('on'); $('#auto').textContent = '▶ 자동 시연 (약 2분)'; }
  function startAuto() {
    stopAuto(); A.init();
    if (S.gear === 'D') { S.speed = 0; act.gear('P'); }
    setTimeout(() => {
      S.region = 'udo'; S.pendingRegion = null; syncRegionUI();
      if (S.lights) act.lights(false); act.wiper(0); act.mode('normal'); S.cruise = false; S.turn = null;
      show('home');
      $('#auto').classList.add('on'); $('#auto').textContent = '■ 시연 중지';
      autoTimers = SCRIPT.map(([t, f]) => setTimeout(f, t * 1000));
    }, S.view === 'home' ? 0 : 4200);
  }

  // ── 화면 녹화 (탭 캡처) ─────────────────────────────────────────
  let recorder = null;
  async function toggleRec() {
    if (recorder) { recorder.stop(); return; }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true, preferCurrentTab: true });
      const chunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType }));
        a.download = '길굿_시연.' + (recorder.mimeType.includes('mp4') ? 'mp4' : 'webm'); a.click();
        recorder = null; $('#rec').classList.remove('on'); $('#rec').textContent = '● 화면 녹화';
      };
      stream.getVideoTracks()[0].onended = () => recorder && recorder.stop();
      recorder.start(); $('#rec').classList.add('on'); $('#rec').textContent = '■ 녹화 끝';
      if (!stream.getAudioTracks().length) caption('화면 녹화', '소리가 함께 녹음되지 않습니다 — 공유 창에서 ‘탭 오디오 공유’를 켜 주세요 (Chrome 권장)');
    } catch { caption('화면 녹화', '녹화를 시작하지 못했습니다 — Chrome에서 이 탭을 선택하고 탭 오디오 공유를 켜 주세요'); }
  }

  // ── 이벤트 연결 ─────────────────────────────────────────────────
  $('#regions').innerHTML = Object.keys(REGIONS).map(id => `<button data-v="${id}">${REGIONS[id].name}</button>`).join('');
  $('#regions').onclick = e => e.target.dataset.v && act.region(e.target.dataset.v);
  $('#gear').onclick = e => e.target.dataset.v && act.gear(e.target.dataset.v);
  $('#wiper').onclick = e => e.target.dataset.v && act.wiper(e.target.dataset.v);
  $('#mode').onclick = e => e.target.dataset.v && act.mode(e.target.dataset.v);
  $('#target').oninput = e => act.target(+e.target.value);
  const bk = $('#brake');
  bk.onpointerdown = () => { S.brakeHeld = true; };
  bk.onpointerup = bk.onpointerleave = () => { S.brakeHeld = false; };
  $('#hard').onclick = () => act.hard();
  $('#stopHold').onclick = () => act.stopHold();
  $('#turnL').onclick = () => act.turn('L'); $('#turnR').onclick = () => act.turn('R');
  $('#lights').onclick = () => act.lights(); $('#cruise').onclick = () => act.cruise();
  $('#nav').onclick = () => act.nav(); $('#call').onclick = () => act.call();
  $('#vStart').onclick = () => act.power(true); $('#vStop').onclick = () => act.power(false);
  $('#btnPower').onclick = () => act.power();
  $('#auto').onclick = () => (autoTimers.length ? stopAuto() : startAuto());
  $('#rec').onclick = toggleRec;
  const togglePanel = () => $('#panel').classList.toggle('hide');
  $('#hide').onclick = togglePanel;
  $('#vol').oninput = e => A.setVolume(e.target.value / 100);
  $('#cardMap').onclick = () => show('map');
  $('#mapClose').onclick = () => show(S.gear === 'P' ? 'home' : 'drive');
  $('#recClose').onclick = () => show('home'); $('#recMap').onclick = () => show('map');
  $('#recSave').onclick = () => { if (!lastRecord) return; const a = document.createElement('a'); a.href = lastRecord.img || lastRecord.thumb; a.download = '길굿_한판.jpg'; a.click(); };

  addEventListener('keydown', e => {
    if (e.repeat && e.code !== 'ArrowUp' && e.code !== 'ArrowDown') return;
    if (e.target.tagName === 'INPUT' && e.code.startsWith('Arrow')) return;
    const k = e.code;
    if (k === 'ArrowUp') act.target(S.target + 5); else if (k === 'ArrowDown') act.target(S.target - 5);
    else if (k === 'Space') S.brakeHeld = true;
    else if (k === 'ArrowLeft') act.turn('L'); else if (k === 'ArrowRight') act.turn('R');
    else if (k === 'KeyD') act.gear('D'); else if (k === 'KeyP') act.gear('P');
    else if (k === 'KeyB') act.hard(); else if (k === 'KeyS') act.stopHold();
    else if (k === 'KeyW') act.wiper((S.wiper + 1) % 3); else if (k === 'KeyL') act.lights();
    else if (k === 'KeyN') act.nav(); else if (k === 'KeyC') act.cruise();
    else if (k === 'KeyH') togglePanel(); else return;
    e.preventDefault();
  });
  addEventListener('keyup', e => { if (e.code === 'Space') S.brakeHeld = false; });

  syncRegionUI(); renderHome(); setInterval(frame, 33); requestAnimationFrame(paint);
  window.__gilgut = { S, act, get session() { return session; }, get sched() { return sched; } }; // 디버그용
})();
