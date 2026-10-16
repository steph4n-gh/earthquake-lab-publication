import { chromium } from '../.cache/baseline/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const nativeCode=`import json,obspy
from obspy.taup import TauPyModel
import numpy as np
m=TauPyModel('iasp91')
print(json.dumps({'version':obspy.__version__,'queries':{str(d):[{'phase':a.name,'time_s':float(a.time),'ray_param_s_per_rad':float(a.ray_param),'path':[{'time_s':float(p['time']),'distance_deg':float(np.degrees(p['dist'])),'depth_km':float(p['depth'])} for p in a.path]} for a in m.get_ray_paths(35,d,phase_list=['P','S','PKIKP'])] for d in [60,150]}}))`;
const native=spawnSync('.venv/bin/python',['-c',nativeCode],{encoding:'utf8'});
assert.equal(native.status,0,native.stderr);
const reference=JSON.parse(native.stdout);
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage();
await page.goto('http://127.0.0.1:4178/scripts/baseline.html');
await page.waitForFunction(()=>window.baseline?.ready,null,{timeout:180000});
const queries=await page.evaluate(async()=>{const out={};for(const distance of [60,150]) out[distance]=await window.baseline.query(35,distance);return out;});
const maxError={arrival_time_s:0,ray_param_s_per_rad:0,path_time_s:0,path_distance_deg:0,path_depth_km:0};
let points=0;
for(const d of [60,150]) {
 assert.equal(queries[d].length,reference.queries[d].length);
 for(let i=0;i<queries[d].length;i++) {
  const a=queries[d][i],b=reference.queries[d][i];
  assert.equal(a.phase,b.phase);
  assert.equal(a.path.length,b.path.length);
  maxError.arrival_time_s=Math.max(maxError.arrival_time_s,Math.abs(a.time_s-b.time_s));
  maxError.ray_param_s_per_rad=Math.max(maxError.ray_param_s_per_rad,Math.abs(a.ray_param_s_per_rad-b.ray_param_s_per_rad));
  a.path.forEach((p,j)=>{
    points++;
    maxError.path_time_s=Math.max(maxError.path_time_s,Math.abs(p.time_s-b.path[j].time_s));
    maxError.path_distance_deg=Math.max(maxError.path_distance_deg,Math.abs(p.distance_deg-b.path[j].distance_deg));
    maxError.path_depth_km=Math.max(maxError.path_depth_km,Math.abs(p.depth_km-b.path[j].depth_km));
  });
 }
}
for(const value of Object.values(maxError)) assert.ok(value<1e-7,JSON.stringify(maxError));
fs.writeFileSync('.audit/baseline/browser-arrivals.json',JSON.stringify(queries,null,2)+'\n');
const report={nativeVersion:reference.version,browserVersions:await page.evaluate(()=>window.baseline.versions),queryCount:2,arrivalCount:3,pathPoints:points,maxAbsoluteError:maxError,interpretation:'Implementation parity for two IASP91 queries. This is not independent scientific validation.'};
fs.writeFileSync('.audit/baseline/numerical-parity.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
await browser.close();
