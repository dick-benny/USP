const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('fs');
const output=require('node:path').join(__dirname,'../test-results');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));page.on('dialog',d=>d.accept());
 const state=async()=>{await page.locator('#cloud-save').waitFor({state:'hidden'});return page.evaluate(()=>JSON.parse(JSON.stringify(window.CDPRemote.adapter.state)));};
 const fill=async(form,values)=>{await state();for(const [k,v]of Object.entries(values))await page.locator(`${form} [name="${k}"]`).fill(String(v));};
 const submit=async form=>{await page.locator(form+' button').filter({hasText:/^(Save manufacturer|Save lead|Save article|Save phase|Save BOM|Create RFQ specification|Save response|Save sample|Save \/ update PO reference)$/}).click();await page.waitForFunction(()=>!window.CDPRemote.adapter.busy||window.CDPRemote.adapter.failure);};
 const tab=async key=>page.locator(`[data-project-tab="${key}"]`).first().click();

 const db=require('./fake-server.cjs')();let signedIn=false;
 await page.route('**/vendor/supabase.js*',route=>route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient(){const request=(path,data)=>fetch(path,{method:'POST',body:JSON.stringify(data)}).then(r=>r.json());return {auth:{onAuthStateChange(){},getSession:()=>request('/__test_auth',{action:'session'}),getUser:()=>request('/__test_auth',{action:'user'}),signInWithPassword:()=>request('/__test_auth',{action:'login'}),signOut:()=>request('/__test_auth',{action:'logout'})},rpc:(name,args)=>request('/__test_rpc',{name,args})};}};`}));
 await page.route('**/__test_rpc',async route=>{const {name,args}=route.request().postDataJSON();await route.fulfill({json:await db.rpc(name,args)});});
 await page.route('**/__test_auth',async route=>{const {action}=route.request().postDataJSON();if(action==='login')signedIn=true;if(action==='logout')signedIn=false;const user={id:'test-user',email:'qa@example.test'};await route.fulfill({json:action==='user'?{data:{user:signedIn?user:null}}:{data:{session:signedIn?{user}:null}}});});

 try{
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:5188'));await page.locator('#login-form').waitFor({state:'visible'});assert.equal(await page.locator('.app-shell').isVisible(),false);await page.locator('#login-form [name="email"]').fill('qa@example.test');await page.locator('#login-form [name="password"]').fill('test-only');await page.locator('#login-form button').click();await page.waitForFunction(()=>window.CDPApp?.ready);console.log('PASS login gates cloud state and app scripts');
 const dbState=await page.evaluate(async()=>{
   const s=window.CDPRemote.adapter.state,S=window.CDPStructure,G=window.CDPProjectRfq,p=S.createProject(s,{name:'Navigation test',currency:'EUR'});
   s.manufacturers.push({id:'nav-maker',name:'Navigation Maker',active:true});const a={id:'nav-article',projectId:p.id,name:'Navigation Rug',shape:'Rektangulär',widthCm:100,lengthCm:200,quantity:2,bom:[]};s.articles.push(a);p.phases=[{id:'nav-phase',name:"Phase 1",items:[{articleId:a.id,quantity:2}],productionStart:'2027-01-01',deliveryDate:'2027-02-01',calculation:S.defaults()}];G.configure(s,p,[a.id],['nav-maker'],[]);G.publish(s,p,'nav-maker');await window.CDPRemote.adapter.save();return {pid:p.id};
 });
 await page.reload();await page.waitForFunction(()=>window.CDPApp?.ready);
 const project=async()=>{await page.locator('[data-view=projects]').click();await page.locator('[data-project-id="'+dbState.pid+'"]').first().click();};
 const close=async()=>page.locator('#modal .modal-close').click();
 const active=()=>page.locator('#modal .project-tab.active').getAttribute('data-project-tab');
 await project();assert.equal(await active(),'overview');await tab('rfq');await close();assert.equal(await active(),'overview');await close();assert.equal(await page.locator('#modalBackdrop').isVisible(),false);
 await project();await tab('phases');await tab('rfq');await close();assert.equal(await active(),'phases');await close();assert.equal(await active(),'overview');
 await tab('rfq');await page.locator('[data-rfq-toggle]').click();await page.locator('#modal [data-supplier-preview]').first().click();await page.locator('#supplierPreviewSelect').selectOption('nav-maker');await page.locator('[data-supplier-toggle]').click();await page.locator('[data-project-rfq-bom]').first().click();await close();assert.equal(await page.locator('#supplierPreviewSelect').inputValue(),'nav-maker');assert.equal(await page.locator('[data-supplier-toggle]').getAttribute('aria-expanded'),'true');
 const row=page.locator('[data-rfq-line]').first();await row.locator('[data-answer-decision]').selectOption('accepted');await row.locator('[data-answer-price]').fill('150');await row.locator('[data-answer-price]').press('Tab');await page.waitForFunction(()=>Object.values(window.CDPRemote.adapter.state.projects[0].projectRfq.recipients[0].answers)[0]?.price===150);await state();
 await close();assert.equal(await active(),'rfq');assert.equal(await page.locator('[data-rfq-toggle]').getAttribute('aria-expanded'),'true');assert.ok((await page.locator('.project-rfq-manufacturers').innerText()).includes('600'));await page.screenshot({path:output+'/navigation-return-rfq.png',fullPage:true});
 for(let i=0;i<2;i++){await page.locator('[data-v6-rfq-new]').click();await close();assert.equal(await active(),'rfq');}
 await page.locator('[data-v6-rfq-new]').click();await page.locator('#projectRfqConfig > button').click();await state();assert.equal(await active(),'rfq');await close();assert.equal(await active(),'overview');await close();assert.equal(await page.locator('#modalBackdrop').isVisible(),false);
 await page.locator('[data-view=manufacturers]').click();await page.locator('#view-manufacturers [data-supplier-preview]').click();await page.locator('#supplierPreviewSelect').selectOption('nav-maker');await close();assert.equal(await page.locator('#modalBackdrop').isVisible(),false);assert.equal(await page.locator('#view-manufacturers').evaluate(el=>el.classList.contains('active')),true);
 assert.deepEqual(errors,[]);console.log('PASS close returns to previous project tab, nested BOM/portal returns, expanded state, fresh prices, repeated cancel/save, root close and manufacturer entry');
 }catch(e){console.error(e);console.error((await page.locator('body').innerText()).slice(-2400));await page.screenshot({path:output+'/navigation-failure.png'});process.exitCode=1;}finally{await browser.close();}
})();
