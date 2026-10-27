const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let playwright;try{playwright=require('playwright');}catch{playwright=require('/Users/teodev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const url=process.env.BLOG_URL||'http://127.0.0.1:4106/blogs/2026/10/26/turning-millions-of-fare-searches-into-a-pricing-alert.html';
const out=path.join(__dirname,'screenshots');fs.mkdirSync(out,{recursive:true});
const scenes=['collect','commit','compare','product'];
async function geometry(p){
 const bad=await p.evaluate(()=>{
  const errors=[];
  if(document.documentElement.scrollWidth>innerWidth+1)errors.push('Page overflow');
  for(const svg of document.querySelectorAll('figure.fs svg')){
   if(!svg.getClientRects().length)continue;
   const v=svg.viewBox.baseVal,scale=svg.getBoundingClientRect().width/v.width;
   const labels=[...svg.querySelectorAll('text')].map(t=>({label:t.textContent,box:t.getBBox()}));
   if([...svg.querySelectorAll('text')].some(t=>parseFloat(getComputedStyle(t).fontSize)*scale<8.8))errors.push(svg.closest('figure').id+': SVG type too small');
   for(const t of labels){const b=t.box;if(b.x<-.8||b.y<-.8||b.x+b.width>v.width+.8||b.y+b.height>v.height+.8)errors.push(svg.closest('figure').id+': outside SVG '+t.label);}
   for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){
    const a=labels[i].box,b=labels[j].box;
    if(Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)>1)errors.push(svg.closest('figure').id+': overlapping '+labels[i].label+' / '+labels[j].label);
   }
  }
  for(const el of document.querySelectorAll('.fs pre,.fs-table,.fs-flow,.fs-api')){
   const b=el.getBoundingClientRect();
   if(b.left<-.5||b.right>innerWidth+1||el.scrollWidth>el.clientWidth+2)errors.push(el.className+' overflow');
  }
  return errors;
 });assert.deepEqual(bad,[]);
}
(async()=>{
 const chrome='/Users/teodev/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell';
 const browser=await playwright.chromium.launch({headless:true,timeout:60000,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2}),errors=[],density=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
  await p.goto(url);await p.waitForSelector('#fs-product[data-interactive="ready"]');await p.evaluate(()=>document.fonts.ready);
  assert.equal(await p.locator('figure.fs').count(),4);
  assert.equal(await p.locator('.fs-dashboard').count(),2);
  assert((await p.locator('#fs-compare .dash-summary').textContent()).includes('22/40'));
  assert((await p.locator('#fs-product .dash-summary').textContent()).includes('$235'));
  assert((await p.locator('#fs-product .dash-summary').textContent()).includes('$15 lower'));
  assert(!(await p.locator('#fs-product').textContent()).includes('two-pass'));
  assert.equal(await p.locator('#fs-compare button').count(),2);assert.equal(await p.locator('#fs-product button').count(),4);
  assert.equal(await p.locator('figure.fs input,figure.fs select,figure.fs details,.fs-frame,.fs-heading,.fs-metrics,.fs-trail-mount,.fs-extra-controls').count(),0);
  const copy=await p.locator('article').textContent();
  assert(!/PriceEye|ATPCO|AutoScheduler|Common Output|DCO v2|Competitive Position|Pricing Analyst Alerts|Price Outlook|Price Evolution|Assembled Data Feed/.test(copy));
  assert(copy.includes('MIN(total_usd_minor)'));assert(copy.includes('GET /history?route=A-B&departure=2026-11-17'));
  const prose=await p.locator('.post-content > p').allTextContents();
  const words=prose.join(' ').split(/\s+/).length;assert(words<900,words);
  for(const [w,theme] of [[1440,'light'],[1440,'dark'],[900,'light'],[768,'light'],[600,'light'],[390,'light'],[390,'dark'],[320,'light']]){
   await p.setViewportSize({width:w,height:1000});await p.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await geometry(p);
   const heights=await p.locator('figure.fs').evaluateAll(es=>es.map(e=>({step:e.id,height:Math.ceil(e.getBoundingClientRect().height)})));
   density.push({width:w,theme,heights});
   if(w===1440||w===390){
    for(const scene of scenes)await p.locator('#fs-'+scene).screenshot({path:path.join(out,'technical-'+w+'-'+theme+'-'+scene+'.png')});
    if(theme==='light')await p.screenshot({path:path.join(out,'technical-'+w+'-page.png'),fullPage:true,scale:'css'});
   }
  }
  await p.locator('.dash-event').focus();await p.keyboard.press('Enter');
  assert(p.url().endsWith('#fs-product'));
  for(const w of [1440,390,320]){
   await p.setViewportSize({width:w,height:1000});
   for(const policy of ['matched','any']){
    await p.locator(`button[data-policy="${policy}"]`).click();await geometry(p);
    assert((await p.locator('#fs-compare .dash-summary').textContent()).includes(policy==='matched'?'0/40':'22/40'));
    assert((await p.locator('#fs-compare .dash-chart-foot').textContent()).includes(policy==='matched'?'$30 below':'$20 above'));
   }
   for(const mode of ['single','stale','missing','fresh']){
    await p.locator(`button[data-evidence="${mode}"]`).click();await geometry(p);
    const status=await p.locator('#fs-product .dash-status').textContent();
    assert(status.includes(mode==='fresh'?'Confirmed':mode==='single'?'Waiting':'Data issue'));
    assert.equal(await p.locator(`button[data-evidence="${mode}"]`).getAttribute('aria-pressed'),'true');
    if(['stale','missing'].includes(mode))assert((await p.locator('#fs-product .dash-summary').textContent()).includes('Not scored'));
   }
  }
  await p.locator('button[data-evidence="single"]').focus();await p.keyboard.press('Space');
  assert((await p.locator('#fs-product .dash-status').textContent()).includes('Waiting'));
  await p.locator('button[data-evidence="fresh"]').click();
  const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:900}});
  await nojs.goto(url);await nojs.evaluate(()=>document.fonts.ready);await geometry(nojs);
  assert.equal(await nojs.locator('figure.fs').count(),4);assert((await nojs.locator('#fs-product').textContent()).includes('Confirmed price cut'));assert.equal(await nojs.locator('.fs-switch').count(),0);
  const failed=await browser.newPage();await failed.route('**/assets/data/fare-system/workspace.json*',r=>r.abort());await failed.goto(url);assert.equal(await failed.locator('.fs-dashboard').count(),2);assert.equal(await failed.locator('.fs-switch').count(),0);
  await p.setViewportSize({width:1440,height:1000});await p.evaluate(()=>document.documentElement.dataset.theme='light');
  await p.locator('#fs-compare').screenshot({path:path.join(out,'pricing-build-technical.png')});
  await p.locator('#fs-compare').screenshot({path:path.join(out,'pricing-dashboard.png')});
  await p.locator('#fs-product').screenshot({path:path.join(out,'anomaly-review-dashboard.png')});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'density.json'),JSON.stringify({proseWords:words,viewports:density},null,2));
  console.log('Verified pipeline and product dashboard concepts, scoped figures, keyboard drill-down, readable SVGs, responsive geometry, dark mode and no-JavaScript rendering. Prose: '+words+' words.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
