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



 const pid=await page.evaluate(async()=>{const s=window.CDPRemote.adapter.state,p=window.CDPStructure.createProject(s,{name:'Return project'});await window.CDPRemote.adapter.save();return p.id;});
 await page.reload();await page.waitForFunction(()=>window.CDPApp?.ready);await page.locator('[data-view=projects]').click();await page.locator('[data-project-id="'+pid+'"]').first().click();await tab('articleList');
 const checkProject=async()=>{assert.equal(await page.locator('.project-tab.active').getAttribute('data-project-tab'),'articleList');assert.equal(await page.locator('[data-project-article-list]').getAttribute('data-project-article-list'),pid);assert.equal(await page.locator('.view.active').getAttribute('id'),'view-projects');};
 for(const name of ['First rug','Second rug']){await page.locator('[data-new-article-project]').click();await fill('#articleForm',{name,quantity:2,widthCm:100,lengthCm:200});await submit('#articleForm');await state();await checkProject();assert.ok((await page.locator('[data-project-article-rows]').innerText()).includes(name));}
 for(const close of ['#articleForm .modal-close','#articleForm [data-close]:not(.modal-close)']){await page.locator('[data-new-article-project]').click();await page.locator(close).click();await checkProject();}
 while(await page.locator('#modalBackdrop').isVisible())await page.locator('#modal .modal-close').click();assert.equal(await page.locator('#modalBackdrop').isVisible(),false);assert.equal(await page.locator('.view.active').getAttribute('id'),'view-projects');
 await page.locator('[data-view=articles]').click();await page.locator('[data-action=new-article]').click();await fill('#articleForm',{name:'Global rug',quantity:1});await submit('#articleForm');await state();assert.equal(await page.locator('#modalBackdrop').isVisible(),false);assert.equal(await page.locator('.view.active').getAttribute('id'),'view-articles');
 await page.reload();await page.waitForFunction(()=>window.CDPApp?.ready);assert.equal((await state()).articles.filter(a=>a.projectId===pid).length,3);assert.deepEqual(errors,[]);console.log('PASS repeated project article saves, Close/Cancel, root close, global article creation and persistence');
 }catch(e){console.error(e);console.error((await page.locator('body').innerText()).slice(-3000));process.exitCode=1;}finally{await browser.close();}
})();
