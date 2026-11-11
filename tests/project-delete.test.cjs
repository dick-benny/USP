const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ctx={window:{},crypto,console,Date,Promise,AbortSignal};vm.createContext(ctx);
for(const f of ['structure','workflow','rfq-project','remote'])vm.runInContext(fs.readFileSync(__dirname+'/../JS/'+f+'.js','utf8'),ctx);
const S=ctx.window.CDPStructure,G=ctx.window.CDPProjectRfq,R=ctx.window.CDPRemote,db=require('./fake-server.cjs')(),adapter=R.createAdapter(db,db.db),s=adapter.state;


(async()=>{
 const keep=S.createProject(s,{name:'Keep',customer:'Shared'}),p=S.createProject(s,{name:'Delete',customer:'Shared'});p._customerId=keep._customerId='00000000-0000-4000-8000-000000000010';p.businessStatus='Vunnet';p.history=[{type:'Imported'}];
 s.manufacturers.push({id:'m',name:'Maker'});s.leads.push({id:'lead',name:'Lead',status:'Go',projectId:p.id});s.inquiries.push({id:'inq',projectId:p.id,status:'Go'});
 for(const [id,projectId]of [['a',p.id],['b',keep.id]])s.articles.push({id,projectId,name:id,shape:'Rektangulär',widthCm:100,lengthCm:200,bom:[{name:'Wool',quantity:1}],quantity:1});
 p.phases=[{id:'ph',name:"Phase 1",items:[{articleId:'a',quantity:1}],calculation:S.defaults()}];
 G.configure(s,p,['a'],['m']);p.modelSampleOrders=[{id:'ms',manufacturerId:'m',sentAt:'2026-01-01'}];
 const r=S.createRfq(s,p,s.articles[0],'m',{required:true});S.recordAnswer(s,r,{decision:'accepted',price:10,fxRate:1,currency:'EUR',priceUnit:'per m²',status:'Godkänt'});S.selectResponse(s,r);S.saveSample(s,r,{required:true});
 s.quotations.push({id:'q',projectId:p.id,status:'Accepterad',version:1,amount:100,currency:'EUR',articleSnapshots:[],phaseSnapshots:[],costSnapshot:{totalCost:20}});
 assert.equal(await adapter.save(),true);const before=db.db;const targetTables=['projects','project_history','articles','bom_items','rfqs','rfq_responses','article_prices','phases','phase_items','quotation_versions','orders','deliveries'];
 const keepBefore=JSON.stringify(R.encode(s).cdp_projects.find(x=>x.id===keep._dbId));
 S.deleteProject(s,p.id);assert.equal(s.projects.length,1);assert.equal(s.leads[0].projectId,undefined);assert.equal(s.leads[0].status,'Aktivt');assert.equal(s.inquiries[0].projectId,undefined);assert.equal(s.samples.length,0);assert.equal(ctx.window.CDPModelSamples.supplier(s,'m').length,0);
 db.lostReply=true;assert.equal(await adapter.save(),false);assert.equal(await adapter.retry(),true);
 const after=db.db;for(const t of targetTables){const key='cdp_'+t;assert.ok(after[key].some(x=>x.archived_at),'Missing archive '+t);}assert.ok(after.cdp_customers.every(x=>!x.archived_at));assert.ok(after.cdp_manufacturers.every(x=>!x.archived_at));
 const reload=R.createAdapter(db,db.db);assert.equal(reload.state.projects.length,1);assert.equal(reload.state.articles.length,1);assert.equal(reload.state.articles[0].id,'b');assert.equal(reload.state.quotations.length,0);assert.deepEqual(after.cdp_projects.find(x=>x.id===keep._dbId),before.cdp_projects.find(x=>x.id===keep._dbId));assert.equal(after.cdp_quotation_versions[0].snapshot.id,before.cdp_quotation_versions[0].snapshot.id);
 // An unrelated customer's last project can also be removed without deleting its master record.
 S.deleteProject(reload.state,keep.id);assert.equal(await reload.save(),true);assert.ok(db.db.cdp_customers.every(x=>!x.archived_at));
 assert.throws(()=>S.deleteProject(reload.state,keep.id));console.log('PASS project deletion, all dependent archives, shared and orphan customer preservation, lead links, immutable quotes, lost-reply retry and reload isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
