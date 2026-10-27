/* One math path for prose, display equations, and dynamic HTML readouts.
   Author Markdown with $$...$$; a separate-line block becomes display math.
   Code, currency, SVG labels, and already-rendered expressions are untouched. */
(function () {
  'use strict';
  const article=document.querySelector('.post-content');
  if(!article||!window.katex||!window.renderMathInElement)return;
  const options={output:'htmlAndMathml',throwOnError:false,trust:false,strict:'warn'};
  const ignored='pre,code,textarea,script,style,svg,.katex,.no-math';
  function render(root=article) {
    if(!root||root.nodeType!==1||root.closest(ignored))return;
    const explicit=[...(root.matches('[data-tex]')?[root]:[]),...root.querySelectorAll('[data-tex]:not([data-math-rendered])')];
    for(const node of explicit) {
      if(node.dataset.mathRendered||node.closest(ignored))continue;
      window.katex.render(node.dataset.tex,node,{...options,displayMode:node.classList.contains('math-display')});
      node.dataset.mathRendered='true';
    }
    // Some Markdown configurations emit math script nodes rather than delimiters.
    for(const script of root.querySelectorAll('script[type^="math/tex"]')) {
      if(script.parentElement.closest('pre,code,.no-math'))continue;
      const block=/mode\s*=\s*display/.test(script.type);
      const node=document.createElement(block?'div':'span');
      node.className=block?'math-display':'math-inline';
      window.katex.render(script.textContent,node,{...options,displayMode:block});
      script.replaceWith(node);
    }
    if(/\\\(|\\\[|\$\$/.test(root.textContent))window.renderMathInElement(root,{
      ...options,
      delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false}],
      ignoredTags:['script','noscript','style','textarea','pre','code','option','svg'],
      ignoredClasses:['katex','no-math']
    });
    for(const block of root.querySelectorAll('.katex-display')) {
      if(block.scrollWidth>block.clientWidth+1){block.tabIndex=0;block.setAttribute('aria-label','Equation; scroll horizontally to read');}
    }
  }
  window.BlogMath={render};
  render();
  const queued=new Set();let frame=0;
  new MutationObserver(records=>{
    for(const record of records)for(const node of record.addedNodes){
      const el=node.nodeType===1?node:node.parentElement;
      if(!el||el.closest(ignored))continue;
      if(el.matches('[data-tex]')||el.querySelector('[data-tex],script[type^="math/tex"]')||/\\\(|\\\[|\$\$/.test(el.textContent))queued.add(el);
    }
    if(queued.size&&!frame)frame=requestAnimationFrame(()=>{frame=0;const batch=[...queued];queued.clear();batch.forEach(render);});
  }).observe(article,{childList:true,subtree:true});
  document.fonts.ready.then(()=>render());
  document.addEventListener('toggle',event=>{if(event.target.matches('details[open]'))render(event.target);},true);
  document.documentElement.dataset.math='ready';
})();
