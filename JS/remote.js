/* Supabase persistence. No localStorage reads, seeds, or offline fallback. */
(() => {
  'use strict';
  const tables = ['companies','customers','agents','manufacturers','meetings','leads','projects','project_history','articles','bom_items','rfqs','rfq_responses','article_prices','phases','phase_items','quotation_versions','orders','deliveries'];
  const clone = x => JSON.parse(JSON.stringify(x));
  const canonical = x => JSON.stringify(x, function(k,v) { return v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v; });
  const uuid = () => crypto.randomUUID();
  const blankCompany = () => Object.fromEntries(['name','address','zip','city','country','orgNumber','vatNumber','eori','iban','bic','email','phone','web'].map(k=>[k,'']));
  const empty = () => ({schemaVersion:7,workspaceId:'supabase:'+(window.OFFERTVERKTYG_SUPABASE?.url||'shared'),company:blankCompany(),customers:[],meetings:[],leads:[],inquiries:[],projects:[],articles:[],rfqs:[],quotations:[],manufacturers:[],agents:[],samples:[],articleTemplates:[]});
  const metadata = ['status','sentAt','acceptedAt','acceptedBy','acceptanceMethod','poNumber','acceptedAmount','deliveryDate','acceptanceComment'];
  const without = (x, keys) => Object.fromEntries(Object.entries(x).filter(([k])=>!keys.includes(k)));
  const number = x => Number(x || 0);
  const iso = x => x ? new Date(x).toISOString() : null;
  const id = o => o._dbId || (o._dbId=uuid());
  async function rpc(client,name,args) {
    const request=client.rpc(name,args);
    // A timeout can mean the server committed but its reply was lost. Retrying is idempotent.
    return await (request.abortSignal && typeof AbortSignal!=='undefined' && AbortSignal.timeout ? request.abortSignal(AbortSignal.timeout(30000)) : request);
  }

  function decode(rows) {
    const s=empty(), get=t=>(rows['cdp_'+t]||[]).filter(r=>!r.archived_at);
    const item=r=>({...clone(r.details||{}),_dbId:r.id});
    const ids={};
    for(const t of tables) for(const r of get(t)) ids[r.id]=r.details?.id||r.id;
    if(get('companies')[0]) s.company={...blankCompany(),...item(get('companies')[0]),name:get('companies')[0].name};
    const appData=s.company._projectsApp;
    if(appData){s.articleTemplates=clone(appData.articleTemplates||[]);s.inquiries=clone(appData.inquiries||[]);}
    delete s.company._projectsApp;
    s.customers=get('customers').map(r=>{const billing=clone(r.billing||{}),meta=billing._registry||{};delete billing._registry;return {...meta,id:r.id,_dbId:r.id,name:r.name,billing,delivery:clone(r.delivery||{}),sameAsBilling:r.same_as_billing!==false,roles:meta.roles||['Kund'],contacts:meta.contacts||((billing.contact||billing.email)?[{id:r.id+'-contact',name:billing.contact||billing.email,email:billing.email||'',phone:'',primary:true,active:true}]:[]),active:meta.active!==false};});
    s.manufacturers=get('manufacturers').map(r=>({...item(r),id:ids[r.id],name:r.name,country:r.country||'',contact:r.contact||'',email:r.email||'',phone:r.phone||'',currency:r.currency,active:r.active}));
    s.agents=get('agents').map(r=>({...item(r),id:ids[r.id],name:r.name,active:r.active}));
    s.meetings=get('meetings').map(r=>({...item(r),id:ids[r.id],visitor:r.title}));
    s.leads=get('leads').map(r=>({...item(r),id:ids[r.id],name:r.name,status:r.status,meetingId:r.meeting_id?ids[r.meeting_id]:undefined}));
    s.projects=get('projects').map(r=>({...item(r),id:ids[r.id],name:r.name,sourceLeadId:r.source_lead_id?ids[r.source_lead_id]:undefined,currency:r.currency,businessStatus:r.business_status,phase:r.phase,probability:Number(r.probability),lostAt:r.lost_at||'',lossReason:r.loss_reason||'',lossComment:r.loss_comment||'',beforeLoss:r.before_loss||undefined,customerData:r.customer_data,calculation:{...r.calculation,targetMargin:Number(r.target_margin)},phases:[],_customerId:r.customer_id,history:get('project_history').filter(h=>h.project_id===r.id).map(h=>({...h.details,_dbId:h.id}))}));
    s.articles=get('articles').map(r=>({...item(r),id:ids[r.id],projectId:ids[r.project_id],name:r.name,code:r.code||'',specification:r.specification,shape:r.shape,widthCm:number(r.width_cm),lengthCm:number(r.length_cm),manualArea:number(r.manual_area),additionalCost:number(r.additional_cost),bom:get('bom_items').filter(b=>b.article_id===r.id).sort((a,b)=>a.sort_order-b.sort_order).map(b=>({_dbId:b.id,name:b.name,quantity:number(b.quantity),unit:b.unit,notes:b.notes||''}))}));
    s.rfqs=get('rfqs').map(r=>{const response=get('rfq_responses').find(x=>x.rfq_id===r.id);const result={...item(r),id:ids[r.id],projectId:ids[r.project_id],articleId:ids[r.article_id],manufacturerId:ids[r.manufacturer_id],status:r.status,requestSnapshot:r.request_snapshot,sentAt:r.sent_at?.slice(0,10)||'',...(response?{...response.details,_responseId:response.id,price:number(response.price),priceUnit:response.price_unit,currency:response.currency,fxRate:response.fx_rate,moq:number(response.moq),leadTime:number(response.lead_time_days),comment:response.comment||'',status:response.price_status,receivedAt:response.received_at?.slice(0,10)||''}:{})};
      if(r.details?._responseState)Object.assign(result,clone(r.details._responseState));
      for(const sample of r.details?._samples||[])s.samples.push({...clone(sample),rfqId:result.id,projectId:result.projectId,articleId:result.articleId,manufacturerId:result.manufacturerId});
      delete result._samples;delete result._responseState;return result;
    });
    for(const r of get('article_prices')) { const a=s.articles.find(a=>a._dbId===r.article_id); if(a){a._selectionId=r.id;a.selectedPrice=clone(r.selected_price_snapshot);const answer=get('rfq_responses').find(x=>x.id===r.response_id);a.selectedRfqId=answer?ids[answer.rfq_id]:undefined;} }
    for(const r of get('phases')) { const p=s.projects.find(p=>p._dbId===r.project_id); if(!p)continue; p.phases.push({...item(r),id:ids[r.id],name:r.name,productionStart:r.production_start||'',deliveryDate:r.delivery_date||'',items:get('phase_items').filter(i=>i.phase_id===r.id).sort((a,b)=>a.sort_order-b.sort_order).map(i=>({_dbId:i.id,articleId:ids[i.article_id],quantity:number(i.quantity)})),calculation:{...(r.details?.calculation||{}),deliveryTerm:r.delivery_term,freightCost:number(r.freight_cost),customerFreight:number(r.customer_freight),dutyCost:number(r.duty_cost),importVatCost:number(r.import_vat_cost),otherImportCost:number(r.other_import_cost),otherDeliveryCost:number(r.other_delivery_cost),includeImportVatInCost:r.include_import_vat_in_cost,freightPresentation:r.freight_presentation},_sort:r.sort_order}); }
    for(const p of s.projects)p.phases.sort((a,b)=>a._sort-b._sort);
    s.quotations=get('quotation_versions').map(r=>({...clone(r.snapshot),...clone(r.details),_dbId:r.id,projectId:ids[r.project_id],version:r.version,currency:r.currency,amount:number(r.amount),status:r.status}));
    // Old order dialogs store their editable fields on the project. Tables remain canonical mirrors.
    for(const r of get('orders')) {const p=s.projects.find(p=>p._dbId===r.project_id);if(p)p._orderId=r.id;}
    for(const r of get('deliveries')) {const p=s.projects.find(p=>p._dbId===r.project_id),ph=p?.phases.find(ph=>ph._dbId===r.phase_id);if(ph)ph._deliveryId=r.id;}
    return s;
  }

  function encode(s) {
    const rows=Object.fromEntries(tables.map(t=>['cdp_'+t,[]]));
    const put=(t,o,v)=>{const r={id:id(o),...v,archived_at:null};rows['cdp_'+t].push(r);return r.id;};
    const find=(collection,key)=>{const o=collection.find(o=>o.id===key);if(!o)throw Error("A linked record is missing. Reload the application.");return id(o);};
    const details=(o,keys=[])=>clone(without(o,['_dbId',...keys]));
    let companyId=null;
    if(s.company.name?.trim()||s.company._dbId||s.articleTemplates?.length||s.inquiries?.length)companyId=put('companies',s.company,{name:s.company.name||'',details:{...details(s.company),_projectsApp:{schemaVersion:7,articleTemplates:clone(s.articleTemplates||[]),inquiries:clone(s.inquiries||[])}}});
    else if(Object.entries(s.company).some(([k,v])=>k!=='_dbId'&&v))throw Error("Enter a company name before saving company details.");
    for(const m of s.manufacturers)put('manufacturers',m,{name:m.name,country:m.country||'',contact:m.contact||'',email:m.email||'',phone:m.phone||'',currency:m.currency||'EUR',active:m.active!==false,details:details(m)});
    for(const a of s.agents)put('agents',a,{name:a.name,active:a.active!==false,details:details(a)});
    for(const m of s.meetings)put('meetings',m,{title:m.visitor,meeting_at:iso(m.time),details:details(m)});
    for(const l of s.leads)put('leads',l,{name:l.name,meeting_id:l.meetingId?find(s.meetings,l.meetingId):null,status:l.status||'Aktivt',details:details(l)});
    s.customers||=[];
    for(const p of s.projects)if(p.customer?.trim()&&!s.customers.some(c=>(c._dbId||c.id)===p._customerId)){
      if(!p._customerId){const matches=s.customers.filter(c=>c.active!==false&&c.name.trim().toLocaleLowerCase('sv')===p.customer.trim().toLocaleLowerCase('sv'));if(matches.length===1){p._customerId=matches[0]._dbId||matches[0].id;continue;}}
      const cid=p._customerId||(p._customerId=uuid());s.customers.push({id:cid,_dbId:cid,name:p.customer,billing:clone(p.customerData?.billing||{}),delivery:clone(p.customerData?.delivery||{}),sameAsBilling:p.customerData?.sameAsBilling!==false,roles:['Kund'],contacts:[],active:true});
    }
    for(const c of s.customers){c._dbId||=c.id;const meta=details(c,['id','name','billing','delivery','sameAsBilling']);put('customers',c,{name:c.name,billing:{...c.billing,_registry:meta},delivery:c.delivery||{},same_as_billing:c.sameAsBilling!==false});}
    for(const p of s.projects) {
      const customer=p._customerId||null;
      const pid=put('projects',p,{name:p.name,source_lead_id:p.sourceLeadId?find(s.leads,p.sourceLeadId):null,customer_id:customer,company_id:companyId,currency:p.currency||'EUR',business_status:p.businessStatus||'Aktivt',phase:p.phase||'Kalkyl',probability:number(p.probability),target_margin:Number(p.calculation?.targetMargin??45),lost_at:p.lostAt||null,loss_reason:p.lossReason||null,loss_comment:p.lossComment||null,before_loss:p.beforeLoss||null,customer_data:p.customerData||{},calculation:p.calculation||{},details:details(p,['phases','history'])});
      for(const h of p.history||[])put('project_history',h,{project_id:pid,event_type:h.status||h.type||"Change",details:details(h)});
    }
    for(const a of s.articles) {
      const aid=put('articles',a,{project_id:find(s.projects,a.projectId),code:a.code||'',name:a.name,specification:a.specification||'',shape:a.shape||'',width_cm:number(a.widthCm),length_cm:number(a.lengthCm),manual_area:number(a.manualArea),additional_cost:number(a.additionalCost),details:details(a,['bom','selectedPrice'])});
      (a.bom||[]).forEach((b,n)=>put('bom_items',b,{article_id:aid,name:b.name,quantity:number(b.quantity),unit:b.unit||'st',notes:b.notes||'',sort_order:n}));
    }
    for(const r of s.rfqs) {
      const pid=find(s.projects,r.projectId),aid=find(s.articles,r.articleId);
      const responseKeys=['decision','price','priceUnit','currency','fxRate','moq','leadTime','comment','status','receivedAt','validUntil','revision','history'];
      const responseState=Object.fromEntries(responseKeys.filter(k=>r[k]!==undefined).map(k=>[k,clone(r[k])]));
      const rid=put('rfqs',r,{project_id:pid,article_id:aid,manufacturer_id:find(s.manufacturers,r.manufacturerId),status:r.status==='Avböjd'?'Förfrågan':r.status,request_snapshot:r.requestSnapshot,sent_at:iso(r.sentAt),details:{...details(r,['requestSnapshot']),_responseState:responseState,_samples:clone((s.samples||[]).filter(sample=>sample.rfqId===r.id))}});
      if(r.price!=null||r._responseId||s.articles.some(a=>a.selectedRfqId===r.id&&a.selectedPrice)){const o={_dbId:r._responseId||(r._responseId=uuid())};const lastPrice=r.price??[...(r.history||[])].reverse().find(h=>h.price!=null)?.price??0;
        put('rfq_responses',o,{rfq_id:rid,article_id:aid,project_id:pid,price:number(lastPrice),price_unit:r.priceUnit||'per m²',currency:r.currency||'EUR',fx_rate:r.fxRate?Number(r.fxRate):null,moq:number(r.moq),lead_time_days:number(r.leadTime),comment:r.comment||'',price_status:r.status==='Avböjd'?'Förfrågan':r.status,received_at:iso(r.receivedAt)||iso(r.createdAt),details:{history:r.history||[]}});}
    }
    for(const a of s.articles)if(a.selectedRfqId&&a.selectedPrice){const r=s.rfqs.find(r=>r.id===a.selectedRfqId);if(!r?._responseId)throw Error("The selected RFQ response is missing.");put('article_prices',{_dbId:a._selectionId||(a._selectionId=uuid())},{article_id:id(a),project_id:find(s.projects,a.projectId),response_id:r._responseId,selected_price_snapshot:a.selectedPrice});}
    for(const p of s.projects) (p.phases||[]).forEach((ph,n)=>{
      const c={...window.CDPStructure.defaults(),...ph.calculation};
      ph._itemIds=ph._itemIds||{};
      ph.items.forEach(i=>{i._dbId=i._dbId||ph._itemIds[i.articleId]||uuid();ph._itemIds[i.articleId]=i._dbId;});
      const phid=put('phases',ph,{project_id:id(p),name:ph.name,production_start:ph.productionStart||null,delivery_date:ph.deliveryDate||null,sort_order:n,delivery_term:c.deliveryTerm,freight_cost:number(c.freightCost),customer_freight:number(c.customerFreight),duty_cost:number(c.dutyCost),import_vat_cost:number(c.importVatCost),other_import_cost:number(c.otherImportCost),other_delivery_cost:number(c.otherDeliveryCost),include_import_vat_in_cost:!!c.includeImportVatInCost,freight_presentation:c.freightPresentation,details:details(ph,['items','_sort'])});
      ph.items.forEach((i,n)=>put('phase_items',i,{project_id:id(p),phase_id:phid,article_id:find(s.articles,i.articleId),quantity:Number(i.quantity),sort_order:n}));
    });
    for(const q of s.quotations)put('quotation_versions',q,{project_id:find(s.projects,q.projectId),version:Number(q.version),status:q.status,currency:q.currency||'EUR',amount:number(q.amount),total_cost:number(q.costSnapshot?.totalCost),snapshot:details(q,metadata),details:Object.fromEntries(metadata.filter(k=>k in q).map(k=>[k,q[k]])),sent_at:iso(q.sentAt),accepted_at:iso(q.acceptedAt)});
    for(const p of s.projects){const q=s.quotations.find(q=>q.projectId===p.id&&q.status==='Accepterad');if(!q)continue;const oid=put('orders',{_dbId:p._orderId||(p._orderId=uuid())},{project_id:id(p),quotation_version_id:id(q),status:p.deliveryStatus||'Planerad',details:{poNumber:p.poNumber||'',acceptedBy:p.acceptedBy||'',acceptedAt:p.acceptedAt||'',acceptedAmount:p.value,comment:p.deliveryComment||''}});for(const ph of p.phases||[])put('deliveries',{_dbId:ph._deliveryId||(ph._deliveryId=uuid())},{project_id:id(p),order_id:oid,phase_id:id(ph),planned_date:ph.deliveryDate||p.deliveryDate||null,status:p.deliveryStatus||'Planerad',details:{comment:p.deliveryComment||''}});}
    return rows;
  }

  function createAdapter(client,initial) {
    if(!initial||tables.some(t=>!Array.isArray(initial['cdp_'+t])))throw Error("The database response is incomplete.");
    const state=window.CDPStructure.migrate(decode(initial));
    // First normalization establishes a baseline only; it never writes to the database.
    encode(state);
    let baseline=encode(state), revisions=new Map();
    for(const t of tables)for(const r of initial['cdp_'+t])revisions.set('cdp_'+t+':'+r.id,r.revision);
    let pending=null, busy=false, failure=null, retryBatch=null, notify=()=>{};
    function diff(next){const changes=[];for(const t of tables){const table='cdp_'+t,old=new Map(baseline[table].map(r=>[r.id,r]));for(const r of next[table]){const before=old.get(r.id);if(!before||canonical(before)!==canonical(r))changes.push({table,row:r,revision:revisions.get(table+':'+r.id)??null});old.delete(r.id);}for(const r of old.values())if(t!=='customers')changes.push({table,row:{id:r.id,archived_at:new Date().toISOString()},revision:revisions.get(table+':'+r.id)});}return changes;}
    async function flush(){
      try{
        // Two passes stabilize IDs assigned to nested records before serializing parent details.
        if(!retryBatch){encode(state);const next=encode(state);retryBatch={next,changes:diff(next)};}
        const {next,changes}=retryBatch;
        if(changes.length){const result=await rpc(client,'cdp_apply_changes',{changes});if(result.error)throw result.error;if(!Array.isArray(result.data)||result.data.length!==changes.length)throw Error("The save could not be confirmed.");for(const r of result.data)revisions.set(r.table+':'+r.id,r.revision);}
        baseline=next;retryBatch=null;failure=null;busy=false;pending=null;notify({busy:false});return true;
      }catch(e){failure=e;busy=true;pending=null;notify({busy:true,error:e});return false;}
    }
    function previewImport(source){
      if(tables.some(t=>initial['cdp_'+t].some(r=>!r.archived_at))||tables.some(t=>baseline['cdp_'+t].length))throw Error("The database already contains data. Import has been stopped to prevent overwriting it.");
      if(!source||!Array.isArray(source.projects)||!Array.isArray(source.articles)||!Array.isArray(source.quotations))throw Error("The file has no projects, articles or quotations.");
      if(Number(source.schemaVersion||0)>7)throw Error("The backup was created with a newer application version.");
      return {projects:source.projects.length,articles:source.articles.length,quotations:source.quotations.length};
    }
    return {state, get busy(){return busy;},get failure(){return failure;},onStatus(fn){notify=fn;},save(){if(failure)throw Error("The previous change has not been saved.");if(!pending){busy=true;notify({busy:true});pending=Promise.resolve().then(flush);}return pending;},retry(){failure=null;return this.save();},exportUnsaved(){return clone(state);},diff,previewImport,importLocal(source){previewImport(source);const prepared=JSON.parse(JSON.stringify(source,(key,value)=>['_dbId','_responseId','_selectionId','_customerId','_itemIds','_deliveryId','_orderId','_sort'].includes(key)?undefined:value));prepared.workspaceId=state.workspaceId;window.CDPStructure.migrate(prepared);encode(prepared);Object.assign(state,prepared);return this.save();},get baseline(){return baseline;}};
  }

  function bindStatus(adapter){
    const panel=document.createElement('div');panel.id='cloud-save';panel.hidden=true;
    panel.setAttribute('role','alertdialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',"Save status");
    panel.innerHTML="<div class=\"cloud-card\"><h2 id=\"cloud-title\">Saving…</h2><p id=\"cloud-message\">The change is saved in Supabase.</p><div id=\"cloud-actions\" hidden><button type=\"button\" data-cloud-retry>Retry saving</button><button type=\"button\" data-cloud-export>Download unsaved changes</button><button type=\"button\" data-cloud-reload>Reload from database</button></div></div>";
    document.body.appendChild(panel);
    const setBlocked=b=>{for(const el of document.querySelectorAll('.app-shell,#modalBackdrop,#v6PreviewOverlay'))el.inert=b;};
    adapter.onStatus(({busy,error})=>{panel.hidden=!busy;setBlocked(busy);if(busy){document.querySelector('#toast')?.classList.remove('show');panel.querySelector('#cloud-title').textContent=error?"The change is not confirmed":"Saving…";panel.querySelector('#cloud-message').textContent=error?((error.code==='40001'||error.code==='23505')?"Someone else has changed the data. Download your unsaved changes, then reload from the database.":"Could not confirm the save. Check your connection and try again. ")+(error.message||''):"The change is saved in Supabase.";panel.querySelector('#cloud-actions').hidden=!error;if(error)panel.querySelector('[data-cloud-export]').focus();}else{const el=document.querySelector('#toast');if(el){el.textContent="Saved in Supabase";el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400);}}});
    panel.querySelector('[data-cloud-retry]').onclick=()=>adapter.retry();
    panel.querySelector('[data-cloud-export]').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(adapter.exportUnsaved(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='osparade-uppgifter.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    panel.querySelector('[data-cloud-reload]').onclick=()=>{if(confirm("Reload from the database? Any unsaved changes in this tab will be lost."))location.reload();};
    // Capture at window before any existing application handlers, including dialogs opened while saving.
    for(const type of ['click','submit','change','input','keydown'])window.addEventListener(type,e=>{if(adapter.busy&&!panel.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
    window.addEventListener('beforeunload',e=>{if(adapter.busy){e.preventDefault();e.returnValue='';}});
  }
  window.CDPRemote={tables,encode,decode,createAdapter,async start(client){const {data,error}=await rpc(client,'cdp_read_state');if(error)throw error;const adapter=createAdapter(client,data);this.adapter=adapter;bindStatus(adapter);return adapter;}};
})();


