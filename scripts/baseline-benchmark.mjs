import { chromium } from '../.cache/baseline/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';

const url = process.env.BASELINE_URL || 'http://127.0.0.1:4178/scripts/baseline.html';
const runs = Number(process.env.BASELINE_RUNS || 5);
const output = process.env.BASELINE_OUTPUT || '.audit/baseline/browser-benchmark.json';
const expected = {60:[['P',602.9503561860411],['S',1093.648135181093]],150:[['PKIKP',1180.9988664288821]]};
function check(distance,arrivals) {
  assert.equal(arrivals.length,expected[distance].length);
  for (let i=0;i<arrivals.length;i++) {
    assert.equal(arrivals[i].phase,expected[distance][i][0]);
    assert.ok(Math.abs(arrivals[i].time_s-expected[distance][i][1])<1e-7);
    assert.ok(arrivals[i].path.length>100);
    assert.ok(Math.abs(arrivals[i].path.at(-1).distance_deg-distance)<1e-4);
    assert.ok(Math.abs(arrivals[i].path.at(-1).depth_km)<1e-8);
  }
}
const result={claim:'Measure the pinned available ObsPy browser baseline. This does not establish a Rust advantage.',url,runs,host:{cpus:os.cpus().length,model:os.cpus()[0].model,platform:os.platform(),release:os.release(),loadAverage:os.loadavg()},samples:[],errors:[]};
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
result.browser=browser.version();
try {
  for(let i=0;i<runs;i++) {
    const context=await browser.newContext({serviceWorkers:'block'});
    const page=await context.newPage();
    const session=await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled',{cacheDisabled:true});
    const failures=[];
    page.on('pageerror',error=>failures.push(String(error)));
    page.on('response',response=>{if(response.status()>=400) failures.push(response.status()+':'+response.url());});
    page.on('requestfailed',request=>failures.push(request.url()+':'+request.failure()?.errorText));
    const start=performance.now();
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.baseline?.ready || window.baseline?.error,null,{timeout:180000});
    assert.equal(await page.evaluate(()=>window.baseline.error),null);
    const first=await page.evaluate(async()=>{
      const start=performance.now();
      const arrivals=await window.baseline.query(35,60);
      return {elapsedMs:performance.now()-start,arrivals};
    });
    check(60,first.arrivals);
    const coldFirstCorrectMs=performance.now()-start;
    const warm=[];
    const verifiedOutputs={60:first.arrivals};
    for(let j=0;j<10;j++) {
      const distance=j%2?150:60;
      const measured=await page.evaluate(async(distance)=>{
        const start=performance.now();
        const arrivals=await window.baseline.query(35,distance);
        return {elapsedMs:performance.now()-start,arrivals};
      },distance);
      check(distance,measured.arrivals);
      verifiedOutputs[distance]=measured.arrivals;
      warm.push({distance,elapsedMs:measured.elapsedMs,arrivalCount:measured.arrivals.length,pathPoints:measured.arrivals.reduce((n,a)=>n+a.path.length,0)});
    }
    const data=await page.evaluate(()=>({versions:window.baseline.versions,stages:window.baseline.timings,heapBytes:window.baseline.heapBytes(),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,transferSize:r.transferSize,encodedBodySize:r.encodedBodySize,decodedBodySize:r.decodedBodySize,duration:r.duration,responseStatus:r.responseStatus}))}));
    result.samples.push({coldFirstCorrectMs,firstComputeMs:first.elapsedMs,warm,failures,...data});
    result.errors.push(...failures);
    fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
    console.log(JSON.stringify({run:i+1,coldFirstCorrectMs,warmMs:warm.map(x=>x.elapsedMs),heapBytes:data.heapBytes,transferBytes:data.resources.reduce((n,r)=>n+r.transferSize,0),failures}));
    if(i===0) fs.writeFileSync('.audit/baseline/browser-arrivals.json',JSON.stringify(verifiedOutputs,null,2)+'\n');
    await context.close();
  }
} finally {await browser.close();}
