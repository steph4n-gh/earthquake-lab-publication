import { chromium } from '../.cache/baseline/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const page=await browser.newPage();
await page.goto('http://127.0.0.1:4178/scripts/baseline.html');
await page.waitForFunction(()=>window.baseline?.ready,null,{timeout:180000});
const profile=await page.evaluate(async()=>await window.baseline.exec(`import cProfile, pstats, io
profile=cProfile.Profile()
profile.enable()
for _ in range(10):
    _baseline_60 = baseline_query(35,60)
    _baseline_150 = baseline_query(35,150)
profile.disable()
stream=io.StringIO()
pstats.Stats(profile,stream=stream).sort_stats('cumulative').print_stats(30)
json.dumps({'profile':stream.getvalue(),'verifiedArrivalCounts':[len(json.loads(_baseline_60)),len(json.loads(_baseline_150))]})`));
fs.writeFileSync('.audit/baseline/profile.json',JSON.stringify(JSON.parse(profile),null,2)+'\n');
console.log(profile);
await browser.close();
