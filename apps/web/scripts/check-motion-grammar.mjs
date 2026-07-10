#!/usr/bin/env node
/**
 * Motion-grammar guard.
 *
 * "Everything should feel like one application." That is only true if it is checked.
 * These assertions fail if any of the four motion sources drifts back apart:
 *
 *   - the page transition must exist and use --duration-base / --ease-emphasized
 *   - antd drawers/modals must use our duration AND our curve (antd hardcodes
 *     `transition: all .3s ease` on its enter classes; globals.css overrides it)
 *   - the press gesture must be transform-only at --motion-press
 *   - `prefers-reduced-motion` must reach *everything*, including third-party CSS
 *
 * Run against a PRODUCTION build:  node scripts/check-motion-grammar.mjs [--url …]
 */
import { chromium } from 'playwright';
const arg=(n,d)=>{const i=process.argv.indexOf(`--${n}`); return i>-1?process.argv[i+1]:d;};
const BASE=arg('url','http://localhost:3100');

const b=await chromium.launch();
const R=[]; const ok=(n,v,d)=>R.push([n,v,d]);

// normal motion
{
  const p=await b.newPage({viewport:{width:1600,height:1000}});
  await p.goto(`${BASE}/login`,{waitUntil:'networkidle',timeout:120000});
  await p.waitForSelector('#login-email'); await p.fill('#login-email','william.brooks@cytolab.demo');
  await p.fill('#login-password','Verify123!'); await p.getByRole('button',{name:'Sign In'}).click();
  await p.waitForURL('**/dashboard',{timeout:60000});

  // page transition present
  const page = await p.evaluate(()=>{const el=document.querySelector('.helix-page');
    if(!el) return null; const cs=getComputedStyle(el);
    return {name:cs.animationName, dur:cs.animationDuration, tf:cs.animationTimingFunction};});
  ok('page transition mounted (.helix-page)', !!page && page.name==='helix-page-enter', page?`${page.name} ${page.dur} ${page.tf}`:'absent');
  ok('page enter uses --duration-base (200ms)', page?.dur==='0.2s', page?.dur);
  ok('page enter uses --ease-emphasized', page?.tf==='cubic-bezier(0.22, 1, 0.36, 1)', page?.tf);

  // drawer motion now token-driven
  await p.goto(`${BASE}/patients`,{waitUntil:'networkidle'});
  await p.waitForTimeout(1000);
  const add=p.locator('button').filter({hasText:/new patient|add patient/i}).first();
  let drawer=null;
  if(await add.count()){
    await add.click();
    // sample WHILE the enter-active class is applied — the resting wrapper carries neither
    // the curve nor the property list
    for(let i=0;i<40 && !drawer;i++){
      drawer = await p.evaluate(()=>{
        const e=document.querySelector('[class*="panel-motion"][class*="-enter-active"], [class*="panel-motion"][class*="-appear-active"]');
        if(!e) return null; const cs=getComputedStyle(e);
        return {dur:cs.transitionDuration, tf:cs.transitionTimingFunction, prop:cs.transitionProperty};});
      if(!drawer) await p.waitForTimeout(5);
    }
  }
  ok('drawer duration = --duration-slow (0.32s)', drawer?.dur==='0.32s', drawer?.dur ?? 'not sampled');
  ok('drawer easing is the Helix emphasized curve', !!drawer && /0\.22, 1, 0\.36/.test(drawer.tf), drawer?.tf ?? '—');
  ok('drawer animates transform only (never `all`)', drawer?.prop==='transform', drawer?.prop ?? '—');

  // press + lift on primitives
  const press = await p.evaluate(()=>{
    const el=document.createElement('button'); el.className='helix-press'; document.body.appendChild(el);
    const t=getComputedStyle(el).transitionProperty+' '+getComputedStyle(el).transitionDuration; el.remove(); return t;});
  ok('press gesture is transform-only, 80ms', /transform/.test(press) && /0.08s/.test(press), press);
  await p.close();
}

// reduced motion
{
  const ctx=await b.newContext({reducedMotion:'reduce'});
  const p=await ctx.newPage();
  await p.goto(`${BASE}/login`,{waitUntil:'networkidle',timeout:60000});
  const r = await p.evaluate(()=>{
    const el=document.createElement('div'); el.className='helix-page'; document.body.appendChild(el);
    const cs=getComputedStyle(el); const out={dur:cs.animationDuration};
    el.remove();
    const t=document.createElement('div'); t.style.transition='opacity 3s'; document.body.appendChild(t);
    out.trans=getComputedStyle(t).transitionDuration; t.remove();
    return out;});
  ok('reduced motion: page enter ≤1ms', r.dur==='0.001s', r.dur);
  ok('reduced motion: arbitrary transitions ≤1ms (global backstop)', r.trans==='0.001s', r.trans);
  await ctx.close();
}

console.log('\n════ MOTION GRAMMAR VERIFICATION ════');
let f=0; for(const [n,v,d] of R){ if(!v) f++; console.log(`  ${v?'✅':'❌'} ${n.padEnd(48)} ${d}`); }
console.log(f?`\n❌ ${f} failing`:'\n✅ one motion system');
await b.close(); process.exit(f?1:0);
