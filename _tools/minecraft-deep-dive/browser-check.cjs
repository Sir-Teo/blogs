'use strict';
const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const out=process.env.MINECRAFT_SCREENSHOTS||'/tmp/minecraft-progressive-qa';
const url=process.env.MINECRAFT_BLOG_URL||'http://127.0.0.1:4173/blogs/2026/10/26/taking-minecraft-apart-one-block-at-a-time.html';
const ids=['mc-grid','mc-palette','mc-density','mc-mesh','mc-player','mc-ticks','mc-light','mc-region','mc-world'];
(async()=>{
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({headless:true}),errors=[],missing=[];
 try{
  for(const width of [1280,390,320]){
   const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'}),page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:4173')&&r.status()>=400)missing.push(r.url());});
   await page.goto(url,{waitUntil:'networkidle'});
   assert.equal(await page.locator('figure.fig').count(),9);assert.equal(await page.locator('.mc-notebook,.mc-methods').count(),0);
   assert.equal(await page.getByRole('heading',{name:'How Minecraft works',exact:true}).count(),1);
   assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).blocks,0);assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).stage,0);
   assert.equal(await page.locator('.mp-hotbar:visible').count(),0,'No tools before they are added');
   for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:`${out}/opening-${width}-${theme}.png`});await page.locator('#mc-grid').screenshot({path:`${out}/empty-${width}-${theme}.png`});}
   await page.evaluate(()=>document.documentElement.dataset.theme='light');
   await page.locator('#mc-palette').getByRole('button',{name:'Write the first block',exact:true}).click();
   assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).blocks,1);assert.equal(await page.evaluate(()=>MinecraftGameplay.world.data[1912]),7);
   await page.locator('#mc-palette').screenshot({path:`${out}/cell-${width}.png`});
   await page.locator('#mc-density').getByRole('button',{name:'Generate the terrain',exact:true}).click();
   const base=await page.evaluate(()=>MinecraftBuild.snapshot());assert.ok(base.blocks>3000);assert.equal(await page.evaluate(()=>MinecraftGameplay.world.get(5,7,7)),0,'No torch until lighting');
   await page.locator('#mc-mesh').getByRole('button',{name:'Build the mesh',exact:true}).click();
   assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).stage,3);
   await page.locator('#mc-player .mp-play').evaluate(n=>n.click());await page.keyboard.press('Escape');
   assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).stage,4);assert.equal(await page.locator('#mc-player .mp-hotbar').isVisible(),false);
   const movement=page.locator('#mc-player .mp-view');await movement.scrollIntoViewIfNeeded();await movement.focus();await page.keyboard.press('Enter');
   await page.keyboard.down('KeyF');await page.waitForTimeout(500);await page.keyboard.up('KeyF');assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).blocks,base.blocks,'Movement stage cannot mine');await page.keyboard.press('Escape');
   await page.locator('#mc-ticks .mp-play').evaluate(n=>n.click());await page.keyboard.press('Escape');
   const mine=page.locator('#mc-ticks .mp-view');await mine.scrollIntoViewIfNeeded();await mine.focus();await page.keyboard.press('Enter');
   await page.keyboard.down('KeyF');await page.waitForTimeout(100);await page.keyboard.up('KeyF');assert.equal(await page.evaluate(()=>MinecraftGameplay.world.get(8,7,7)),7,'Short hold aborts mining');
   await page.keyboard.down('KeyF');await page.waitForFunction(()=>MinecraftGameplay.world.get(8,7,7)===0);await page.keyboard.up('KeyF');await page.keyboard.press('Escape');
   assert.equal((await page.evaluate(()=>MinecraftGameplay.snapshot())).inventory.cobblestone,33);assert.equal(await page.locator('#mc-ticks .mp-hotbar button').count(),2,'Torch is not an early tool');
   assert.equal(await page.evaluate(()=>MinecraftGameplay.world.get(5,7,7)),0);
   await page.locator('#mc-light .mp-play').evaluate(n=>n.click());await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>MinecraftGameplay.world.get(5,7,7)),8);assert.equal((await page.evaluate(()=>MinecraftGameplay.snapshot())).light,9,'Opening the same passage admits light');
   await page.locator('#mc-region').getByRole('button',{name:'Save world',exact:true}).click();assert.match(await page.locator('#mc-region .mb-save-message').innerText(),/Saved in this browser/);
   const saved=await page.evaluate(()=>({cells:Array.from(MinecraftGameplay.world.data),inventory:MinecraftGameplay.snapshot().inventory}));
   await page.locator('#mc-palette').getByRole('button',{name:'Write stone here',exact:true}).click();assert.equal(await page.evaluate(()=>MinecraftGameplay.world.get(8,7,7)),7);
   await page.locator('#mc-region').getByRole('button',{name:'Restore saved world',exact:true}).click();
   assert.deepEqual(await page.evaluate(()=>Array.from(MinecraftGameplay.world.data)),saved.cells);assert.deepEqual((await page.evaluate(()=>MinecraftGameplay.snapshot())).inventory,saved.inventory);
   await page.reload({waitUntil:'networkidle'});assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).blocks,0,'Reload starts the narrative at zero');
   await page.locator('#mc-region').getByRole('button',{name:'Restore saved world',exact:true}).click();assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).stage,7);assert.deepEqual(await page.evaluate(()=>Array.from(MinecraftGameplay.world.data)),saved.cells);
   await page.locator('#mc-world .mp-play').evaluate(n=>n.click());await page.keyboard.press('Escape');assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).stage,8);
   await page.locator('#mc-world').getByRole('button',{name:'Save world',exact:true}).click();
   await page.evaluate(()=>{localStorage.setItem(MinecraftBuildCore.saveKey,'bad data');});
   await page.locator('#mc-world').getByRole('button',{name:'Restore saved world',exact:true}).click();assert.match(await page.locator('#mc-world .mb-save-message').innerText(),/unchanged/);assert.deepEqual(await page.evaluate(()=>Array.from(MinecraftGameplay.world.data)),saved.cells);
   assert.equal(await page.locator('.mp-touch:visible').count(),0,'Touch controls appear during touch play only');
   for(const theme of ['light','dark']){
    await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
    if(width!==320)for(const id of ids)await page.locator('#'+id).screenshot({path:`${out}/${id}-${width}-${theme}.png`});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal overflow');
   }
   await context.close();
  }
  // A reader can skip straight to the finished build; all prerequisites exist.
  const page=await browser.newPage();await page.goto(url);await page.locator('#mc-world .mp-play').evaluate(n=>n.click());await page.keyboard.press('Escape');
  assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).stage,8);assert.ok((await page.evaluate(()=>MinecraftBuild.snapshot())).blocks>3000);assert.equal(await page.evaluate(()=>MinecraftGameplay.world.get(5,7,7)),8);
  const final=page.locator('#mc-world'),canvas=final.locator('.mp-view');await canvas.scrollIntoViewIfNeeded();await canvas.focus();await page.keyboard.press('Enter');await page.keyboard.down('KeyF');await page.waitForFunction(()=>MinecraftGameplay.snapshot().authority.accepted===1);await page.keyboard.up('KeyF');await page.keyboard.press('Escape');
  await final.getByRole('button',{name:'Save world',exact:true}).click();const pose=await page.evaluate(()=>MinecraftGameplay.snapshot().sessions.find(s=>s.id==='mc-world'));
  await final.getByRole('button',{name:'Walk the hillside',exact:true}).click();await final.getByRole('button',{name:'Restore saved world',exact:true}).click();const restored=await page.evaluate(()=>MinecraftGameplay.snapshot().sessions.find(s=>s.id==='mc-world'));assert.deepEqual(restored.player,pose.player);assert.equal(restored.yaw,pose.yaw);assert.equal(restored.surface,false);
  await final.getByRole('button',{name:'Cutaway view',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await final.locator('.mp-play').isVisible(),false);
  await page.locator('#mc-grid').getByRole('button',{name:'Replay from an empty grid',exact:true}).click();assert.equal((await page.evaluate(()=>MinecraftBuild.snapshot())).blocks,0);assert.equal(await page.locator('.mp-hotbar:visible').count(),0);await page.close();
  const fallbackContext=await browser.newContext();await fallbackContext.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type.includes('webgl')?null:original.call(this,type,...args);};});
  const fallback=await fallbackContext.newPage();fallback.on('pageerror',e=>errors.push(e.message));await fallback.goto(url);await fallback.locator('#mc-player .mp-play').evaluate(n=>n.click());assert.equal(await fallback.locator('#mc-player .mp-overview').isVisible(),true);assert.match(await fallback.locator('#mc-player .mp-help').innerText(),/needs WebGL/);assert.equal((await fallback.evaluate(()=>MinecraftBuild.snapshot())).stage,4);await fallbackContext.close();
  assert.deepEqual(errors,[],'No browser exceptions');assert.deepEqual(missing,[],'No missing resources');console.log('PASS: nine cumulative stages, gated features, shared edits, actual browser persistence across reloads, invalid-save safety, skip/replay, light/dark at 1280/390/320, no exceptions or overflow. '+out);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
