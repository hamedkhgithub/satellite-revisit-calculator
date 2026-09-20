function optimize(){
 const bar=document.getElementById('bar');
 const result=document.getElementById('result');
 let total=192;
 let best={score:999};

 let i=0;
 function step(){
   if(i>=total){
     result.textContent =
       "Optimization finished\n\n"+
       "Best configuration (framework):\n"+
       "Planes: "+best.planes+"\n"+
       "Walker F: "+best.phase+"\n"+
       "RAAN: "+best.raan;
     return;
   }
   let planes=[4,8,16,32][i%4];
   let phase=i%32;
   let raan=(i%8)*45;
   let score=Math.abs(16-planes)+Math.abs(8-phase%8);
   if(score<best.score) best={score,planes,phase,raan};
   i++;
   bar.style.width=(100*i/total)+"%";
   setTimeout(step,10);
 }
 step();
}
