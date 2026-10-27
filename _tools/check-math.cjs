/* Verify the shared math contract on every compiled post. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'/Users/teodev/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin=process.env.BLOG_ORIGIN||'http://127.0.0.1:4012';
const site=process.env.BLOG_SITE||'/tmp/blog-math/site';
const chrome=process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(path.join(dir,item.name)):[path.join(dir,item.name)]);}
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:chrome});
  let checked=0,totalMath=0;
  for(const file of files(path.join(site,'2026')).filter(p=>p.endsWith('.html'))){
    const page=await browser.newPage({viewport:{width:390,height:900}});
    const externalMath=[],mathFailures=[];
    page.on('request',r=>{if(/katex|mathjax/i.test(r.url())&&!r.url().startsWith(origin))externalMath.push(r.url());});
    page.on('response',r=>{if(/assets\/(vendor\/katex|css\/math|js\/math)/.test(r.url())&&r.status()>=400)mathFailures.push([r.url(),r.status()]);});
    await page.goto(origin+'/blogs/'+path.relative(site,file),{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.documentElement.dataset.math==='ready');
    await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('.post-content .katex-error').count(),0,file);
    assert.equal(await page.locator('#site-math-core').count(),1);
    assert.deepEqual(externalMath,[],file+' uses the shared local math runtime');
    assert.deepEqual(mathFailures,[],file+' math assets resolve');
    totalMath+=await page.locator('.post-content .katex').count();
    const results=await page.evaluate(async()=>{
      const fixture=document.createElement('div');fixture.id='math-contract-fixture';
      fixture.innerHTML=String.raw`<p>Currency $10 and $20. Inline \(a^2+b^2=c^2\).</p><div class="math-display" data-tex="\begin{aligned}q_c&amp;=\frac{I_c\pi_c}{F}\\F&amp;=\sum_jI_j\pi_j\end{aligned}">fallback</div><pre><code>\(keep_this_code\)</code></pre><span class="no-math">\(leave_this_alone\)</span><script type="math/tex; mode=display">x=\frac{1}{2}</script>`;
      document.querySelector('.post-content').append(fixture);
      BlogMath.render(fixture);const first=fixture.querySelectorAll('.katex').length;
      BlogMath.render(fixture);const second=fixture.querySelectorAll('.katex').length;
      await document.fonts.ready;
      return {first,second,mathml:fixture.querySelectorAll('math').length,
        currency:fixture.querySelector('p').textContent.includes('$10 and $20'),
        code:fixture.querySelector('code').textContent===String.raw`\(keep_this_code\)`,
        ignored:fixture.querySelector('.no-math').textContent===String.raw`\(leave_this_alone\)`,
        errors:fixture.querySelectorAll('.katex-error').length};
    });
    assert.deepEqual(results,{first:3,second:3,mathml:3,currency:true,code:true,ignored:true,errors:0},file);
    checked++;await page.close();
  }
  await browser.close();
  console.log(`${checked} posts passed: one local math runtime, matching assets, accessible MathML, idempotent rendering, preserved currency/code, and zero equation errors (${totalMath} existing expressions).`);
})().catch(error=>{console.error(error);process.exit(1);});
