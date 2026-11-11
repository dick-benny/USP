/* Project RFQs. The supplier preview is an internal Projects tool, not an auth boundary. */
(() => {
  'use strict';
  const S=window.CDPStructure,copy=S.clone,now=()=>new Date().toISOString();
  const unique=a=>[...new Set(a)];
  const key=(articleId,phaseId)=>JSON.stringify([articleId,phaseId||'']);
  function content(state,p,ids,sampleIds,targets={},type="complete"){
    const lines=[];
    for(const id of ids){
      const a=state.articles.find(a=>a.id===id&&a.projectId===p.id);if(!a)continue;
      const spec={shape:'',widthCm:0,lengthCm:0,manualArea:0,specification:'',designReferences:[],id:a.id,code:a.code||'',name:a.name,...S.specification(a)};
      // Storage identities and ordering are not supplier specification changes.
      spec.bom=(a.bom||[]).map(b=>({name:b.name||'',quantity:Number(b.quantity)||0,unit:b.unit||'st',notes:b.notes||''}));
      const phases=type==='preliminary'?[]:(p.phases||[]).flatMap(ph=>(ph.items||[]).filter(i=>i.articleId===id).map(i=>({phaseId:ph.id,phase:ph.name,quantity:Number(i.quantity),productionStart:ph.productionStart||'',deliveryDate:ph.deliveryDate||''})));
      for(const ph of phases.length?phases:[{phaseId:'',phase:type==='preliminary'?"Preliminary":"No phase assigned",quantity:Number(a.quantity??1),productionStart:'',deliveryDate:''}])lines.push({key:key(id,ph.phaseId),articleId:id,article:copy(spec),...ph,sample:false,...(targets[id]!=null?{targetPrice:targets[id]}:{}),area:S.area(a)});
      if(!p.qualitySamples&&sampleIds.includes(id))lines.push({key:'sample:'+id,articleId:id,article:copy(spec),sampleDetails:S.articleSample(state,a),phaseId:'',phase:'',quantity:1,productionStart:'',deliveryDate:'ASAP',sample:true,area:0});
    }
    for(const sample of p.qualitySamples||[]){if(!sampleIds.includes(sample.id)||!sample.articleIds.some(id=>ids.includes(id)))continue;
      lines.push({key:'quality:'+sample.id,articleId:sample.id,article:{id:sample.id,name:S.qualitySampleName(state,sample)},sampleDetails:{...copy(sample),type:"Quality sample",deliveryAddress:S.sampleAddress(state)},phaseId:'',phase:'',quantity:null,productionStart:'',deliveryDate:'ASAP',sample:true,area:0});
    }
    return lines;
  }
  function validateConfig(state,p,ids,mids,samples){
    if(!ids.length||!mids.length)throw Error("Select at least one article and one manufacturer.");
    if(ids.some(id=>!state.articles.some(a=>a.id===id&&a.projectId===p.id)))throw Error("The article does not belong to this project.");
    if(mids.some(id=>!state.manufacturers.some(m=>m.id===id&&m.active!==false)))throw Error("Select active manufacturers.");
    if(p.qualitySamples&&ids.some(id=>!p.qualitySamples.some(s=>samples.includes(s.id)&&s.articleIds.includes(id))))throw Error("Select quality samples covering all selected articles. A sample can be linked to multiple articles.");
    if(samples.some(id=>p.qualitySamples?!p.qualitySamples.some(s=>s.id===id&&s.articleIds.some(a=>ids.includes(a))):!ids.includes(id)))throw Error("The sample must belong to a selected article.");
  }
  function recipient(g,mid){const r=g.recipients.find(r=>r.manufacturerId===mid);if(!r)throw Error("The manufacturer is not selected for this RFQ.");return r;}
  function configure(state,p,ids,mids,samples=[],targets,type){
    const requireDetails=Boolean(type);
    const qualitySamples=type&&!p.qualitySamples?copy(S.qualitySamples(state,p)):p.qualitySamples,configProject={...p,qualitySamples};
    type=type||p.projectRfq?.type||'complete';if(!['preliminary','complete'].includes(type))throw Error("Select an RFQ type.");if(p.projectRfq&&(p.projectRfq.type||'complete')==='complete'&&type==='preliminary')throw Error("A complete RFQ cannot revert to preliminary.");
    ids=unique(ids);mids=unique(mids);samples=qualitySamples?unique(samples):ids.slice();validateConfig(state,configProject,ids,mids,samples);
    const nextTargets={};for(const id of ids){const value=targets===undefined?(p.projectRfq?p.projectRfq.targetPrices?.[id]:state.articles.find(a=>a.id===id)?.targetPrice):targets[id];if(value===''||value==null)continue;const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error("Target price must be greater than 0 EUR/m², or left blank.");nextTargets[id]=n;}
    if(qualitySamples)p.qualitySamples=qualitySamples;
    if(!p.projectRfq){
      const id=S.uid('RFQ');
      p.projectRfq={id,number:'RFQ-'+new Date().getFullYear()+'-'+id.slice(4).toUpperCase(),createdAt:now(),revision:1,type,answerRequirements:requireDetails,articleIds:ids,sampleIds:samples,targetPrices:nextTargets,lines:content(state,p,ids,samples,nextTargets,type),recipients:[],history:[]};
    }
    const g=p.projectRfq;
    if((g.type||'complete')!==type){
      p.preliminaryRfq=copy(g);const priorId=g.id;g.id=S.uid('RFQ');g.number='RFQ-'+new Date().getFullYear()+'-'+g.id.slice(4).toUpperCase();g.preliminaryRfqId=priorId;g.createdAt=now();g.answerRequirements=true;g.recipients=g.recipients.filter(r=>mids.includes(r.manufacturerId));
      g.history.push({revision:g.revision,type:g.type||'complete',at:now(),lines:copy(g.lines),recipients:copy(g.recipients)});g.revision++;g.type=type;
      for(const r of g.recipients){r.history.push({type:'stage-changed',revision:g.revision-1,at:now(),answers:copy(r.answers)});r.answers={};r.completedAt=null;r.publishedRevision=0;r.needsConfirmation=false;}
      g.lines=content(state,p,ids,samples,nextTargets,type);
    }
    if(requireDetails&&!g.answerRequirements){g.answerRequirements=true;for(const r of g.recipients){if(r.completedAt)r.history.push({type:'requirements-changed',revision:g.revision,at:now(),answers:copy(r.answers)});r.completedAt=null;if(r.publishedRevision)r.needsConfirmation=true;}}
    g.type=type;g.articleIds=ids;g.sampleIds=samples;g.targetPrices=nextTargets;
    // Recipients cannot be removed implicitly; withdrawal is a separate action.
    mids.forEach(mid=>{if(!g.recipients.some(r=>r.manufacturerId===mid))g.recipients.push({manufacturerId:mid,answers:{},history:[],completedAt:null,publishedRevision:0,withdrawn:false});});
    sync(state,p);return g;
  }
  function sync(state,p){
    const g=p.projectRfq;if(!g)return;
    const lines=content(state,p,g.articleIds,g.sampleIds,g.targetPrices,g.type);
    const canonical=x=>JSON.stringify(x,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
    if(canonical(lines)===canonical(g.lines))return;
    g.history.push({revision:g.revision,type:g.type||'complete',at:now(),lines:copy(g.lines),recipients:copy(g.recipients)});g.revision++;g.lines=lines;
    for(const r of g.recipients){
      if(r.completedAt){r.history.push({at:now(),type:'request-changed',completedAt:r.completedAt,revision:r.completedRevision,answers:copy(r.answers)});r.completedAt=null;}
      if(r.publishedRevision)r.needsConfirmation=true;
    }
  }
  function status(g,r){
    const lines=g.lines.filter(l=>!l.sample);let offered=0,declined=0,total=0;
    for(const l of lines){const a=r.answers[l.key];if(a?.decision==='accepted'&&Number.isFinite(a.price)&&a.price>0){offered++;total+=l.area*l.quantity*a.price;}else if(a?.decision==='declined')declined++;}
    const missingDetails=lines.filter(l=>{const a=r.answers[l.key];return a?.decision==='accepted'&&(g.type==='preliminary'?!(Number.isFinite(a.productionWeeks)&&a.productionWeeks>0):g.answerRequirements&&(!a.scheduleConfirmed||a.scheduleRevision!==g.revision))||a?.decision==='declined'&&g.answerRequirements&&g.type!=='preliminary'&&!a.comment?.trim();}).length;
    const complete=Boolean(!missingDetails&&r.completedAt&&r.completedRevision===g.revision&&!r.withdrawn);
    return {totalKnown:lines.every(l=>Number.isFinite(l.area)&&l.area>0),offered,declined,count:lines.length,pending:lines.length-offered-declined+missingDetails,total:Math.round((total+Number.EPSILON)*100)/100,complete,full:offered===lines.length&&lines.length>0,label:r.withdrawn?'Återkallad':!r.publishedRevision?"Not sent":r.needsConfirmation?"Changed – confirmation required":complete?(offered===lines.length?"Completed · Fully quoted":"Completed · Partially quoted"):offered+declined?"Started":"Awaiting response"};
  }
  function validateLines(g){
    if(!g.lines.some(l=>!l.sample))throw Error("The RFQ contains no articles.");
    if(g.type==='preliminary'){if(g.lines.some(l=>!l.sample&&(!Number.isSafeInteger(l.quantity)||l.quantity<1)))throw Error("Enter an estimated quantity for each article.");return;}
    if(g.lines.some(l=>!l.sample&&(!Number.isFinite(l.area)||l.area<=0||!Number.isSafeInteger(l.quantity)||l.quantity<1||!l.phaseId||!l.deliveryDate||!l.productionStart||l.productionStart>l.deliveryDate)))throw Error("Cappelen needs to check BOM dimensions, phase, quantity, production start and delivery date.");
  }
  function publish(state,p,mid){
    if(!p.qualitySamples)p.projectRfq.sampleIds=p.projectRfq.articleIds.slice();sync(state,p);const g=p.projectRfq,r=recipient(g,mid);validateConfig(state,p,g.articleIds,[mid],g.sampleIds);validateLines(g);
    if(!state.manufacturers.some(m=>m.id===mid&&m.active!==false))throw Error("The manufacturer is inactive.");
    if(r.publishedRevision===g.revision&&!r.withdrawn)return;
    r.sentAt=now();r.publishedRevision=g.revision;r.withdrawn=false;r.history.push({type:'published',revision:g.revision,at:r.sentAt});
  }
  function editable(g,r){if(!r.publishedRevision||r.withdrawn)throw Error("The RFQ is not available.");if(r.completedAt)throw Error("The response has been submitted. Cappelen must reopen it for revision.");}
  function saveAnswer(state,p,mid,lineKey,values){
    sync(state,p);const g=p.projectRfq,r=recipient(g,mid);editable(g,r);
    if(values.revision!==g.revision)throw Error("The RFQ has changed. Open the current version before responding.");
    const l=g.lines.find(l=>l.key===lineKey&&!l.sample);if(!l)throw Error("The article row is missing.");
    if(!['pending','accepted','declined'].includes(values.decision))throw Error("Select a response status.");
    const price=values.decision==='accepted'?Number(values.price):null;
    if(values.decision==='accepted'&&(values.price===''||values.price==null||!Number.isFinite(price)||price<=0))throw Error("Enter a price greater than 0 EUR/m².");
    const productionWeeks=values.decision==='accepted'&&g.type==='preliminary'?Number(values.productionWeeks):null;
    if(values.decision==='accepted'&&g.type==='preliminary'&&(!Number.isFinite(productionWeeks)||productionWeeks<=0))throw Error("Enter production time in weeks, greater than 0.");
    if(values.decision==='declined'&&g.type!=='preliminary'&&g.answerRequirements&&!String(values.comment||'').trim())throw Error("Enter a comment explaining the decline.");
    if(r.answers[lineKey])r.history.push({at:now(),type:'answer',key:lineKey,answer:copy(r.answers[lineKey])});
    r.answers[lineKey]={decision:values.decision,price,productionWeeks,scheduleConfirmed:values.scheduleConfirmed===true,scheduleRevision:values.scheduleConfirmed===true?g.revision:null,currency:'EUR',comment:String(values.comment||'').slice(0,4000),updatedAt:now()};
  }
  function complete(state,p,mid,revision){
    sync(state,p);const g=p.projectRfq,r=recipient(g,mid);editable(g,r);
    if(revision!==g.revision)throw Error("The RFQ has changed. Review the new version.");
    validateLines(g);
    if(!g.lines.some(l=>!l.sample)||status(g,r).pending)throw Error(g.type==='preliminary'?"Enter a price and production time in weeks for each quoted article, or select Unable to quote.":"Enter a price and confirm the schedule for each quoted article, or decline with a comment.");
    r.completedAt=now();r.completedRevision=g.revision;r.needsConfirmation=false;r.history.push({type:'completed',at:r.completedAt,revision:g.revision,answers:copy(r.answers)});
  }
  function reopen(p,mid){const r=recipient(p.projectRfq,mid);if(!r.completedAt) return;r.history.push({type:'reopened',at:now(),completedAt:r.completedAt,answers:copy(r.answers)});r.completedAt=null;r.needsConfirmation=true;}
  function withdraw(p,mid){const r=recipient(p.projectRfq,mid);r.withdrawn=true;r.history.push({type:'withdrawn',at:now()});}
  // Explicit migration retains every old RFQ and selected-price snapshot.
  function adopt(state,p){
    if(p.projectRfq)return p.projectRfq;
    const old=state.rfqs.filter(r=>r.projectId===p.id);if(!old.length)return null;
    const ids=unique(old.map(r=>r.articleId)).filter(id=>state.articles.some(a=>a.id===id&&a.projectId===p.id));
    const mids=unique(old.map(r=>r.manufacturerId));
    if(!ids.length)return null;
    const samples=unique(old.filter(r=>S.sampleFor(state,r)?.required||r.requestSnapshot?.sample?.required).map(r=>r.articleId));
    // Historical recipients can be inactive. Preserve them without republishing.
    const id=S.uid('RFQ');p.projectRfq={id,number:'RFQ-'+new Date().getFullYear()+'-'+id.slice(4).toUpperCase(),createdAt:now(),revision:1,articleIds:ids,sampleIds:samples,lines:content(state,p,ids,samples),recipients:[],history:[],legacyIds:old.map(r=>r.id)};
    const g=p.projectRfq;
    for(const mid of mids){const rows=old.filter(r=>r.manufacturerId===mid),r={manufacturerId:mid,answers:{},history:[],publishedRevision:0,completedAt:null,withdrawn:false};
      for(const l of g.lines.filter(l=>!l.sample)){const prior=rows.filter(x=>x.articleId===l.articleId).at(-1);if(!prior)continue;
        let price=prior.price;if(prior.priceUnit==='per styck')price=price/l.area;
        const valid=prior.decision==='accepted'&&prior.currency==='EUR'&&['per styck','per m²'].includes(prior.priceUnit)&&Number.isFinite(price)&&price>0;
        r.answers[l.key]={decision:valid?'accepted':prior.decision==='declined'?'declined':'pending',price:valid?price:null,currency:'EUR',comment:prior.comment||'',legacyRfqId:prior.id};
      }g.recipients.push(r);
    }return g;
  }
  function preliminary(p){
    if(p.preliminaryRfq)return p.preliminaryRfq;
    if(p.projectRfq?.type==='preliminary')return null;
    const old=(p.projectRfq?.history||[]).filter(h=>h.type==='preliminary'&&h.recipients&&h.lines).at(-1);
    return old?{id:'preliminary:'+p.projectRfq.id,number:p.projectRfq.number,type:'preliminary',revision:old.revision,lines:copy(old.lines),recipients:copy(old.recipients),history:[],createdAt:old.at}:null;
  }
  function supplierView(state,mid){
    // Return an allowlist of supplier data; no customer, margin or other recipient fields.
    return state.projects.flatMap(p=>[preliminary(p),p.projectRfq].filter(Boolean).flatMap(g=>{const r=g.recipients.find(r=>r.manufacturerId===mid);if(!r?.publishedRevision||r.withdrawn)return [];return [{projectId:p.id,id:g.id,number:g.number,type:g.type||'complete',readOnly:g!==p.projectRfq,answerRequirements:g.answerRequirements,revision:g.revision,sentAt:r.sentAt,lines:copy(g.lines),answers:copy(r.answers),...status(g,r),completedAt:r.completedAt}];}));
  }
  function selectArticle(state,p,mid,articleId,fxRate=1){
    const g=p.projectRfq,r=recipient(g,mid);if(g.type==='preliminary')throw Error("Select a production price from a complete RFQ.");if(!status(g,r).complete)throw Error("The manufacturer must complete their response first.");
    const lines=g.lines.filter(l=>!l.sample&&l.articleId===articleId),a=state.articles.find(a=>a.id===articleId&&a.projectId===p.id);
    if(!a||!lines.length||lines.some(l=>r.answers[l.key]?.decision!=='accepted'))throw Error("The article must be quoted in every phase.");
    if(!Number.isFinite(Number(fxRate))||Number(fxRate)<=0)throw Error("Enter the exchange rate from EUR to the project currency.");
    const response=S.createRfq(state,p,a,mid);S.recordAnswer(state,response,{decision:'accepted',price:r.answers[lines[0].key].price,currency:'EUR',priceUnit:'per m²',fxRate:p.currency==='EUR'?1:Number(fxRate),status:'Godkänt'});
    response.phasePrices=Object.fromEntries(lines.map(l=>[l.phaseId,r.answers[l.key].price]));response.projectRfqId=g.id;response.projectRfqRevision=g.revision;S.selectResponse(state,response);return response;
  }
  window.CDPProjectRfq={preliminary,configure,sync,status,publish,saveAnswer,complete,reopen,withdraw,adopt,supplierView,selectArticle,recipient};
})();
/* Model-sample purchase orders. Sent specifications are immutable snapshots. */
(() => {
 const S=window.CDPStructure,copy=S.clone,now=()=>new Date().toISOString();
 const statuses=['Beställd','Skickad','Levererad'],reviews=['Inväntar bedömning','Godkänd','Ändring krävs'];
 function get(p,id){const o=(p.modelSampleOrders||[]).find(o=>o.id===id);if(!o)throw Error("The order is missing.");return o;}
 function draft(state,p,mid,values,id){
  const old=id?get(p,id):null;if(old?.sentAt)throw Error("A sent order cannot be changed. Create a new order.");
  if(!p.projectRfq?.recipients.some(r=>r.manufacturerId===mid)||!state.manufacturers.some(m=>m.id===mid&&m.active!==false))throw Error("Select an active manufacturer from the project's RFQ.");
  if(!values.lines?.length)throw Error("Select at least one article.");
  const seen=new Set();const lines=values.lines.map(v=>{const a=state.articles.find(a=>a.id===v.articleId&&a.projectId===p.id);if(!a||seen.has(a.id)||!p.projectRfq.articleIds.includes(a.id))throw Error("Select articles from the project's RFQ.");seen.add(a.id);
   const quantity=Number(v.quantity),price=v.price===''||v.price==null?null:Number(v.price);if(!Number.isSafeInteger(quantity)||quantity<1||price!==null&&(!Number.isFinite(price)||price<0))throw Error("Check the quantity and price.");
   return {articleId:a.id,article:copy({id:a.id,code:a.code||"",name:a.name,...S.specification(a)}),area:S.area(a),quantity,price,review:'Inväntar bedömning',comment:'',reviewHistory:[]};});
  const o={id:old?.id||S.uid('MS'),number:old?.number||'MS-'+new Date().getFullYear()+'-'+String((p.modelSampleSequence||0)+1).padStart(3,'0'),projectId:p.id,projectName:p.name,manufacturerId:mid,manufacturerName:state.manufacturers.find(m=>m.id===mid).name,createdAt:old?.createdAt||now(),status:'Utkast',currency:'EUR',deliveryAddress:String(values.deliveryAddress||'').trim(),contact:String(values.contact||'').trim(),deliveryDate:values.deliveryDate||'',instructions:String(values.instructions||''),lines,history:old?.history||[]};
  if(old)Object.assign(old,o);else{p.modelSampleSequence=(p.modelSampleSequence||0)+1;(p.modelSampleOrders||=[]).push(o);}return old||o;
 }
 function send(state,p,id){const o=get(p,id);if(o.sentAt)return o;
  if(!state.manufacturers.some(m=>m.id===o.manufacturerId&&m.active!==false))throw Error("The manufacturer is inactive.");
  if(!o.deliveryAddress||!o.contact||!/^\d{4}-\d{2}-\d{2}$/.test(o.deliveryDate)||new Date(o.deliveryDate).toISOString().slice(0,10)!==o.deliveryDate||o.lines.some(l=>!(l.area>0)||l.price===null))throw Error("Enter the hotel address, contact, valid delivery date, BOM dimensions and agreed unit price (0 is allowed).");
  o.sentAt=now();o.status='Beställd';o.history.push({at:o.sentAt,status:o.status});return o;
 }
 function progress(p,id,status){const o=get(p,id);if(!o.sentAt||!statuses.includes(status)||statuses.indexOf(status)<statuses.indexOf(o.status))throw Error("Invalid status change.");if(status!==o.status){o.status=status;o.history.push({at:now(),status});}return o;}
 function review(p,id,articleId,value,comment){const o=get(p,id),l=o.lines.find(l=>l.articleId===articleId);if(!o.sentAt||!l||!reviews.includes(value))throw Error("Invalid assessment.");l.review=value;l.comment=String(comment||'');l.reviewHistory.push({at:now(),review:value,comment:l.comment});}
 function supplier(state,mid){return state.projects.flatMap(p=>(p.modelSampleOrders||[]).filter(o=>o.manufacturerId===mid&&o.sentAt).map(copy));}
 window.CDPModelSamples={draft,send,get,progress,review,supplier,statuses,reviews};
})();
