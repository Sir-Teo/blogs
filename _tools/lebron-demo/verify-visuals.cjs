/* Check the actual browser aggregation helpers against all archived rows. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const {careerPath,careerAtSeason,topCareerScorers,createSeasonState,shotMix,hexbinShots,shotShareLevel,seriesProgress}=require(path.join(root,'assets/js/lebron-core.js'));
const data=path.join(root,'assets/data/lebron');
const overview=JSON.parse(fs.readFileSync(path.join(data,'overview.json')));
let count=0,maxCell=0;
assert.deepEqual(hexbinShots([]),[]);
for(const season of overview.seasons){
  const rows=JSON.parse(fs.readFileSync(path.join(data,`shots-${season.year}-${season.phase}.json`)));
  const bins=hexbinShots(rows);
  const frequency=hexbinShots(rows,20);
  assert.equal(frequency.reduce((sum,b)=>sum+b.n,0),rows.length,'The unified frequency court retains every located attempt');
  assert.equal(frequency.reduce((sum,b)=>sum+b.made,0),season.fg,'The unified frequency court retains every make');
  assert.equal(bins.reduce((sum,b)=>sum+b.n,0),rows.length);
  assert.equal(bins.reduce((sum,b)=>sum+b.made,0),season.fg);
  assert.deepEqual(bins.flatMap(b=>b.indices).sort((a,b)=>a-b),rows.map((_,i)=>i));
  for(const bin of bins){
    assert(bin.n<=1000,'Fixed density scale must include every bin');
    maxCell=Math.max(maxCell,bin.n);
    for(const i of bin.indices){
      const row=rows[i];
      assert(Math.hypot(row[0]+250-bin.x,422.5-row[1]-bin.y)<=13.000001,'Every shot belongs to a nearest hexagon');
    }
  }
  for(let zone=0;zone<5;zone++){
    const selected=hexbinShots(rows.filter(r=>r[9]===zone));
    assert.equal(selected.reduce((sum,b)=>sum+b.n,0),season.zones[zone][0]);
    assert.equal(selected.reduce((sum,b)=>sum+b.made,0),season.zones[zone][1]);
  }
  count+=rows.length;
}
for(const player of overview.players){
  const curve=careerPath(player),last=curve.at(-1);
  assert.equal(last.pts,player.pts);
  assert.equal(last.g,player.g);
  assert.equal(last.n,player.seasons.length);
  assert(curve.every((p,i)=>i===0||p.pts>=curve[i-1].pts));
}
const bron=overview.players.find(p=>p.name==='LeBron James');
const scoringLeaders=topCareerScorers(overview.players);
assert.deepEqual(scoringLeaders.map(p=>p.name),['LeBron James','Kareem Abdul-Jabbar','Karl Malone','Kobe Bryant','Kevin Durant','Michael Jordan','Dirk Nowitzki','Wilt Chamberlain','James Harden',"Shaquille O'Neal"],'The default cohort is the actual top ten by career points');
assert.equal(scoringLeaders[0].pts-scoringLeaders[1].pts,5053);
assert(topCareerScorers([{name:'A',pts:100},{name:'B',pts:200}],1)[0].name==='B');
let missingLocations=0;
for(const season of overview.seasons.filter(s=>s.phase==='rs')){
  const profile=shotMix(season);
  assert.equal(profile.located,season.zones.reduce((sum,z)=>sum+z[0],0));
  assert.equal(profile.counts.reduce((sum,n)=>sum+n,0),profile.located);
  assert(Math.abs(profile.shares.reduce((sum,n)=>sum+n,0)-1)<1e-12,'The four location groups exhaust the located attempts');
  assert(profile.shares.every(share=>share>=0&&share<=1));
  assert(profile.relativeTS>=-5&&profile.relativeTS<=15,'The efficiency timeline includes every season on its fixed scale');
  missingLocations+=season.fga-profile.located;
  assert(season.pts/season.g>=18&&season.pts/season.g<=34,'The role trajectory includes every season on its scoring axis');
  assert(season.ast/season.g>=4&&season.ast/season.g<=12,'The role trajectory includes every season on its passing axis');
}
assert.equal(missingLocations,2,'Unlocated attempts remain excluded from location shares');
const rookieMix=shotMix(overview.seasons.find(s=>s.year===2004&&s.phase==='rs'));
assert.deepEqual(rookieMix.counts,[515,209,551,217]);
assert.equal(shotMix(overview.seasons.find(s=>s.year===2016&&s.phase==='rs')).located,1415);
for(const name of ['Kareem Abdul-Jabbar','Michael Jordan','Kobe Bryant','Tim Duncan','Karl Malone']){
  for(const season of overview.players.find(p=>p.name===name).seasons.filter(s=>s.age>=19&&s.age<=41)){
    assert(season.g>0&&season.g<=82);
    assert(season.pts/season.g<=40,'Peer scoring stays inside the fixed comparison scale');
    assert(season.ast/season.g<=15,'Peer passing stays inside the fixed comparison scale');
    assert(season.trb/season.g<=20,'Peer rebounding stays inside the fixed comparison scale');
  }
}
for(const player of overview.players){
  const seasons=[...player.seasons].sort((a,b)=>a.year-b.year);
  for(let n=1;n<=23;n++){
    const selected=seasons.slice(0,n),point=careerAtSeason(player,n);
    assert.equal(point.n,selected.length);
    assert.equal(point.pts,selected.reduce((sum,s)=>sum+s.pts,0));
    assert.equal(point.year,selected.at(-1).year);
  }
}
assert.equal(careerAtSeason(bron,10).pts,21081);
assert.equal(careerAtSeason(overview.players.find(p=>p.name==='Michael Jordan'),23).n,15,'Retired careers stop at their last played season');
const state=createSeasonState(2004,2026),updates=[];
state.subscribe('chart',year=>{updates.push(year);assert.equal(state.select(year,'chart'),false,'A local control echo cannot trigger another update');});
for(let year=2004;year<=2026;year++)state.select(year,'timeline');
assert.deepEqual(updates,Array.from({length:23},(_,i)=>2004+i));
assert.equal(state.select(2026,'timeline'),false);
assert.equal(state.select(NaN,'timeline'),false);
state.select(1800);assert.equal(state.year,2004);
state.select(2100);assert.equal(state.year,2026);
const replacement=[];
state.subscribe('chart',year=>replacement.push(year));state.select(2013);
assert.deepEqual(replacement,[2013],'Retrying a figure replaces its subscription');
assert.equal(careerPath(bron)[1].pts,1654);
assert.equal(careerPath(bron).at(-1).pts,43440);
const late=bron.seasons.filter(s=>s.age>=35);
assert.deepEqual(late.map(s=>s.age),[35,36,37,38,39,40,41]);
assert.equal(late.reduce((sum,s)=>sum+s.pts,0),10897);
assert.equal(late.reduce((sum,s)=>sum+s.g,0),424);
assert(late.every(s=>s.pts/s.g>=20),'Every season at age 35+ remains above 20 PPG');
assert.equal(Math.round(100*10897/bron.pts),25,'A quarter of career scoring came in age-35+ seasons');
const scatter=overview.players.filter(p=>p.scatter);
assert.equal(scatter.length,94);
assert.deepEqual(scatter.filter(p=>p.pts>=40000&&p.ast>=10000&&p.trb>=10000).map(p=>p.name),['LeBron James']);
const finals=year=>overview.games.filter(g=>g.year===year&&g.phase==='po'&&g.game[7]==='4').sort((a,b)=>a.date.localeCompare(b.date));
const comeback=seriesProgress(finals(2016));
assert.deepEqual(comeback.map(p=>[p.wins,p.losses]),[[0,1],[0,2],[1,2],[1,3],[2,3],[3,3],[4,3]]);
assert.deepEqual(comeback.map(p=>p.facingElimination),[false,false,false,false,true,true,true]);
assert.deepEqual(seriesProgress(finals(2011)).at(-1),{wins:2,losses:4,facingElimination:true});
const run=overview.games.filter(g=>g.year===2016&&g.phase==='po').sort((a,b)=>a.date.localeCompare(b.date));
assert.deepEqual(seriesProgress(run).slice(-7),comeback,'Series records reset with each opponent');
assert.deepEqual(seriesProgress([]),[]);
// A different season's sample size must not change the same shot-share color.
for(const [attempts,total] of [[1,1492],[5,919],[15,1354],[200,1354]]){
  assert.equal(shotShareLevel(attempts,total),shotShareLevel(attempts*3,total*3));
}
assert.equal(shotShareLevel(0,0),0);
assert.equal(shotShareLevel(1,2000),0);
assert.equal(shotShareLevel(10,100),5);
for(const year of [2004,2013,2026]){
  const season=overview.seasons.find(s=>s.year===year&&s.phase==='rs');
  const rows=JSON.parse(fs.readFileSync(path.join(data,`shots-${year}-rs.json`)));
  const bins=hexbinShots(rows,20);
  assert.equal(rows.length,season.fga,'Featured maps have complete locations');
  assert.equal(bins.reduce((sum,b)=>sum+b.n,0),season.fga,'Normalization retains off-court heaves');
  assert.equal(rows.filter(r=>r[3]).length,season.fg3a,'Three-point shares include backcourt attempts');
  assert(Math.abs(bins.reduce((sum,b)=>sum+b.n/rows.length,0)-1)<1e-12);
}
const story=finals(2016);
assert.equal(story.slice(0,4).reduce((sum,g)=>sum+g.pts,0),99);
assert.deepEqual(story.slice(4,6).map(g=>g.pts),[41,41]);
assert.equal(story.slice(4,6).reduce((sum,g)=>sum+g.ast,0),18);
assert.equal(story.slice(4,6).reduce((sum,g)=>sum+g.blk,0),6);
assert.deepEqual(['pts','trb','ast','stl','blk'].map(k=>story[6][k]),[27,11,11,2,3]);
console.log(`PASS: ${count.toLocaleString()} shots assigned exactly once; all makes and zone filters preserved; max cell ${maxCell}/1,000; all 94 career endpoints reconcile.`);
console.log('PASS: Finals records, elimination games, and round resets match the 2016 comeback and 2011 loss.');
console.log('PASS: Unified court frequency scales normalize by all located attempts; guided Finals narrative matches the game logs.');
console.log('PASS: Late-career totals and the unique 40k/10k/10k combination reconcile with the historical seasons.');
console.log('PASS: All 23 shared seasons synchronize without feedback; every career marker uses chronological totals and stops at retirement.');
console.log('PASS: Every shot-mix column sums to 100% of located attempts; role and efficiency scales contain all 23 seasons.');
