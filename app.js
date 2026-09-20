(() => {
  const Re = 6378.137;          // km
  const mu = 398600.4418;       // km^3/s^2
  const omegaE = 7.2921159e-5;  // rad/s

  const els = {
    form: document.getElementById('revisitForm'),
    status: document.getElementById('status'),
    maxRevisit: document.getElementById('maxRevisit'),
    avgRevisit: document.getElementById('avgRevisit'),
    accessCount: document.getElementById('accessCount'),
    period: document.getElementById('period'),
    coverage: document.getElementById('coverage'),
    tableBody: document.getElementById('accessTableBody'),
    presetBtn: document.getElementById('presetBtn'),
    exportBtn: document.getElementById('exportBtn'),
  };

  let lastResult = null;

  const rad = d => d * Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const norm = a => Math.sqrt(dot(a,a));
  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];

  function rotZ(v,a){
    const c=Math.cos(a), s=Math.sin(a);
    return [c*v[0]-s*v[1], s*v[0]+c*v[1], v[2]];
  }
  function rotX(v,a){
    const c=Math.cos(a), s=Math.sin(a);
    return [v[0], c*v[1]-s*v[2], s*v[1]+c*v[2]];
  }

  function fmtDuration(s){
    if (!Number.isFinite(s)) return '—';
    if (s < 60) return `${s.toFixed(0)} ثانیه`;
    if (s < 3600) return `${(s/60).toFixed(1)} دقیقه`;
    return `${(s/3600).toFixed(2)} ساعت`;
  }

  function fmtClock(s){
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = s%60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function value(id){ return Number(document.getElementById(id).value); }

  function readInputs(){
    const p = {
      lat: value('lat'), lon: value('lon'), alt: value('alt'), inc: value('inc'),
      nSat: Math.round(value('nSat')), planes: Math.round(value('planes')),
      sweep: value('sweep'), raan0: value('raan0'), phase: value('phase'),
      hours: value('hours'), step: value('step')
    };

    if (!Object.values(p).every(Number.isFinite)) throw new Error('همه ورودی‌ها باید عددی باشند.');
    if (p.lat < -90 || p.lat > 90) throw new Error('عرض جغرافیایی باید بین -90 و 90 درجه باشد.');
    if (p.lon < -180 || p.lon > 180) throw new Error('طول جغرافیایی باید بین -180 و 180 درجه باشد.');
    if (p.nSat < 1 || p.planes < 1 || p.planes > p.nSat) throw new Error('تعداد صفحات باید بین 1 و تعداد ماهواره‌ها باشد.');
    if (p.alt < 100 || p.alt > 50000) throw new Error('ارتفاع مدار خارج از بازه مجاز است.');
    if (p.sweep < 0 || p.sweep >= 89) throw new Error('Off-nadir باید بین 0 و 89 درجه باشد.');
    if (p.step < 1 || p.step > 300) throw new Error('گام زمانی باید بین 1 و 300 ثانیه باشد.');
    if (p.hours < 1 || p.hours > 168) throw new Error('مدت شبیه‌سازی باید بین 1 و 168 ساعت باشد.');

    const work = (p.hours*3600/p.step) * p.nSat;
    if (work > 5e6) throw new Error('حجم شبیه‌سازی زیاد است؛ گام زمانی را بزرگ‌تر کنید یا تعداد ماهواره‌ها/مدت را کاهش دهید.');
    return p;
  }

  function simulate(p){
    const r = Re + p.alt;
    const n = Math.sqrt(mu/(r*r*r));
    const period = 2*Math.PI/n;
    const lat = rad(p.lat), lon = rad(p.lon), inc = rad(p.inc), sweep = rad(p.sweep), raan0 = rad(p.raan0);
    const target0 = [Re*Math.cos(lat)*Math.cos(lon), Re*Math.cos(lat)*Math.sin(lon), Re*Math.sin(lat)];

    const satDefs = [];
    const base = Math.floor(p.nSat/p.planes);
    const rem = p.nSat % p.planes;

    for (let pl=0; pl<p.planes; pl++) {
      const count = base + (pl < rem ? 1 : 0);
      if (!count) continue;
      const raan = raan0 + 2*Math.PI*pl/p.planes;
      for (let k=0; k<count; k++) {
        const phasePlane = 2*Math.PI*p.phase*pl/p.nSat;
        const u0 = 2*Math.PI*k/count + phasePlane;
        satDefs.push({raan, u0});
      }
    }

    const total = p.hours*3600;
    const samples = [];

    for (let t=0; t<=total; t+=p.step) {
      const target = rotZ(target0, omegaE*t);
      let visible = false;

      for (const sat of satDefs) {
        const u = sat.u0 + n*t;
        let pos = [r*Math.cos(u), r*Math.sin(u), 0];
        pos = rotX(pos, inc);
        pos = rotZ(pos, sat.raan);

        const los = sub(target, pos);
        const losN = norm(los);
        const nadir = [-pos[0], -pos[1], -pos[2]];
        const offNadir = Math.acos(clamp(dot(nadir,los)/(r*losN), -1, 1));
        const aboveHorizon = dot(sub(pos,target), target) > 0;

        if (aboveHorizon && offNadir <= sweep) {
          visible = true;
          break;
        }
      }
      samples.push({t, visible});
    }

    const windows = [];
    let start = null;
    for (let i=0; i<samples.length; i++) {
      if (samples[i].visible && start === null) start = samples[i].t;
      const closing = start !== null && (!samples[i].visible || i === samples.length-1);
      if (closing) {
        const end = samples[i].visible ? samples[i].t : Math.max(start, samples[i].t-p.step);
        windows.push([start,end]);
        start = null;
      }
    }

    const gaps = [];
    if (windows.length) {
      for (let i=0; i<windows.length-1; i++) gaps.push(Math.max(0, windows[i+1][0]-windows[i][1]));
      gaps.push(Math.max(0, windows[0][0] + total - windows[windows.length-1][1]));
    }

    const maxGap = gaps.length ? Math.max(...gaps) : total;
    const avgGap = gaps.length ? gaps.reduce((a,b)=>a+b,0)/gaps.length : total;
    const covered = windows.reduce((s,w)=>s + (w[1]-w[0]),0);

    return {params:p, period, windows, gaps, maxGap, avgGap, covered, total};
  }

  function render(result){
    els.maxRevisit.textContent = fmtDuration(result.maxGap);
    els.avgRevisit.textContent = fmtDuration(result.avgGap);
    els.accessCount.textContent = String(result.windows.length);
    els.period.textContent = `${(result.period/60).toFixed(2)} دقیقه`;
    els.coverage.textContent = `پوشش زمانی: ${(100*result.covered/result.total).toFixed(2)}٪`;

    els.tableBody.innerHTML = '';
    result.windows.slice(0,150).forEach((w,i) => {
      const gap = i < result.windows.length-1
        ? result.windows[i+1][0]-w[1]
        : result.windows[0][0] + result.total - w[1];
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i+1}</td>
        <td dir="ltr">${fmtClock(w[0])}</td>
        <td dir="ltr">${fmtClock(w[1])}</td>
        <td>${fmtDuration(w[1]-w[0])}</td>
        <td>${fmtDuration(gap)}</td>`;
      els.tableBody.appendChild(tr);
    });
  }

  function run(){
    try {
      els.status.textContent = 'در حال محاسبه…';
      const result = simulate(readInputs());
      lastResult = result;
      render(result);
      els.status.textContent = 'محاسبه انجام شد. دقت زمانی تقریباً برابر گام زمانی انتخابی است.';
    } catch (err) {
      els.status.textContent = err.message;
    }
  }

  function exportCSV(){
    if (!lastResult) return;
    const rows = [['index','start_s','end_s','duration_s','gap_to_next_s']];
    lastResult.windows.forEach((w,i) => {
      const gap = i < lastResult.windows.length-1
        ? lastResult.windows[i+1][0]-w[1]
        : lastResult.windows[0][0] + lastResult.total - w[1];
      rows.push([i+1, w[0], w[1], w[1]-w[0], gap]);
    });
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'revisit_windows.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  els.form.addEventListener('submit', e => { e.preventDefault(); run(); });
  els.presetBtn.addEventListener('click', () => {
    document.getElementById('lat').value='0';
    document.getElementById('lon').value='0';
    document.getElementById('alt').value='550';
    document.getElementById('inc').value='97.6';
    document.getElementById('nSat').value='12';
    document.getElementById('planes').value='6';
    document.getElementById('sweep').value='30';
    document.getElementById('raan0').value='0';
    document.getElementById('phase').value='1';
    document.getElementById('hours').value='24';
    document.getElementById('step').value='10';
    run();
  });
  els.exportBtn.addEventListener('click', exportCSV);

  run();
})();
