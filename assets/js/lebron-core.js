/* Pure geometry and accumulation helpers shared by the figures and data checks. */
(function (root) {
  'use strict';
  function careerPath(player) {
    let pts=0,g=0;
    return [{n:0,pts:0,g:0,year:null}, ...[...player.seasons].sort((a,b)=>a.year-b.year).map((s,i)=>({n:i+1,pts:pts+=s.pts,g:g+=s.g,year:s.year}))];
  }
  // One selection for the linked regular-season figures. Equal selections do
  // not emit again, so local chart controls cannot feed back into one another.
  function createSeasonState(min, max, initial=max) {
    let year=initial;
    const listeners=new Map();
    return {
      get year(){return year;},
      select(value, source){
        if(!Number.isFinite(Number(value)))return false;
        const next=Math.max(min,Math.min(max,Math.round(Number(value))));
        if(next===year)return false;
        year=next;listeners.forEach(listener=>listener(year,source));return true;
      },
      subscribe(key, listener){listeners.set(key,listener);return ()=>listeners.delete(key);}
    };
  }
  function careerAtSeason(player, n) {
    const path=careerPath(player);
    return path[Math.max(0,Math.min(path.length-1,Math.round(n)))];
  }
  function topCareerScorers(players, count=10) {
    return [...players].sort((a,b)=>b.pts-a.pts).slice(0,count);
  }
  function shotMix(season) {
    const counts=[season.zones[0][0],season.zones[1][0],season.zones[2][0],season.zones[3][0]+season.zones[4][0]];
    const located=counts.reduce((sum,n)=>sum+n,0);
    return {located,counts,shares:counts.map(n=>located?n/located:0),relativeTS:100*(season.ts-season.leagueTS)};
  }
  function hexbinShots(rows, radius=13) {
    const bins=new Map(),rt3=Math.sqrt(3);
    rows.forEach((shot,index)=>{
      const x=shot[0]+250,y=422.5-shot[1];
      const fq=(rt3*x/3-y/3)/radius,fr=2*y/(3*radius),fs=-fq-fr;
      let q=Math.round(fq),r=Math.round(fr),s=Math.round(fs);
      const dq=Math.abs(q-fq),dr=Math.abs(r-fr),ds=Math.abs(s-fs);
      if(dq>dr&&dq>ds)q=-r-s;else if(dr>ds)r=-q-s;
      const key=q+','+r;
      if(!bins.has(key))bins.set(key,{key,x:radius*rt3*(q+r/2),y:radius*1.5*r,n:0,made:0,indices:[]});
      const bin=bins.get(key);bin.n++;bin.made+=shot[2];bin.indices.push(index);
    });
    return [...bins.values()].sort((a,b)=>a.y-b.y||a.x-b.x);
  }
  // Area, rather than radius, is proportional to log(1 + attempts).
  const densityRadius=n=>12.2*Math.sqrt(Math.log1p(n)/Math.log1p(1000));
  // Shared frequency scale for the three-season maps. The denominator includes
  // every located attempt, including heaves beyond the half-court viewport.
  const shotShareBreaks=[0.001,0.003,0.01,0.03,0.1];
  function shotShareLevel(attempts, total) {
    const share=total?attempts/total:0;
    return shotShareBreaks.filter(boundary=>share>=boundary).length;
  }
  // Empirical-Bayes FG% delta against rest-of-NBA zone rates (prior k = 6).
  function hexEfficiency(bin, rows, leagueZones) {
    if(!bin||!bin.n)return {fg:0,expected:0,delta:0,shrunk:0};
    const rates=leagueZones.map(([att,made])=>att?made/att:0);
    const expectedMakes=bin.indices.reduce((sum,i)=>sum+(rates[rows[i][9]]||0),0);
    const fg=bin.made/bin.n,expected=expectedMakes/bin.n;
    return {fg,expected,delta:fg-expected,shrunk:(bin.made-expectedMakes)/(bin.n+6)};
  }
  function seriesProgress(games) {
    let wins=0,losses=0,opponent=null;
    return games.map(game=>{
      if(game.opp!==opponent){wins=0;losses=0;opponent=game.opp;}
      const facingElimination=losses===3;
      if(game.win)wins++;else losses++;
      return {wins,losses,facingElimination};
    });
  }
  const api={careerPath,careerAtSeason,topCareerScorers,createSeasonState,shotMix,hexbinShots,densityRadius,shotShareLevel,hexEfficiency,seriesProgress};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LeBronCharts=api;
})(typeof window==='undefined'?globalThis:window);
