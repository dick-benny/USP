const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const ctx={window:{},crypto,console,Date,Promise,AbortSignal};vm.createContext(ctx);
for(const f of ['structure','workflow','rfq-project','remote'])vm.runInContext(fs.readFileSync(__dirname+'/../JS/'+f+'.js','utf8'),ctx);
const S=ctx.window.CDPStructure,G=ctx.window.CDPProjectRfq,R=ctx.window.CDPRemote,db=require('./fake-server.cjs')(),adapter=R.createAdapter(db,db.db),s=adapter.state;


(async()=>{
 const C=ctx.window.CDPCustomers;
 const c=C.save(s,'',{name:'Client',roles:['Kund','Beställare'],billing:{address:'Street 1',city:'Malmö'},contacts:[{name:'Anna',email:'anna@example.test',primary:true,active:true}],paymentTerms:'Net 30'});
 assert.throws(()=>C.save(s,'',{name:'client',roles:['Kund']}));assert.throws(()=>C.save(s,'',{name:'Bad',roles:[]}));
 const p=S.createProject(s,{name:'Project'});p.customerData.delivery={address:'Hotel Street'};C.link(s,p,{customer:c.id,customerContact:c.contacts[0].id,buyer:c.id,buyerContact:c.contacts[0].id,customerProjectReference:'REF1'});assert.equal(p.customerData.billing.contact,'Anna');assert.equal(p.customerData.delivery.address,'Hotel Street');assert.equal(p.calculation.paymentTerms,'Net 30');
 s.quotations.push({id:'q',projectId:p.id,status:'Utkast',version:1,amount:10,currency:'EUR',customerSnapshot:S.clone(p.customerData)});
 await adapter.save();const before=db.db.cdp_quotation_versions[0].snapshot;
 C.save(s,c.id,{...c,name:'Client renamed',billing:{address:'Street 2'},contacts:c.contacts});assert.equal(p.customerData.billing.address,'Street 1');await adapter.save();assert.deepEqual(db.db.cdp_quotation_versions[0].snapshot,before);
 const reload=R.createAdapter(db,db.db);assert.equal(reload.state.customers.length,1);assert.equal(reload.state.customers[0].name,'Client renamed');assert.equal(reload.state.customers[0].contacts[0].name,'Anna');assert.equal(reload.state.projects[0].parties.buyer.companyId,c.id);assert.equal(reload.diff(R.encode(reload.state)).length,0);
 const a=R.createAdapter(db,db.db),b=R.createAdapter(db,db.db);a.state.customers[0].notes='A';await a.save();b.state.customers[0].notes='B';assert.equal(await b.save(),false);assert.equal(b.failure.code,'40001');
 const r=R.createAdapter(db,db.db);S.deleteProject(r.state,p.id);assert.equal(await r.save(),true);assert.equal(R.createAdapter(db,db.db).state.customers.length,1);
 const legacy=JSON.parse(JSON.stringify(db.db));legacy.cdp_customers[0].billing={name:'Legacy',address:'Old',contact:'Lisa',email:'lisa@example.test'};const l=R.createAdapter(db,legacy);assert.equal(l.state.customers[0].contacts[0].name,'Lisa');assert.equal(l.state.customers[0].roles[0],'Kund');assert.equal(l.diff(R.encode(l.state)).length,0);
 console.log('PASS customer persistence, roles/contacts, duplicate validation, project linking, address snapshots, immutable quotes, customer retention, conflict protection and legacy decoding');
})().catch(e=>{console.error(e);process.exitCode=1;});