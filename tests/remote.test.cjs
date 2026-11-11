const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=__dirname+'/../';
const ctx={window:{},crypto,console,Promise,AbortSignal,Date,localStorage:{getItem(){throw Error('Local data must not be read');},setItem(){throw Error('Local data must not be written');}}};vm.createContext(ctx);
for(const f of ['structure','remote','data'])vm.runInContext(fs.readFileSync(root+'JS/'+f+'.js','utf8'),ctx);
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
let count=0;async function test(n,f){await f();console.log('PASS '+n);count++;}
(async()=>{
const db=server();let a=remote.createAdapter(db,db.db),s=a.state,p;
await test('Empty database never loads or saves demo/localStorage data',async()=>{assert.equal(s.projects.length,0);assert.equal(s.company.name,'');assert.equal(db.calls.length,0);await a.save();assert.equal(db.calls.length,0);});
await test('Creating project writes customer, project without phases in one request',async()=>{p=model.createProject(s,{name:'Remote',customer:'Customer',probability:30});await a.save();assert.equal(db.calls.length,1);assert.equal(db.db.cdp_projects.length,1);assert.equal(db.db.cdp_customers.length,1);assert.equal(db.db.cdp_phases.length,0);assert.equal(a.busy,false);});
await test('Go writes lead and project together and is idempotent',async()=>{s.leads.push({id:crypto.randomUUID(),name:'Lead',status:'Aktivt'});const l=s.leads[0],project=model.go(s,l.id);await a.save();assert.equal(model.go(s,l.id).id,project.id);await a.save();assert.equal(db.db.cdp_projects.length,2);});
let rug,r;
await test('BOM, two phases, RFQ response and selected price round trip',async()=>{
const m={id:crypto.randomUUID(),name:'Factory',currency:'EUR',active:true};s.manufacturers.push(m);
rug={id:crypto.randomUUID(),name:'Rug',projectId:p.id,code:'A01',widthCm:100,lengthCm:200,shape:'Rektangulär',specification:'Wool',bom:[{name:'Wool',quantity:2,unit:'kg',notes:'Test'}]};s.articles.push(rug);
p.phases.push({id:'first',name:'First',items:[],calculation:model.defaults()});p.phases[0].items=[{articleId:rug.id,quantity:2}];p.phases[0].deliveryDate='2027-01-01';p.phases.push({id:'second',name:'Second',deliveryDate:'2027-02-01',items:[{articleId:rug.id,quantity:3}],calculation:{...model.defaults(),deliveryTerm:'DDP',dutyCost:20}});
r={id:crypto.randomUUID(),projectId:p.id,articleId:rug.id,manufacturerId:m.id,status:'Godkänt',createdAt:'2026-10-12',receivedAt:'2026-10-12',price:100,currency:'EUR',priceUnit:'per m²',moq:2,leadTime:30,requestSnapshot:{project:p.name,article:clone(rug),phases:[]}};s.rfqs.push(r);rug.selectedRfqId=r.id;rug.selectedPrice={...r,manufacturer:m.name};await a.save();assert.equal(a.failure,null);
const b=remote.createAdapter(db,db.db),rb=b.state.articles[0];assert.equal(rb.bom[0].name,'Wool');assert.equal(rb.selectedPrice.price,100);assert.equal(b.state.projects.find(x=>x.id===p.id).phases.length,2);assert.equal(b.state.rfqs[0].leadTime,30);assert.equal(model.calculate(b.state,b.state.projects.find(x=>x.id===p.id)).productionCost,1000);
const before=db.calls.length;await b.save();assert.equal(db.calls.length,before,'Hydrated state should not rewrite itself');
});
await test('Editing phase quantities reuses row identity after form replaces objects',async()=>{const key=db.db.cdp_phase_items[0].id;p.phases[0].items=[{articleId:rug.id,quantity:4}];await a.save();assert.equal(a.failure,null);assert.equal(db.db.cdp_phase_items.find(x=>x.id===key).quantity,4);});
await test('Removed quantity is archived and can be restored after reload',async()=>{p.phases[0].items=[];await a.save();assert.ok(db.db.cdp_phase_items.some(x=>x.archived_at));a=remote.createAdapter(db,db.db);s=a.state;p=s.projects.find(x=>x.name==='Remote');rug=s.articles[0];r=s.rfqs[0];p.phases[0].items=[{articleId:rug.id,quantity:2}];await a.save();assert.equal(a.failure,null);assert.equal(db.db.cdp_phase_items.filter(x=>!x.archived_at).length,2);});
let q;
await test('Quote survives reload; status changes do not mutate its frozen snapshot',async()=>{q=model.snapshot(s,p);Object.assign(q,{id:'Q-test',version:1});s.quotations.push(q);await a.save();assert.equal(a.failure,null);const snap=JSON.stringify(db.db.cdp_quotation_versions[0].snapshot);q.status='Skickad';await a.save();assert.equal(a.failure,null);assert.equal(JSON.stringify(db.db.cdp_quotation_versions[0].snapshot),snap);const b=remote.createAdapter(db,db.db);assert.equal(b.state.quotations[0].status,'Skickad');assert.equal(b.state.quotations[0].phaseSnapshots.length,2);});
await test('Lost/reopened project and quote statuses are committed together',async()=>{model.loseProject(s,p.id,{reason:"Price"});await a.save();assert.equal(a.failure,null);assert.equal(db.db.cdp_projects.find(x=>x.id===p._dbId).business_status,'Förlorat');assert.equal(db.db.cdp_quotation_versions[0].status,'Avböjd');assert.equal(db.db.cdp_project_history.length,1);model.reopenProject(s,p.id);await a.save();assert.equal(db.db.cdp_project_history.length,2);});
await test('Accepted quote creates order and phase deliveries',async()=>{q.status='Accepterad';q.acceptedAt='2026-10-12';p.businessStatus='Vunnet';p.phase='Vunnet';p.deliveryStatus='Väntar orderunderlag';await a.save();assert.equal(a.failure,null);assert.equal(db.db.cdp_orders.length,1);assert.equal(db.db.cdp_deliveries.length,2);});
await test('Two clients editing one project cannot overwrite each other',async()=>{const b=remote.createAdapter(db,db.db),c=remote.createAdapter(db,db.db);b.state.projects[0].name='First';c.state.projects[0].name='Second';assert.equal(await b.save(),true);assert.equal(await c.save(),false);assert.equal(c.failure.code,'40001');assert.equal(db.db.cdp_projects[0].name,'First');});
await test('Network errors retain unsaved data and block further edits until retry',async()=>{a=remote.createAdapter(db,db.db);a.state.projects[0].name='Retry';db.fail=true;assert.equal(await a.save(),false);assert.equal(a.busy,true);assert.equal(a.exportUnsaved().projects[0].name,'Retry');assert.throws(()=>a.save());db.fail=false;assert.equal(await a.retry(),true);assert.equal(a.busy,false);});
await test('Retry after lost server reply is idempotent',async()=>{const n=db.db.cdp_projects.length;model.createProject(a.state,{name:'Lost reply'});db.lostReply=true;assert.equal(await a.save(),false);assert.equal(db.db.cdp_projects.length,n+1);assert.equal(await a.retry(),true);assert.equal(db.db.cdp_projects.length,n+1);});
await test('Archive retry keeps the original timestamp after a lost reply',async()=>{a.state.projects=a.state.projects.filter(p=>p.name!=='Lost reply');db.lostReply=true;assert.equal(await a.save(),false);const archived=db.db.cdp_projects.find(p=>p.name==='Lost reply').archived_at;assert.ok(archived);assert.equal(await a.retry(),true);assert.equal(db.db.cdp_projects.find(p=>p.name==='Lost reply').archived_at,archived);});
await test('One failed row rolls back the entire batch',async()=>{a=remote.createAdapter(db,db.db);const before=JSON.stringify(db.db);a.state.projects[0].name="Must role back";a.state.quotations[0].amount+=100;assert.equal(await a.save(),false);assert.equal(JSON.stringify(db.db),before);});
await test('Incomplete read is rejected rather than treated as empty database',()=>{assert.throws(()=>remote.createAdapter(db,{}));assert.throws(()=>remote.createAdapter(db,null));});
await test('Meeting helpers use the remote adapter without local storage',async()=>{const c=remote.createAdapter(db,db.db);remote.adapter=c;const store=ctx.window.CDPData.createRemoteStore();const m=store.createMeeting({time:'2027-01-01T09:00',visitor:'Visitor',host:'DE'});await store.save();assert.ok(db.db.cdp_meetings.find(x=>x.details.id===m.id));store.updateMeeting(m.id,{comment:'Updated'});await store.save();assert.equal(db.db.cdp_meetings.find(x=>x.details.id===m.id).details.comment,'Updated');store.removeMeeting(m.id);await store.save();assert.ok(db.db.cdp_meetings.find(x=>x.details.id===m.id).archived_at);});
console.log(count+' remote adapter tests passed (transaction/RPC test double; no live Supabase writes).');
})().catch(e=>{console.error(e);process.exitCode=1;});
