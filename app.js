(() => {
  "use strict";

  const Re = 6378.137;
  const mu = 398600.4418;
  const omegaE = 7.2921159e-5;
  const $ = id => document.getElementById(id);
  const rad = d => d*Math.PI/180;
  const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const norm = a => Math.sqrt(dot(a,a));
  const sub = (a,b) => [a[0]-b[0],a[1]-b[1],a[2]-b[2]];

  let parsedTles = [];
  let lastResult = null;

  function rotX(v,a){
    const c=Math.cos(a), s=Math.sin(a);
    return [v[0],c*v[1]-s*v[2],s*v[1]+c*v[2]];
  }
  function rotZ(v,a){
    const c=Math.cos(a), s=Math.sin(a);
    return [c*v[0]-s*v[1],s*v[0]+c*v[1],v[2]];
  }

  function fmtDur(sec){
    if (!Number.isFinite(sec)) return "—";
    if (sec < 60) return `${sec.toFixed(0)} ثانیه`;
    const m=sec/60;
    if (m < 60) return `${m.toFixed(1)} دقیقه`;
    return `${(m/60).toFixed(2)} ساعت`;
  }

  function fmtClockFromSec(sec){
    sec=Math.max(0,Math.round(sec));
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  }

  function fmtDate(date){
    if (!(date instanceof Date) || isNaN(date)) return "—";
    return date.toISOString().replace("T"," ").replace(".000Z","Z");
  }

  function median(arr){
    if (!arr.length) return 0;
    const a=[...arr].sort((x,y)=>x-y);
    const m=Math.floor(a.length/2);
    return a.length%2 ? a[m] : (a[m-1]+a[m])/2;
  }

  function stddev(arr){
    if (!arr.length) return 0;
    const mean=arr.reduce((a,b)=>a+b,0)/arr.length;
    return Math.sqrt(arr.reduce((a,b)=>a+(b-mean)*(b-mean),0)/arr.length);
  }

  function currentMode(){
    return document.querySelector('input[name="orbitMode"]:checked').value;
  }

  function setDefaultStartTime(){
    const now=new Date();
    now.setUTCSeconds(0,0);
    const localLike = new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16);
    $("startTime").value = localLike;
  }

  function switchMode(){
    const mode=currentMode();
    $("syntheticPanel").classList.toggle("hidden", mode!=="synthetic");
    $("tlePanel").classList.toggle("hidden", mode!=="tle");
    $("optSyntheticOnly").classList.toggle("hidden", mode!=="synthetic");
    $("tleOptMessage").classList.toggle("hidden", mode!=="tle");
    $("presetBtn").classList.toggle("hidden", mode!=="synthetic");
    $("optProgressText").textContent="0%";
    $("optProgressBar").style.width="0%";
    $("optStatus").textContent="Ready";
  }

  function commonInputs(){
    const p={
      lat:Number($("lat").value),
      lon:Number($("lon").value),
      targetAltM:Number($("targetAlt").value),
      sweep:Number($("sweep").value),
      hours:Number($("hours").value),
      step:Number($("step").value)
    };
    if(!Object.values(p).every(Number.isFinite)) throw new Error("ورودی‌ها باید عددی باشند.");
    if(p.lat < -90 || p.lat > 90) throw new Error("Latitude نامعتبر است.");
    if(p.lon < -180 || p.lon > 180) throw new Error("Longitude نامعتبر است.");
    if(p.sweep < 0 || p.sweep >= 89) throw new Error("Off-Nadir باید بین 0 و 89 درجه باشد.");
    if(p.hours <= 0 || p.hours > 168) throw new Error("مدت شبیه‌سازی باید بین 0 و 168 ساعت باشد.");
    if(p.step < 1 || p.step > 600) throw new Error("گام زمانی باید بین 1 و 600 ثانیه باشد.");
    return p;
  }

  function updateDerived(){
    const n=Math.max(1,Math.round(Number($("nsat").value)||1));
    const p=Math.max(1,Math.round(Number($("planes").value)||1));
    $("satPerPlane").textContent=(n/p).toFixed(Number.isInteger(n/p)?0:2);
    $("raanSpacing").textContent=(360/p).toFixed(2);
  }

  function getSyntheticInputs(){
    const p=commonInputs();
    Object.assign(p,{
      alt:Number($("alt").value),
      inc:Number($("inc").value),
      nSat:Math.round(Number($("nsat").value)),
      planes:Math.round(Number($("planes").value)),
      phaseOffsetDeg:Number($("phaseOffset").value),
      raan0:Number($("raan0").value)
    });
    if(![p.alt,p.inc,p.nSat,p.planes,p.phaseOffsetDeg,p.raan0].every(Number.isFinite))
      throw new Error("ورودی‌های منظومه نامعتبرند.");
    if(p.nSat<1 || p.planes<1 || p.planes>p.nSat) throw new Error("تعداد صفحات نامعتبر است.");
    return p;
  }

  function buildSyntheticSatellites(p){
    const sats=[];
    const base=Math.floor(p.nSat/p.planes), rem=p.nSat%p.planes;
    const raan0=rad(p.raan0), inc=rad(p.inc), phaseOffset=rad(p.phaseOffsetDeg);
    let id=1;
    for(let plane=0; plane<p.planes; plane++){
      const count=base+(plane<rem?1:0);
      const raan=raan0+2*Math.PI*plane/p.planes;
      for(let k=0;k<count;k++){
        sats.push({
          id,
          name:`SAT-${String(id).padStart(2,"0")}`,
          plane:plane+1,
          slot:k+1,
          raan,
          inc,
          u0:2*Math.PI*k/count + plane*phaseOffset
        });
        id++;
      }
    }
    return sats;
  }

  function finalizeWindows(samples,total,dt,timeBaseDate=null){
    const windows=[];
    let start=null;
    let satMap=new Map();
    let best=null;

    for(let i=0;i<samples.length;i++){
      const cur=samples[i];
      if(cur.visible && start===null){
        start=cur.t;
        satMap=new Map();
        best=null;
      }

      if(cur.visible){
        for(const v of cur.visibleSats){
          satMap.set(v.id,v.name);
          if(!best || v.offNadirDeg < best.offNadirDeg){
            best={...v,t:cur.t};
          }
        }
      }

      const close=start!==null && (!cur.visible || i===samples.length-1);
      if(close){
        const end=cur.visible?cur.t:Math.max(start,cur.t-dt);
        const satIds=[...satMap.keys()];
        const satNames=[...satMap.values()];
        windows.push({
          start,end,
          satIds,satNames,
          bestTime:best?best.t:start,
          bestSatellite:best?best.name:(satNames[0]||"—"),
          minOffNadirDeg:best?best.offNadirDeg:NaN,
          timeBaseDate
        });
        start=null; satMap=new Map(); best=null;
      }
    }

    const gaps=[];
    if(windows.length){
      for(let i=0;i<windows.length-1;i++){
        gaps.push(Math.max(0,windows[i+1].start-windows[i].end));
      }
      gaps.push(Math.max(0,windows[0].start+total-windows[windows.length-1].end));
    }

    const unique=new Set();
    windows.forEach(w=>w.satIds.forEach(id=>unique.add(id)));

    return {
      windows,
      gaps,
      maxGap:gaps.length?Math.max(...gaps):total,
      avgGap:gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:total,
      medianGap:gaps.length?median(gaps):total,
      stdGap:gaps.length?stddev(gaps):0,
      satellitesWithAccess:unique.size,
      total
    };
  }

  function simulateSynthetic(p){
    const r=Re+p.alt;
    const n=Math.sqrt(mu/(r*r*r));
    const lat=rad(p.lat), lon=rad(p.lon), sweep=rad(p.sweep);
    const target0=[
      Re*Math.cos(lat)*Math.cos(lon),
      Re*Math.cos(lat)*Math.sin(lon),
      Re*Math.sin(lat)
    ];
    const sats=buildSyntheticSatellites(p);
    const total=p.hours*3600, dt=p.step;
    const samples=[];

    for(let t=0;t<=total;t+=dt){
      const target=rotZ(target0,omegaE*t);
      const visibleSats=[];

      for(const sat of sats){
        const u=sat.u0+n*t;
        let sv=[r*Math.cos(u),r*Math.sin(u),0];
        sv=rotX(sv,sat.inc);
        sv=rotZ(sv,sat.raan);

        const los=sub(target,sv), losN=norm(los), nadir=[-sv[0],-sv[1],-sv[2]];
        const off=Math.acos(clamp(dot(nadir,los)/(r*losN),-1,1));
        const aboveHorizon=dot(sub(sv,target),target)>0;

        if(aboveHorizon && off<=sweep){
          visibleSats.push({id:sat.id,name:`${sat.name} (P${sat.plane}-${sat.slot})`,offNadirDeg:off*180/Math.PI});
        }
      }

      samples.push({t,visible:visibleSats.length>0,visibleSats});
    }

    const result=finalizeWindows(samples,total,dt,null);
    result.orbitalPeriod=2*Math.PI/n;
    return result;
  }

  function parseTleEpoch(line1){
    try{
      const yy=parseInt(line1.substring(18,20),10);
      const day=parseFloat(line1.substring(20,32));
      const year=yy<57?2000+yy:1900+yy;
      const dayInt=Math.floor(day);
      const frac=day-dayInt;
      const start=new Date(Date.UTC(year,0,1,0,0,0,0));
      return new Date(start.getTime()+(dayInt-1+frac)*86400000);
    }catch(e){ return null; }
  }

  function parseTleText(text){
    if(typeof satellite==="undefined") throw new Error("کتابخانه satellite.js لود نشده است.");
    const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const out=[];
    let i=0, auto=1;

    while(i<lines.length){
      let name,line1,line2;

      if(lines[i].startsWith("1 ") && i+1<lines.length && lines[i+1].startsWith("2 ")){
        name=`SAT-${String(auto++).padStart(3,"0")}`;
        line1=lines[i]; line2=lines[i+1]; i+=2;
      }else if(i+2<lines.length && lines[i+1].startsWith("1 ") && lines[i+2].startsWith("2 ")){
        name=lines[i]; line1=lines[i+1]; line2=lines[i+2]; i+=3;
      }else{
        i++;
        continue;
      }

      try{
        const satrec=satellite.twoline2satrec(line1,line2);
        if(!satrec || satrec.error) continue;
        out.push({
          id:out.length+1,
          name,
          line1,line2,
          satrec,
          epoch:parseTleEpoch(line1)
        });
      }catch(e){}
    }
    return out;
  }

  function updateTleStatus(){
    if(!parsedTles.length){
      $("tleStatusBox").textContent="No valid TLE loaded";
      return;
    }
    const epochs=parsedTles.map(x=>x.epoch).filter(x=>x instanceof Date && !isNaN(x));
    const oldest=epochs.length?new Date(Math.min(...epochs.map(x=>x.getTime()))):null;
    const newest=epochs.length?new Date(Math.max(...epochs.map(x=>x.getTime()))):null;
    $("tleStatusBox").textContent =
      `Loaded: ${parsedTles.length}\n`+
      `Oldest epoch: ${oldest?fmtDate(oldest):"—"}\n`+
      `Newest epoch: ${newest?fmtDate(newest):"—"}`;
  }

  function parseTleFromTextarea(){
    parsedTles=parseTleText($("tleText").value);
    updateTleStatus();
    if(!parsedTles.length) throw new Error("هیچ TLE معتبری پیدا نشد.");
    return parsedTles;
  }

  function getStartUtcDate(){
    const v=$("startTime").value;
    if(!v) return new Date();
    // datetime-local is interpreted here as UTC intentionally.
    const d=new Date(v+":00Z");
    if(isNaN(d)) throw new Error("Start Time نامعتبر است.");
    return d;
  }

  function simulateTle(p,tles,startDate){
    if(typeof satellite==="undefined") throw new Error("satellite.js در دسترس نیست.");
    const total=p.hours*3600, dt=p.step, sweep=rad(p.sweep);
    const targetGeo={
      longitude:rad(p.lon),
      latitude:rad(p.lat),
      height:p.targetAltM/1000
    };
    const samples=[];

    const estimatedOps=(total/dt)*tles.length;
    if(estimatedOps>1.2e7) throw new Error("حجم محاسبه زیاد است؛ گام زمانی را بزرگ‌تر یا بازه را کوتاه‌تر کنید.");

    for(let t=0;t<=total;t+=dt){
      const date=new Date(startDate.getTime()+t*1000);
      const gmst=satellite.gstime(date);
      const targetEcf=satellite.geodeticToEcf(targetGeo);
      const visibleSats=[];

      for(const item of tles){
        const pv=satellite.propagate(item.satrec,date);
        if(!pv || !pv.position || !Number.isFinite(pv.position.x)) continue;

        const ecf=satellite.eciToEcf(pv.position,gmst);
        const sv=[ecf.x,ecf.y,ecf.z];
        const target=[targetEcf.x,targetEcf.y,targetEcf.z];

        const los=sub(target,sv), losN=norm(los), sNorm=norm(sv);
        const nadir=[-sv[0],-sv[1],-sv[2]];
        const off=Math.acos(clamp(dot(nadir,los)/(sNorm*losN),-1,1));
        const aboveHorizon=dot(sub(sv,target),target)>0;

        if(aboveHorizon && off<=sweep){
          visibleSats.push({
            id:item.id,
            name:item.name,
            offNadirDeg:off*180/Math.PI
          });
        }
      }

      samples.push({t,visible:visibleSats.length>0,visibleSats});
    }

    return finalizeWindows(samples,total,dt,startDate);
  }

  function renderResult(r){
    $("maxRev").textContent=fmtDur(r.maxGap);
    $("avgRev").textContent=fmtDur(r.avgGap);
    $("medianRev").textContent=fmtDur(r.medianGap);
    $("stdRev").textContent=fmtDur(r.stdGap);
    $("passes").textContent=String(r.windows.length);
    $("satAccessCount").textContent=String(r.satellitesWithAccess);

    const body=$("passBody");
    body.innerHTML="";

    r.windows.slice(0,300).forEach((w,i)=>{
      const gap=i<r.windows.length-1
        ? r.windows[i+1].start-w.end
        : r.windows[0].start+r.total-w.end;

      const dispTime = sec => w.timeBaseDate
        ? fmtDate(new Date(w.timeBaseDate.getTime()+sec*1000))
        : fmtClockFromSec(sec);

      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td>${i+1}</td>
        <td class="sat-cell" dir="ltr">${w.satNames.join("، ") || "—"}</td>
        <td dir="ltr">${dispTime(w.start)}</td>
        <td dir="ltr">${dispTime(w.bestTime)}<br><small>${w.bestSatellite}</small></td>
        <td dir="ltr">${dispTime(w.end)}</td>
        <td>${Number.isFinite(w.minOffNadirDeg)?w.minOffNadirDeg.toFixed(2)+"°":"—"}</td>
        <td>${fmtDur(w.end-w.start)}</td>
        <td>${fmtDur(gap)}</td>`;
      body.appendChild(tr);
    });
  }

  function runSimulation(){
    try{
      const mode=currentMode();
      let r,p;

      if(mode==="synthetic"){
        p=getSyntheticInputs();
        r=simulateSynthetic(p);
      }else{
        p=commonInputs();
        const tles=parseTleFromTextarea();
        const start=getStartUtcDate();
        r=simulateTle(p,tles,start);
      }

      renderResult(r);
      lastResult={mode,p,r};
    }catch(err){
      alert(err.message);
    }
  }

  function divisorPlanes(n){
    const out=[];
    for(let d=1;d<=n;d++) if(n%d===0) out.push(d);
    return out;
  }

  function scoreForTarget(r,target){
    if(target==="avg") return r.avgGap;
    if(target==="std") return r.stdGap;
    return r.maxGap;
  }

  async function optimize(){
    if(currentMode()!=="synthetic") return;

    const btn=$("optimizeBtn");
    btn.disabled=true;
    try{
      const base=getSyntheticInputs();
      const target=document.querySelector('input[name="optTarget"]:checked').value;
      const planeMode=$("optPlaneMode").value;
      const phaseStep=Math.max(.5,Number($("phaseStep").value)||5);
      const raanStep=Math.max(1,Number($("raanStep").value)||30);
      const planeList=planeMode==="current"?[base.planes]:divisorPlanes(base.nSat);
      const combos=[];

      for(const planes of planeList)
        for(let phase=0;phase<360;phase+=phaseStep)
          for(let raan=0;raan<360;raan+=raanStep)
            combos.push({planes,phase,raan});

      if(combos.length>5000 && !confirm(`${combos.length} حالت بررسی خواهد شد. ادامه می‌دهید؟`)) return;

      let best=null,bestScore=Infinity;
      $("optResult").textContent="در حال جستجو...";

      for(let i=0;i<combos.length;i++){
        const c=combos[i];
        const p={...base,planes:c.planes,phaseOffsetDeg:c.phase,raan0:c.raan};
        const r=simulateSynthetic(p);
        const score=scoreForTarget(r,target);

        if(score<bestScore){
          bestScore=score;
          best={config:c,result:r};
        }

        if(i%3===0 || i===combos.length-1){
          const pct=Math.round((i+1)/combos.length*100);
          $("optProgressBar").style.width=`${pct}%`;
          $("optProgressText").textContent=`${pct}%`;
          $("optStatus").textContent=`Testing ${i+1} / ${combos.length}`;
          await new Promise(res=>setTimeout(res,0));
        }
      }

      $("planes").value=best.config.planes;
      $("phaseOffset").value=best.config.phase.toFixed(2);
      $("raan0").value=best.config.raan.toFixed(2);
      updateDerived();
      renderResult(best.result);
      lastResult={mode:"synthetic",p:{...base,planes:best.config.planes,phaseOffsetDeg:best.config.phase,raan0:best.config.raan},r:best.result};

      $("optStatus").textContent="Finished";
      $("optResult").textContent=
`Best Configuration

Planes: ${best.config.planes}
Satellites/Plane: ${(base.nSat/best.config.planes).toFixed(2)}
RAAN spacing: ${(360/best.config.planes).toFixed(2)}°
Phase offset: ${best.config.phase.toFixed(2)}°
RAAN start: ${best.config.raan.toFixed(2)}°

Max revisit: ${(best.result.maxGap/60).toFixed(2)} min
Average revisit: ${(best.result.avgGap/60).toFixed(2)} min
Uniformity σ: ${(best.result.stdGap/60).toFixed(2)} min`;
    }catch(err){
      $("optStatus").textContent="Error";
      $("optResult").textContent=err.message;
    }finally{
      btn.disabled=false;
    }
  }

  function exportCSV(){
    if(!lastResult){
      alert("ابتدا محاسبه را اجرا کنید.");
      return;
    }
    const r=lastResult.r;
    const rows=[["Index","Satellite(s)","Start","Best","BestSatellite","End","MinOffNadir_deg","Duration_sec","Gap_to_next_sec"]];

    r.windows.forEach((w,i)=>{
      const gap=i<r.windows.length-1
        ? r.windows[i+1].start-w.end
        : r.windows[0].start+r.total-w.end;

      const dispTime=sec=>w.timeBaseDate
        ? new Date(w.timeBaseDate.getTime()+sec*1000).toISOString()
        : fmtClockFromSec(sec);

      const satText=w.satNames.join(" | ");
      rows.push([
        i+1,
        `"${satText.replace(/"/g,'""')}"`,
        dispTime(w.start),
        dispTime(w.bestTime),
        `"${String(w.bestSatellite).replace(/"/g,'""')}"`,
        dispTime(w.end),
        Number.isFinite(w.minOffNadirDeg)?w.minOffNadirDeg.toFixed(3):"",
        (w.end-w.start).toFixed(0),
        gap.toFixed(0)
      ]);
    });

    const csv=rows.map(r=>r.join(",")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=currentMode()==="tle"?"tle_revisit_windows.csv":"revisit_windows.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function preset(){
    $("lat").value=35;
    $("lon").value=51;
    $("targetAlt").value=0;
    $("alt").value=550;
    $("inc").value=97.6;
    $("nsat").value=32;
    $("planes").value=8;
    $("phaseOffset").value=22.5;
    $("raan0").value=0;
    $("sweep").value=30;
    $("hours").value=24;
    $("step").value=10;
    updateDerived();
    runSimulation();
  }

  $("tleFile").addEventListener("change", async e=>{
    const file=e.target.files && e.target.files[0];
    if(!file) return;
    $("tleFileName").textContent=file.name;
    $("tleText").value=await file.text();
    try{
      parsedTles=parseTleText($("tleText").value);
      updateTleStatus();
    }catch(err){
      $("tleStatusBox").textContent=err.message;
    }
  });

  $("parseTleBtn").addEventListener("click",()=>{
    try{
      parseTleFromTextarea();
      alert(`${parsedTles.length} TLE معتبر خوانده شد.`);
    }catch(err){ alert(err.message); }
  });

  document.querySelectorAll('input[name="orbitMode"]').forEach(el=>el.addEventListener("change",switchMode));
  ["nsat","planes"].forEach(id=>$(id).addEventListener("input",updateDerived));
  $("calcBtn").addEventListener("click",runSimulation);
  $("presetBtn").addEventListener("click",preset);
  $("csvBtn").addEventListener("click",exportCSV);
  $("optimizeBtn").addEventListener("click",optimize);

  setDefaultStartTime();
  updateDerived();
  switchMode();
  runSimulation();
})();
