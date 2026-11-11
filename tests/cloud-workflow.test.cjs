const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=__dirname+'/../';
const ctx={window:{},crypto,console,Promise,AbortSignal,Date,localStorage:{getItem(){throw Error('Local data must not be read');},setItem(){throw Error('Local data must not be written');}}};vm.createContext(ctx);
for(const f of ['structure','workflow','remote','data'])vm.runInContext(fs.readFileSync(root+'JS/'+f+'.js','utf8'),ctx);
const model=ctx.window.CDPStructure,remote=ctx.window.CDPRemote,clone=x=>JSON.parse(JSON.stringify(x));
const blank=()=>Object.fromEntries(remote.tables.map(t=>['cdp_'+t,[]]));
const same=(a,b)=>Object.keys(b).every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));
function server(){let db=blank(),calls=[],fail=false,lostReply=false;
return {get db(){return clone(db);},get calls(){return calls;},set fail(v){fail=v;},set lostReply(v){lostReply=v;},async rpc(name,args){
calls.push(name);if(fail)return {error:{message:'Network failed'}};
if(name==='cdp_read_state')return {data:clone(db)};
const staged=clone(db),result=[];
try{for(const c of args.changes){const list=staged[c.table],r=clone(c.row),old=list.find(x=>x.id===r.id);
if(old&&same(old,r)){result.push({table:c.table,id:r.id,revision:old.revision});continue;}
if(old&&old.revision!==c.revision||!old&&c.revision!=null)throw Object.assign(Error('Conflict'),{code:'40001'});
if(c.table==='cdp_quotation_versions'&&old&&['snapshot','amount','total_cost','currency','version','project_id'].some(k=>JSON.stringify(old[k])!==JSON.stringify(r[k])))throw Error('Frozen quote');
if(c.table==='cdp_phase_items'&&!old&&list.some(x=>x.phase_id===r.phase_id&&x.article_id===r.article_id))throw Error('Duplicate phase item');
if(old)Object.assign(old,r,{revision:old.revision+1});else list.push({...r,revision:1});result.push({table:c.table,id:r.id,revision:old?.revision||1});
}db=staged;if(lostReply){lostReply=false;return {error:{message:'Reply lost'}};}return {data:result};}catch(error){return {error};}
}};}
let count=0;async function test(name,fn){await fn();console.log('PASS '+name);count++;}
(async()=>{
 const db=server();let adapter=remote.createAdapter(db,db.db),s=adapter.state;
 await test('Hydration with v7 workflow performs zero writes',async()=>{await adapter.save();assert.equal(db.calls.length,0);assert.equal(s.samples.length,0);assert.equal(s.articleTemplates.length,0);});
 const p=model.createProject(s,{name:'Cloud project',customer:'Customer',currency:'EUR'}),m={id:'m1',name:'Manufacturer',currency:'EUR',active:true};s.manufacturers.push(m);
 const a={id:'a1',projectId:p.id,name:'Rug',code:'R1',shape:'Rektangulär',widthCm:100,lengthCm:200,material:'Wool',colours:'Ivory',nof:'N1',designReferences:['https://example.test/design'],bom:[{name:'Yarn',quantity:1,unit:'kg'}]};s.articles.push(a);assert.equal(p.phases.length,0);p.phases.push({id:'first',name:'First',items:[],calculation:model.defaults()});p.phases[0].items=[{articleId:a.id,quantity:3}];
 const rfq=model.createRfq(s,p,a,m.id,{required:true,type:'Strike-off',size:'30×30',requestedDate:'2026-10-13'});
 model.saveTemplate(s,a,'Rug template');
 await test('Technical BOM, template and sample survive reload without new tables',async()=>{assert.equal(await adapter.save(),true);let re=remote.createAdapter(db,db.db).state;assert.equal(re.articles[0].material,'Wool');assert.equal(re.articleTemplates[0].name,'Rug template');assert.equal(re.samples[0].rfqId,rfq.id);assert.equal(re.samples[0].size,'30×30');assert.equal(remote.tables.length,18);});
 await test('Rehydrating and saving unchanged records sends no updates',async()=>{const b=remote.createAdapter(db,db.db),calls=db.calls.length;await b.save();assert.equal(db.calls.length,calls);});
 model.recordAnswer(s,rfq,{decision:'accepted',price:123,currency:'EUR',priceUnit:'per m²',fxRate:1,moq:3,leadTime:20,status:'Godkänt'});model.selectResponse(s,rfq);
 await test('Chosen price, sample tracking/history and Butler reference persist',async()=>{model.saveSample(s,rfq,{required:true,status:'shipped',tracking:'TRACK',requestedDate:'2026-10-13',estimatedDispatch:'2026-10-20'});p.butlerOrders.push({id:'po1',phaseId:p.phases[0].id,manufacturerId:m.id,externalPoId:'B-123',status:'Production'});assert.equal(await adapter.save(),true);const re=remote.createAdapter(db,db.db).state;assert.equal(re.articles[0].selectedPrice.price,123);assert.equal(re.samples[0].tracking,'TRACK');assert.equal(re.samples[0].history.length,1);assert.equal(re.projects[0].butlerOrders[0].externalPoId,'B-123');});
 await test('Decline after chosen price does not resurrect price or delete selected snapshot',async()=>{model.recordAnswer(s,rfq,{decision:'declined',price:'',comment:'Withdrawn',status:'Förhandlas'});assert.equal(await adapter.save(),true);const re=remote.createAdapter(db,db.db).state;assert.equal(re.rfqs[0].price,null);assert.equal(re.rfqs[0].decision,'declined');assert.equal(re.rfqs[0].status,'Avböjd');assert.equal(re.articles[0].selectedPrice.price,123);assert.equal(re.articles[0].selectedRfqId,rfq.id);assert.ok(re.rfqs[0].history.length>=2);});
 await test('Decline as first response survives reload without a numeric response row',async()=>{const r=model.createRfq(s,p,a,m.id,{});model.recordAnswer(s,r,{decision:'declined',comment:'No capacity'});await adapter.save();const re=remote.createAdapter(db,db.db).state.rfqs.find(x=>x.id===r.id);assert.equal(re.price,null);assert.equal(re.decision,'declined');assert.equal(re.comment,'No capacity');});
 await test('Concurrent sample edits are rejected rather than overwritten',async()=>{const b=remote.createAdapter(db,db.db),c=remote.createAdapter(db,db.db);b.state.samples[0].tracking='First';c.state.samples[0].tracking='Second';assert.equal(await b.save(),true);assert.equal(await c.save(),false);assert.equal(c.failure.code,'40001');assert.equal(remote.createAdapter(db,db.db).state.samples[0].tracking,'First');});
 await test('Concurrent template edits are protected by company revision',async()=>{const b=remote.createAdapter(db,db.db),c=remote.createAdapter(db,db.db);b.state.articleTemplates[0].name='First template';c.state.articleTemplates[0].name='Second template';assert.equal(await b.save(),true);assert.equal(await c.save(),false);assert.equal(c.failure.code,'40001');});
 await test('Import refuses an existing database before touching state',()=>{const b=remote.createAdapter(db,db.db),before=JSON.stringify(b.state);assert.throws(()=>b.previewImport(s));assert.throws(()=>b.importLocal(s));assert.equal(JSON.stringify(b.state),before);});
 await test('v7 local JSON can migrate into empty cloud with BOM, template, sample and quote',async()=>{const local=clone(s);local.company={name:'Seller'};local.quotations=[{...model.snapshot(s,p),id:'Q-import',version:1}];local.inquiries=[{id:'old-inquiry',project:'Archive',status:'No Go'}];const fresh=server(),b=remote.createAdapter(fresh,fresh.db);assert.equal(b.previewImport(local).projects,1);assert.equal(await b.importLocal(local),true);const re=remote.createAdapter(fresh,fresh.db).state;assert.equal(re.samples[0].rfqId,rfq.id);assert.equal(re.articleTemplates[0].name,'Rug template');assert.equal(re.inquiries[0].id,'old-inquiry');assert.equal(re.quotations[0].phaseSnapshots.length,1);assert.notEqual(re.projects[0]._dbId,p._dbId);assert.equal(re.articles[0].selectedPrice.price,123);});
 await test('Snapshot columns remain unchanged when sample or BOM changes',async()=>{const fresh=server(),b=remote.createAdapter(fresh,fresh.db);await b.importLocal({...clone(s),company:{name:'Seller'},quotations:[{...model.snapshot(s,p),id:'Q1',version:1}]});const before=JSON.stringify(fresh.db.cdp_quotation_versions[0].snapshot);b.state.articles[0].material='Silk';b.state.samples[0].status='approved';assert.equal(await b.save(),true);assert.equal(JSON.stringify(fresh.db.cdp_quotation_versions[0].snapshot),before);});
 console.log(count+' cloud workflow tests passed (simulated RPC; no live database writes).');
})().catch(e=>{console.error(e);process.exitCode=1;});
