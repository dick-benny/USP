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




 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 const ids=await page.evaluate(async()=>{const s=window.CDPRemote.adapter.state,S=window.CDPStructure,C=window.CDPCustomers;const c=C.save(s,'',{name:'Kund',roles:['Kund','Beställare'],billing:{city:'Malmö'},contacts:[]});const p=S.createProject(s,{name:'Översikt',customer:'Kund',currency:'EUR'});s.articles.push({id:'english-article',projectId:p.id,name:'Förfrågan',location:'Standardrum',shape:'Rund',widthCm:200,quantity:2,bom:[],status:'Förfrågan',pricePerSqm:0});p.phases=[{id:'english-phase',name:'Fas Å',productionStart:'2027-02-01',deliveryDate:'2027-03-01',items:[{articleId:'english-article',quantity:2}],calculation:S.defaults()}];await window.CDPRemote.adapter.save();return {pid:p.id,cid:c.id};});
 await page.reload();await page.waitForFunction(()=>window.CDPApp?.ready);
 await page.locator('[data-view=customers]').click();let row=page.locator('[data-customer-row]');assert.equal(await row.locator('td').nth(0).innerText(),'Kund');assert.equal(await row.locator('td').nth(1).innerText(),'Customer, Buyer');assert.ok((await row.innerText()).includes('Malmö'));
 await row.click();assert.equal(await page.locator('[name=roles][value="Kund"]').isChecked(),true);assert.ok((await page.locator('#customerRegisterForm').innerText()).includes('Customer'));await page.locator('#customerRegisterForm button').filter({hasText:'Save company'}).click();await state();
 await page.locator('#modal .modal-close').click();await page.locator('[data-view=projects]').click();await page.locator('[data-project-id="'+ids.pid+'"]').first().click();assert.equal(await page.locator('#modalTitle').innerText(),'Översikt');assert.ok((await page.locator('.project-tabs').innerText()).includes('Costing'));
 await tab('articleList');assert.ok((await page.locator('[data-project-article-rows]').innerText()).includes('Förfrågan'));await page.locator('#modal [data-v6-bom="english-article"]').click();assert.deepEqual(await page.locator('#v7Bom [name=shape] option').allTextContents(),['Rectangular','Round']);assert.equal(await page.locator('#v7Bom [name=shape]').inputValue(),'Rund');assert.equal(await page.locator('#v7Bom [name=location] option:checked').innerText(),'Standard room');await page.locator('#v7Bom [name=shape]').selectOption({label:'Rectangular'});await page.locator('#v7Bom [name=lengthCm]').fill('300');await submit('#v7Bom');let s=await state();assert.equal(s.articles[0].shape,'Rektangulär');assert.equal(s.articles[0].location,'Standardrum');assert.equal(s.articles[0].name,'Förfrågan');assert.deepEqual(s.customers[0].roles,['Kund','Beställare']);
 await page.locator('#modal .modal-close').click();await tab('phases');assert.ok((await page.locator('#modal').innerText()).includes('Fas Å'));assert.ok((await page.locator('#modal').innerText()).toLowerCase().includes('production start'));await page.screenshot({path:output+'/english-phases.png',fullPage:true});
 await tab('calculation');assert.deepEqual(await page.locator('[name=freightPresentation]').first().locator('option').allTextContents(),['Separate line','Included in product price']);assert.equal(await page.locator('[name=freightPresentation]').first().inputValue(),'Separat rad');
 await page.reload();await page.waitForFunction(()=>window.CDPApp?.ready);s=await state();assert.equal(s.articles[0].shape,'Rektangulär');assert.equal(s.articles[0].name,'Förfrågan');assert.equal(s.projects[0].name,'Översikt');assert.deepEqual(errors,[]);console.log('PASS English labels, legacy enum values, shape/role/freight options, Swedish user data, persistence and date input');
 }catch(e){console.error(e);console.error((await page.locator('body').innerText()).slice(-3500));await page.screenshot({path:output+'/english-failure.png'});process.exitCode=1;}finally{await browser.close();}
})();


