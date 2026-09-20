(() => {
  const Re = 6378.137;
  const mu = 398600.4418;
  const omegaE = 7.2921159e-5;

  const $ = (id) => document.getElementById(id);
  const rad = (d) => d * Math.PI / 180;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function vecSub(a,b){ return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
  function dot(a,b){ return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  function norm(a){ return Math.sqrt(dot(a,a)); }

  function rotX(v,a){
    const c=Math.cos(a), s=Math.sin(a);
    return [v[0], c*v[1]-s*v[2], s*v[1]+c*v[2]];
  }

  function rotZ(v,a){
    const c=Math.cos(a), s=Math.sin(a);
    return [c*v[0]-s*v[1], s*v[0]+c*v[1], v[2]];
  }

  function fmtDur(sec){
    if (!Number.isFinite(sec)) return "—";
    if (sec < 60) return `${sec.toFixed(0)} ثانیه`;
    const min = sec/60;
    if (min < 60) return `${min.toFixed(1)} دقیقه`;
    return `${(min/60).toFixed(2)} ساعت`;
  }

  function fmtTime(sec){
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec/3600);
    const m = Math.floor((sec%3600)/60);
    const s = sec%60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function stddev(arr){
    if (!arr.length) return 0;
    const mean = arr.reduce((a,b)=>a+b,0)/arr.length;
    const v = arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/arr.length;
    return Math.sqrt(v);
  }

  function getInputs(){
    const p = {
      lat: Number($("lat").value),
      lon: Number($("lon").value),
      alt: Number($("alt").value),
      inc: Number($("inc").value),
      nSat: Math.round(Number($("nsat").value)),
      planes: Math.round(Number($("planes").value)),
      phaseOffsetDeg: Number($("phaseOffset").value),
      raan0: Number($("raan0").value),
      sweep: Number($("sweep").value),
      hours: Number($("hours").value),
      step: Number($("step").value),
    };

    if (!Object.values(p).every(Number.isFinite)) {
      throw new Error("همه ورودی‌ها باید عددی باشند.");
    }
    if (p.nSat < 1 || p.planes < 1 || p.planes > p.nSat) {
      throw new Error("تعداد صفحات باید بین 1 و تعداد ماهواره‌ها باشد.");
    }
    if (p.alt < 100 || p.alt > 50000) throw new Error("ارتفاع مدار نامعتبر است.");
    if (p.sweep < 0 || p.sweep >= 89) throw new Error("Off-Nadir باید بین 0 و 89 درجه باشد.");
    if (p.step < 1) throw new Error("گام زمانی باید حداقل 1 ثانیه باشد.");
    if (p.hours <= 0) throw new Error("مدت شبیه‌سازی باید مثبت باشد.");
    return p;
  }

  function updateDerived(){
    const n = Math.max(1, Math.round(Number($("nsat").value) || 1));
    const p = Math.max(1, Math.round(Number($("planes").value) || 1));
    $("satPerPlane").textContent = (n/p).toFixed(Number.isInteger(n/p) ? 0 : 2);
    $("raanSpacing").textContent = (360/p).toFixed(2);
  }

  function buildSatellites(p){
    const sats = [];
    const raan0 = rad(p.raan0);
    const inc = rad(p.inc);
    const base = Math.floor(p.nSat / p.planes);
    const rem = p.nSat % p.planes;
    const phaseOffset = rad(p.phaseOffsetDeg);
    let globalId = 1;

    for (let plane=0; plane<p.planes; plane++){
      const count = base + (plane < rem ? 1 : 0);
      if (count <= 0) continue;

      const raan = raan0 + 2*Math.PI*plane/p.planes;
      const planeShift = plane * phaseOffset;

      for (let k=0; k<count; k++){
        const u0 = 2*Math.PI*k/count + planeShift;
        sats.push({
          id: globalId,
          label: `SAT-${String(globalId).padStart(2,"0")}`,
          plane: plane + 1,
          slot: k + 1,
          raan,
          inc,
          u0
        });
        globalId++;
      }
    }
    return sats;
  }

  function simulateWithParams(p){
    const r = Re + p.alt;
    const n = Math.sqrt(mu/(r*r*r));
    const orbitalPeriod = 2*Math.PI/n;

    const lat = rad(p.lat);
    const lon = rad(p.lon);
    const sweep = rad(p.sweep);

    const target0 = [
      Re*Math.cos(lat)*Math.cos(lon),
      Re*Math.cos(lat)*Math.sin(lon),
      Re*Math.sin(lat)
    ];

    const sats = buildSatellites(p);
    const total = p.hours*3600;
    const dt = p.step;

    const samples = [];
    for (let t=0; t<=total; t+=dt){
      const target = rotZ(target0, omegaE*t);
      const visibleSatIds = [];

      for (const sat of sats){
        const u = sat.u0 + n*t;

        let sv = [r*Math.cos(u), r*Math.sin(u), 0];
        sv = rotX(sv, sat.inc);
        sv = rotZ(sv, sat.raan);

        const los = vecSub(target, sv);
        const losN = norm(los);
        const nadir = [-sv[0], -sv[1], -sv[2]];
        const cosOff = clamp(dot(nadir, los)/(r*losN), -1, 1);
        const off = Math.acos(cosOff);

        const aboveHorizon = dot(vecSub(sv, target), target) > 0;
        if (aboveHorizon && off <= sweep){
          visibleSatIds.push(sat.id);
        }
      }

      samples.push({
        t,
        visible: visibleSatIds.length > 0,
        satIds: visibleSatIds
      });
    }

    const windows = [];
    let start = null;
    let activeSatIds = new Set();

    for (let i=0; i<samples.length; i++){
      const cur = samples[i];

      if (cur.visible && start === null){
        start = cur.t;
        activeSatIds = new Set();
      }

      if (cur.visible){
        cur.satIds.forEach(id => activeSatIds.add(id));
      }

      const shouldClose = start !== null && (!cur.visible || i === samples.length-1);
      if (shouldClose){
        const end = cur.visible ? cur.t : Math.max(start, cur.t-dt);
        const satIds = Array.from(activeSatIds).sort((a,b)=>a-b);
        windows.push({
          start,
          end,
          satIds,
          satLabels: satIds.map(id => {
            const sat = sats.find(s => s.id === id);
            return sat ? `${sat.label} (P${sat.plane}-${sat.slot})` : `SAT-${id}`;
          })
        });
        start = null;
        activeSatIds = new Set();
      }
    }

    const gaps = [];
    if (windows.length){
      for (let i=0; i<windows.length-1; i++){
        gaps.push(Math.max(0, windows[i+1].start - windows[i].end));
      }
      gaps.push(Math.max(0, windows[0].start + total - windows[windows.length-1].end));
    }

    const maxGap = gaps.length ? Math.max(...gaps) : total;
    const avgGap = gaps.length ? gaps.reduce((a,b)=>a+b,0)/gaps.length : total;
    const stdGap = gaps.length ? stddev(gaps) : 0;
    const covered = windows.reduce((a,w)=>a+(w.end-w.start),0);

    return {
      windows,
      gaps,
      maxGap,
      avgGap,
      stdGap,
      orbitalPeriod,
      coverage: total > 0 ? covered/total : 0,
      total
    };
  }

  function renderResult(r){
    $("maxRev").textContent = fmtDur(r.maxGap);
    $("avgRev").textContent = fmtDur(r.avgGap);
    $("stdRev").textContent = fmtDur(r.stdGap);
    $("passes").textContent = String(r.windows.length);
    $("period").textContent = `${(r.orbitalPeriod/60).toFixed(2)} دقیقه`;
    $("coverage").textContent = `${(r.coverage*100).toFixed(2)}%`;

    const body = $("passBody");
    body.innerHTML = "";

    r.windows.slice(0,100).forEach((w,i)=>{
      const tr = document.createElement("tr");
      const gap = i < r.windows.length-1
        ? r.windows[i+1].start-w.end
        : r.windows[0].start + r.total - w.end;

      const satText = w.satLabels && w.satLabels.length
        ? w.satLabels.join("، ")
        : "—";

      tr.innerHTML = `
        <td>${i+1}</td>
        <td dir="ltr" class="sat-cell">${satText}</td>
        <td dir="ltr">${fmtTime(w.start)}</td>
        <td dir="ltr">${fmtTime(w.end)}</td>
        <td>${fmtDur(w.end-w.start)}</td>
        <td>${fmtDur(gap)}</td>
      `;
      body.appendChild(tr);
    });
  }

  function runSimulation(){
    try{
      updateDerived();
      const p = getInputs();
      const complexity = (p.hours*3600/p.step)*p.nSat;
      if (complexity > 8e6){
        throw new Error("حجم محاسبه زیاد است؛ گام زمانی را بزرگ‌تر یا مدت شبیه‌سازی را کمتر کنید.");
      }
      const r = simulateWithParams(p);
      renderResult(r);
      window.__lastResult = {p,r};
    }catch(err){
      alert(err.message);
    }
  }

  function divisorPlanes(n){
    const out = [];
    for (let d=1; d<=n; d++){
      if (n%d===0) out.push(d);
    }
    return out;
  }

  function scoreForTarget(r, target){
    if (target === "avg") return r.avgGap;
    if (target === "std") return r.stdGap;
    return r.maxGap;
  }

  async function optimize(){
    const btn = $("optimizeBtn");
    btn.disabled = true;

    try{
      const base = getInputs();
      const target = document.querySelector('input[name="optTarget"]:checked').value;
      const planeMode = $("optPlaneMode").value;
      const phaseStep = Math.max(0.5, Number($("phaseStep").value) || 5);
      const raanStep = Math.max(1, Number($("raanStep").value) || 30);

      const planeList = planeMode === "current" ? [base.planes] : divisorPlanes(base.nSat);

      const combos = [];
      for (const planes of planeList){
        for (let phase=0; phase<360; phase+=phaseStep){
          for (let raan=0; raan<360; raan+=raanStep){
            combos.push({planes, phase, raan});
          }
        }
      }

      if (combos.length > 5000){
        const ok = confirm(`تعداد حالت‌ها ${combos.length} است و ممکن است زمان‌بر باشد. ادامه می‌دهید؟`);
        if (!ok) return;
      }

      let best = null;
      let bestScore = Infinity;

      $("optResult").textContent = "در حال جستجو...";
      $("optStatus").textContent = `Testing 0 / ${combos.length}`;
      $("optProgressBar").style.width = "0%";
      $("optProgressText").textContent = "0%";

      const batchSize = 4;

      for (let i=0; i<combos.length; i++){
        const c = combos[i];
        const p = {...base, planes:c.planes, phaseOffsetDeg:c.phase, raan0:c.raan};
        const r = simulateWithParams(p);
        const score = scoreForTarget(r, target);

        if (score < bestScore){
          bestScore = score;
          best = {config:c, result:r};
        }

        if (i % batchSize === 0 || i === combos.length-1){
          const pct = Math.round((i+1)/combos.length*100);
          $("optProgressBar").style.width = `${pct}%`;
          $("optProgressText").textContent = `${pct}%`;
          $("optStatus").textContent = `Testing ${i+1} / ${combos.length}`;
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      if (!best) throw new Error("نتیجه‌ای پیدا نشد.");

      $("planes").value = best.config.planes;
      $("phaseOffset").value = best.config.phase.toFixed(2);
      $("raan0").value = best.config.raan.toFixed(2);
      updateDerived();
      renderResult(best.result);
      window.__lastResult = {
        p: {...base, planes:best.config.planes, phaseOffsetDeg:best.config.phase, raan0:best.config.raan},
        r: best.result
      };

      $("optStatus").textContent = "Finished";
      $("optResult").textContent =
`Best Configuration

Planes: ${best.config.planes}
Satellites/Plane: ${(base.nSat/best.config.planes).toFixed(2)}
RAAN spacing: ${(360/best.config.planes).toFixed(2)}°
Phase offset between planes: ${best.config.phase.toFixed(2)}°
RAAN start: ${best.config.raan.toFixed(2)}°

Maximum revisit: ${(best.result.maxGap/60).toFixed(2)} min
Average revisit: ${(best.result.avgGap/60).toFixed(2)} min
Uniformity σ: ${(best.result.stdGap/60).toFixed(2)} min`;
    }catch(err){
      $("optStatus").textContent = "Error";
      $("optResult").textContent = err.message;
    }finally{
      btn.disabled = false;
    }
  }

  function exportCSV(){
    if (!window.__lastResult){
      alert("ابتدا محاسبه را اجرا کنید.");
      return;
    }

    const {r} = window.__lastResult;
    const rows = [["Index","Satellite(s)","Start","End","Duration_sec","Gap_to_next_sec"]];

    r.windows.forEach((w,i)=>{
      const gap = i < r.windows.length-1
        ? r.windows[i+1].start-w.end
        : r.windows[0].start+r.total-w.end;

      const satText = (w.satLabels || []).join(" | ");
      rows.push([
        i+1,
        `"${satText.replace(/"/g,'""')}"`,
        fmtTime(w.start),
        fmtTime(w.end),
        (w.end-w.start).toFixed(0),
        gap.toFixed(0)
      ]);
    });

    const csv = rows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "revisit_windows.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function preset(){
    $("lat").value = 35;
    $("lon").value = 51;
    $("alt").value = 550;
    $("inc").value = 97.6;
    $("nsat").value = 32;
    $("planes").value = 8;
    $("phaseOffset").value = 22.5;
    $("raan0").value = 0;
    $("sweep").value = 30;
    $("hours").value = 24;
    $("step").value = 10;
    updateDerived();
    runSimulation();
  }

  ["nsat","planes"].forEach(id => $(id).addEventListener("input", updateDerived));
  $("calcBtn").addEventListener("click", runSimulation);
  $("presetBtn").addEventListener("click", preset);
  $("csvBtn").addEventListener("click", exportCSV);
  $("optimizeBtn").addEventListener("click", optimize);

  updateDerived();
  runSimulation();
})();
