/* Render the actual Jekyll post and exercise its controls at phone/desktop sizes. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let playwright;
try{playwright=require('playwright');}catch{
  const runtime=process.env.CODEX_RUNTIME_NODE_MODULES||'/Users/teodev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
  playwright=require(path.join(runtime,'playwright'));
}
const {chromium}=playwright;
const url=process.env.BLOG_URL||'http://127.0.0.1:4000/blogs/2026/10/26/telling-more-shoppers-from-earlier-shoppers.html';
const screenshots=path.join(__dirname,'screenshots');fs.mkdirSync(screenshots,{recursive:true});
const experiment=require('../../assets/data/two-step/experiment.json');
const ids=['input','naive','knobs','fit','future','information'];
const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function checkBounds(page){
  const problems=await page.evaluate(()=>{
    const bad=[];
    if(document.documentElement.scrollWidth>innerWidth+1)bad.push('Document overflows');
    for(const svg of document.querySelectorAll('figure.ts svg')){
      const v=svg.viewBox.baseVal;
      for(const el of svg.querySelectorAll('text')){
        const b=el.getBBox();
        if(b.x<-.6||b.y<-.6||b.x+b.width>v.width+.6||b.y+b.height>v.height+.6)bad.push(svg.closest('figure').id+': '+el.textContent+' outside viewBox');
      }
      if([...svg.querySelectorAll('*')].some(e=>[...e.attributes].some(a=>a.name!=='href'&&/NaN|Infinity/.test(a.value))))bad.push('Nonfinite geometry');
    }
    for(const c of document.querySelectorAll('.ts-controls,.ts-steps,.ts-legend,.ts-inspector,.ts-subcontrols,.ts-heat-key')){
      const b=c.getBoundingClientRect();if(b.right>innerWidth+.6||b.left<-.6)bad.push('Control overflows');
    }
    return bad;
  });
  assert.deepEqual(problems,[]);
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function range(page,id,value){await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},String(value));await settle(page);}
(async()=>{
  const browser=await chromium.launch({headless:true,...(fs.existsSync(chrome)?{executablePath:chrome}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url);await page.waitForSelector('#ts-information.ready');
  assert.equal(await page.locator('figure.ts.ready').count(),6);
  assert.equal(await page.locator('.ts-error').count(),0);
  const forbidden=/\b(PassengerSim|PaxSim|SciPy|Brent|Poisson|BOS|ORD|GitHub|Teo)\b/i;
  assert(!forbidden.test(await page.locator('body').innerText()),'No identifying names or software in the page');
  assert(!forbidden.test(await page.title()),'Neutral page title');
  assert(!/two[ -]step/i.test(await page.locator('body').innerText()),'The method has no inherited name');
  const prose=await page.locator('.post-content > p,.post-content figcaption').allTextContents();
  assert(!/1,020|1,337|769|317|18\.82|0\.0286|0\.7626/.test(prose.join(' ')),'Narrative and derivations use symbols rather than fixed example results');
  assert.equal(await page.locator('.ts-tag,.ts-subcontrols').count(),0);
  assert.equal(await page.locator('#ts-knobs .ts-stat').count(),2);
  for(const id of ['knobs','information'])assert.equal(await page.locator(`#ts-${id} [data-choice]`).count(),0);

  for(const [theme,w] of [['light',1440],['dark',1440],['light',390],['dark',390],['light',320]]){
    await page.setViewportSize({width:w,height:1000});
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await settle(page);
    await checkBounds(page);
    for(const id of ids)await page.locator('#ts-'+id).screenshot({animations:"disabled",path:path.join(screenshots,`${w}-${theme}-${id}.png`)});
    await page.screenshot({animations:"disabled",path:path.join(screenshots,`${w}-${theme}-page.png`),fullPage:true});
  }
  // The short, visible derivation must fit at the narrowest phone size.
  await page.setViewportSize({width:320,height:900});
  assert.equal(await page.locator('.ts-methods').count(),0,'Long derivation and reproduction appendices have been removed');
  await settle(page);await checkBounds(page);
  const derivations=await page.locator('.katex-display annotation').allTextContents();
  for(const expression of [String.raw`p_c(\theta)`,String.raw`q_c(\theta)`,String.raw`\hat\theta`,String.raw`\widehat R`])
    assert(derivations.some(tex=>tex.includes(expression)),'The timing, fitting, and forecast formulas render: '+expression);
  // Check every mode, including those that alter geometry or units.
  await page.setViewportSize({width:390,height:900});
  for(const id of ['input','knobs','future','information']){
    const choices=await page.locator(`#ts-${id} [data-choice]`).evaluateAll(bs=>bs.map(b=>b.dataset.choice));
    for(const choice of choices){await page.locator(`#ts-${id} [data-choice="${choice}"]`).click();await settle(page);await checkBounds(page);}
  }
  assert.deepEqual(await page.locator('figure.ts').evaluateAll(figs=>figs.map(f=>f.dataset.stage)),['inputs','flat','design','timing','forecast','identification']);
  assert.equal(await page.locator('#ts-fit [data-step]').count(),0,'A later recovery step is not exposed inside the timing view');
  assert(!(await page.locator('#ts-naive').innerText()).includes('Fitted'),'The first model does not reveal the corrected forecast');
  assert(!(await page.locator('#ts-input').innerText()).includes('Fitted'),'Inputs precede fitted parameters');
  assert.equal(await page.locator('.katex-error').count(),0);
  assert(await page.locator('.post-content > p .katex').count()>0,'Prose inline math renders');
  const means=await page.locator('#ts-fit [data-timing-mean]').evaluateAll(ms=>ms.map(m=>Number(m.dataset.position)));
  assert.equal(means.length,2);
  assert(Math.abs(means[0]-means[1])<1e-10,'The fitted and recorded average arrival markers align');
  assert.equal(await page.locator('#ts-future').getAttribute('data-future'),'hidden');
  assert.equal(await page.locator('#ts-future [data-known-future],#ts-future [data-known-remainder]').count(),0,'Make the forecast before revealing the known future');
  await page.locator('#ts-future .ts-reveal').click();
  assert.equal(await page.locator('#ts-future').getAttribute('data-future'),'revealed');
  assert.equal(await page.locator('#ts-future [data-known-future]').count(),1);
  assert.equal(await page.locator('#ts-future [data-known-remainder]').count(),1);
  await checkBounds(page);
  await page.locator('#ts-future').screenshot({animations:'disabled',path:path.join(screenshots,'390-light-future-revealed.png')});
  await page.locator('#ts-future .ts-reveal').focus();await page.keyboard.press('Space');
  assert.equal(await page.locator('#ts-future').getAttribute('data-future'),'hidden','The future can be hidden again with the keyboard');
  for(const zoom of [true,false]){
    await page.locator('#ts-info-zoom').setChecked(zoom);
    for(const progress of [17,72,96]){await range(page,'ts-info-day',progress);await checkBounds(page);}
  }
  await page.selectOption('#ts-forecast-period','7');
  assert((await page.locator('#ts-future .ts-inspector-values').innerText()).includes((experiment.sample.fitted[7]/experiment.baseline.total*100).toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})+'%'));
  await page.locator('#ts-future [data-period="0"]').dispatchEvent('pointerenter');
  assert.equal(await page.locator('#ts-forecast-period').inputValue(),'0');
  for(const value of [60,180])await range(page,'ts-volume',value);
  for(const value of [-.045,.045]){await range(page,'ts-timing',value);await checkBounds(page);}
  for(const value of [4,17,49,72,96]){await range(page,'ts-info-day',value);await checkBounds(page);}
  await page.locator('#ts-info-day').focus();await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('#ts-info-day').inputValue(),'95');
  await page.locator('a.act[data-view="today"]').click();
  assert.equal(await page.locator('#ts-input [data-choice="today"]').getAttribute('aria-pressed'),'true');
  await page.locator('a.act[data-preset="earlier"]').click();
  assert.equal(await page.locator('#ts-volume').inputValue(),'100');
  assert.deepEqual(errors,[]);
  // Save selected alternate states for visual review.
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#ts-fit').screenshot({animations:"disabled",path:path.join(screenshots,'alternate-fit-timing.png')});
  await page.locator('#ts-future .ts-reveal').click();
  await page.locator('#ts-future').screenshot({animations:"disabled",path:path.join(screenshots,'alternate-future-revealed.png')});
  await range(page,'ts-info-day',72);
  await page.locator('#ts-info-zoom').check();
  await page.locator('#ts-information').screenshot({animations:"disabled",path:path.join(screenshots,'alternate-info-22.png')});
  const touch=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const phone=await touch.newPage();await phone.goto(url);await phone.waitForSelector('#ts-information.ready');
  await phone.locator('#ts-future .ts-reveal').tap();
  assert.equal(await phone.locator('#ts-future [data-known-future]').count(),1);
  await phone.locator('#ts-future [data-period="6"]').tap();
  assert.equal(await phone.locator('#ts-forecast-period').inputValue(),'6');
  await phone.locator('#ts-info-zoom').check();
  await checkBounds(phone);
  await phone.locator('#ts-future').screenshot({animations:"disabled",path:path.join(screenshots,'retina-touch-forecast.png')});
  await phone.locator('#ts-information').screenshot({animations:"disabled",path:path.join(screenshots,'retina-touch-likelihood.png')});
  const failed=await browser.newPage();
  await failed.route('**/assets/data/two-step/experiment.json',route=>route.abort());
  await failed.goto(url);await failed.waitForSelector('#ts-information .ts-error');
  assert.equal(await failed.locator('.ts-error').count(),6);
  // Verify that no-script readers still get the entire narrative and captions.
  const plain=await browser.newContext({javaScriptEnabled:false});
  const fallback=await plain.newPage();await fallback.goto(url);
  assert.equal(await fallback.locator('figure.ts figcaption').count(),6);
  assert((await fallback.locator('.post-content').innerText()).includes('average arrival times agree'));
  console.log('Browser checks passed: 6 ordered story stages, story actions, hidden-future reveal, average-time alignment, inline derivation, likelihood zoom, interval inspection, 320/390/1440px, both themes, retina touch, keyboard, prose actions, data failure, no-JS narrative, and neutral identity.');
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
