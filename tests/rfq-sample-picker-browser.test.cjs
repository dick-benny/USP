const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('fs');
const output=require('node:path').join(__dirname,'../test-results');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('dialog',d=>d.accept());
 const state=async()=>{await page.locator('#cloud-save').waitFor({state:'hidden'});return page.evaluate(()=>JSON.parse(JSON.stringify(window.CDPRemote.adapter.state)));};
 const fill=async(form,values)=>{await state();for(const [k,v]of Object.entries(values))await page.locator(`${form} [name="${k}"]`).fill(String(v));};
 const submit=async form=>{await page.locator(form+' button').filter({hasText:/^(Save manufacturer|Save lead|Save article|Save phase|Save BOM|Create RFQ specification|Save response|Save sample|Save \/ update PO reference)$/}).click();await page.waitForFunction(()=>!window.CDPRemote.adapter.busy||window.CDPRemote.adapter.failure);};
 const expand=async locator=>{if(await locator.getAttribute('aria-expanded')!=='true')await locator.click();};
 const tab=async key=>page.locator(`[data-project-tab="${key}"]`).first().click();

 const db=require('./fake-server.cjs')();let signedIn=false;
 await page.route('**/vendor/supabase.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient(){const request=(path,data)=>fetch(path,{method:'POST',body:JSON.stringify(data)}).then(r=>r.json());return {auth:{onAuthStateChange(){},getSession:()=>request('/__test_auth',{action:'session'}),getUser:()=>request('/__test_auth',{action:'user'}),signInWithPassword:()=>request('/__test_auth',{action:'login'}),signOut:()=>request('/__test_auth',{action:'logout'})},rpc:(name,args)=>request('/__test_rpc',{name,args})};}};`}));
 await page.route('**/__test_rpc',async route=>{const {name,args}=route.request().postDataJSON();await route.fulfill({json:await db.rpc(name,args)});});
 await page.route('**/__test_auth',async route=>{const {action}=route.request().postDataJSON();if(action==='login')signedIn=true;if(action==='logout')signedIn=false;const user={id:'test-user',email:'qa@example.test'};await route.fulfill({json:action==='user'?{data:{user:signedIn?user:null}}:{data:{session:signedIn?{user}:null}}});});

 try{
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5188'));await page.locator('#login-form').waitFor({state:'visible'});assert.equal(await page.locator('.app-shell').isVisible(),false);await page.locator('#login-form [name="email"]').fill('qa@example.test');await page.locator('#login-form [name="password"]').fill('test-only');await page.locator('#login-form button').click();await page.waitForFunction(()=>window.CDPApp?.ready);console.log('PASS login gates cloud state and app scripts');




 const pid=await page.evaluate(async()=>{const s=window.CDPRemote.adapter.state,p=window.CDPStructure.createProject(s,{name:'Sample RFQ'});p.qualitySamples=[];s.articles.push({id:'rug',projectId:p.id,name:'Rug',quantity:2,bom:[]});s.manufacturers.push({id:'maker',name:'Maker',active:true});await window.CDPRemote.adapter.save();return p.id;});
 await page.reload();await page.waitForFunction(()=>window.CDPApp?.ready);await page.locator('[data-view=projects]').click();await page.locator('[data-project-id="'+pid+'"]').first().click();await tab('rfqPreliminary');await page.locator('[data-v6-rfq-new]').click();assert.ok((await page.locator('[data-rfq-sample-options]').innerText()).includes('No samples yet'));
 await page.locator('#projectRfqConfig [name=article]').check();await page.locator('#projectRfqConfig [name=manufacturer]').check();await page.locator('[data-rfq-target]').fill('35');
 await page.locator('[data-rfq-new-sample]').click();assert.equal(await page.locator('#qualitySampleForm [name=article]').isChecked(),true);await page.locator('#modal .modal-close').click();assert.equal(await page.locator('[data-rfq-target]').inputValue(),'35');
 for(const size of ['20 x 20 cm','30 x 30 cm']){await page.locator('[data-rfq-new-sample]').click();await fill('#qualitySampleForm',{size,instructions:'Match wool'});await page.locator('#qualitySampleForm button').click();await state();await page.locator('#projectRfqConfig').waitFor();assert.equal(await page.locator('[data-rfq-target]').inputValue(),'35');assert.equal(await page.locator('#projectRfqConfig [name=manufacturer]').isChecked(),true);}
 const samples=(await state()).projects[0].qualitySamples;await page.locator('#projectRfqConfig [name=sample][value="'+samples[0].id+'"]').uncheck();await page.locator('#projectRfqConfig > button').click();await state();let g=(await state()).projects[0].projectRfq;assert.equal(g.type,'preliminary');assert.deepEqual(g.sampleIds,[samples[1].id]);assert.equal(g.lines.filter(l=>l.sample).length,1);assert.equal(g.targetPrices.rug,35);
 await page.locator('[data-project-rfq-send]').click();await state();await page.locator('#modal [data-supplier-preview]').first().click();await page.locator('#supplierPreviewSelect').selectOption('maker');await page.locator('[data-supplier-toggle]').click();assert.ok((await page.locator('.project-rfq-lines').innerText()).includes('Sample'));
 await page.reload();await page.waitForFunction(()=>window.CDPApp?.ready);g=(await state()).projects[0].projectRfq;assert.deepEqual(g.sampleIds,[samples[1].id]);assert.equal(g.lines.find(l=>l.sample).sampleDetails.size,'30 x 30 cm');assert.deepEqual(errors,[]);console.log('PASS preliminary RFQ sample creation, selection, cancellation, draft preservation, publication and reload');
 }catch(e){console.error(e);console.error((await page.locator('body').innerText()).slice(-3000));process.exitCode=1;}finally{await browser.close();}
})();

