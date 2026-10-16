import { chromium } from '../.cache/baseline/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const browser = await chromium.launch({executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true});
const page = await browser.newPage();
const resources=[];
page.on('console',x=>console.log('console',x.type(),x.text().slice(0,1000)));
page.on('pageerror',x=>console.log('pageerror',x.message));
page.on('response',async response=>{
 const request=response.request();
 const sizes=await request.sizes().catch(()=>null);
 resources.push({url:response.url(),status:response.status(),sizes});
});
const start=performance.now();
await page.goto('https://mmesch.com/pyjs-obspy/',{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForFunction(()=>typeof PyEnv!=='undefined' && (PyEnv.ready || document.querySelector('#loadingText')?.textContent.startsWith('Error')),{timeout:180000});
console.log('status',await page.locator('#loadingText').textContent());
console.log('ready ms',performance.now()-start);
if(await page.evaluate(()=>PyEnv.ready)) {
 const result=await page.evaluate(async()=>await PyEnv.asyncEval(`import obspy,sys,json\nfrom obspy.taup import TauPyModel\nm=TauPyModel('iasp91')\njson.dumps({'obspy':obspy.__version__,'python':sys.version,'platform':sys.platform,'queries':[{ 'depth':35,'distance':d,'arrivals':[{'name':a.name,'time':a.time,'ray_param':a.ray_param,'path_points':len(a.path)} for a in m.get_ray_paths(35,d,phase_list=['P','S','PKP'])]} for d in [60,150]]})`));
 console.log('RESULT',result);
 fs.writeFileSync('.audit/baseline/initial-browser-result.json',JSON.stringify({elapsed:performance.now()-start,result:JSON.parse(result),resources},null,2));
} else fs.writeFileSync('.audit/baseline/initial-browser-failure.json',JSON.stringify({elapsed:performance.now()-start,resources},null,2));
await browser.close();
