/* Cappelen Dimyr Projects v6: additive migration and phase calculations. */
(() => {
  'use strict';
  const clone = x => JSON.parse(JSON.stringify(x));
  const uid = prefix => prefix + '-' + crypto.randomUUID();
  const today = () => new Date().toLocaleDateString('sv-SE');
  const defaults = () => ({deliveryTerm:'DAP', freightCost:0, customerFreight:0, dutyCost:0, importVatCost:0, otherImportCost:0, otherDeliveryCost:0, includeImportVatInCost:false, freightPresentation:'Separat rad'});
  function migrate(s) {
    const first = Number(s.schemaVersion || 0) < 6;
    for (const k of ['leads','projects','articles','quotations','inquiries','manufacturers','meetings','rfqs']) if (!Array.isArray(s[k])) s[k]=[];
    if (first) {
      s.inquiries.forEach(i => {
        let l=s.leads.find(l=>l.id===i.sourceLeadId || l.inquiryId===i.id || l.legacyInquiryId===i.id);
        if (!l) { l={id:'L-MIG-'+i.id, name:i.project, createdAt:i.received, comments:i.description||''}; s.leads.push(l); }
        l.legacyInquiryId=i.id;
        l.customer=l.customer||i.customer; l.country=l.country||i.country;
        for(const k of ['customerData','preliminaryScope','designFiles','history']) if(l[k]==null) l[k]=clone(i[k]|| (k==='customerData'?{}:[]));
        for(const k of ['value','currency','probability','agent','expectedStart','description']) if(l[k]==null) l[k]=i[k];
        const p=s.projects.find(p=>p.id===i.projectId || p.sourceInquiryId===i.id || (i.status==='Go' && p.name===i.project && p.customer===i.customer));
        if(p){l.projectId=p.id;p.sourceLeadId=l.id;l.status='Go';} else l.status=i.status==='No Go'?'No Go':'Aktivt';
      });
      s.leads.forEach(l=>{if(l.status==='Konverterat')l.status=l.projectId?'Go':'Aktivt';});
    }
    s.projects.forEach(p=>{
      if(!Array.isArray(p.phases)) p.phases=[{id:'PH-'+p.id+'-1',name:"Phase 1",productionStart:'',deliveryDate:p.deliveryDate||'',items:s.articles.filter(a=>a.projectId===p.id).map(a=>({articleId:a.id,quantity:Number(a.quantity)||1})),calculation:{...defaults(),...clone(p.calculation||{})}}];
      p.phases.forEach(ph=>{if(!Array.isArray(ph.items))ph.items=[];ph.calculation={...defaults(),...(ph.calculation||{})};});
      p.calculation={targetMargin:45,validityDays:30,paymentTerms:"50% on order / 50% before delivery",...(p.calculation||{})};
    });
    s.articles.forEach(a=>{if(!Array.isArray(a.bom))a.bom=[];if(a.specification==null)a.specification='';});
    s.schemaVersion=6;
    return s;
  }
  function go(s,id){
    const l=s.leads.find(l=>l.id===id);if(!l)throw Error("The lead is missing.");
    let p=s.projects.find(p=>p.id===l.projectId || p.sourceLeadId===id);
    if(!p){
      const c=clone(l.customerData||{}),b=c.billing||{...c,name:c.name||l.customer||''};
      const year=String(new Date().getFullYear()).slice(-2),prefix='P-'+year+'-';
      const number=Math.max(0,...s.projects.map(p=>p.id.startsWith(prefix)?Number(p.id.slice(prefix.length))||0:0))+1;
      p={id:window.CDPRemote?crypto.randomUUID():prefix+String(number).padStart(4,'0'),sourceLeadId:id,phases:[],name:l.name,customer:l.customer||b.name||'',country:l.country||'',currency:l.currency||'EUR',value:Number(l.value)||0,probability:Number(l.probability)||20,owner:'DE',phase:'Kalkyl',businessStatus:'Aktivt',next:"Plan articles and phases",agent:l.agent||'',customerData:{sameAsBilling:c.sameAsBilling!==false,billing:b,delivery:c.delivery||clone(b)},preliminaryScope:clone(l.preliminaryScope||[]),designFiles:clone(l.designFiles||[]),createdAt:today()};
      s.projects.unshift(p);migrate(s);
    }
    l.projectId=p.id;l.status='Go';l.convertedAt=today();
    return p;
  }
  function area(a){return a.shape==='Specialform'?Number(a.manualArea)||0:a.shape==='Rund'?Math.PI*Math.pow(Number(a.widthCm)/200,2):(Number(a.widthCm)||0)*(Number(a.lengthCm)||0)/10000;}
  function price(a){return a.selectedPrice?{...a.selectedPrice,pricePerSqm:a.selectedPrice.price}:a;}
  const cents=n=>Math.round((n+Number.EPSILON)*100)/100;
  function calculate(s,p){
    const errors=[],warnings=[];
    const margin=Number(p.calculation?.targetMargin ?? 45);
    if(!Number.isFinite(margin)||margin<0||margin>=100)errors.push("Margin must be at least 0 and less than 100%.");
    const counts=new Map();
    (p.phases||[]).forEach(ph=>ph.items.forEach(i=>counts.set(i.articleId,(counts.get(i.articleId)||0)+Number(i.quantity))));
    s.articles.filter(a=>a.projectId===p.id).forEach(a=>{if(!counts.has(a.id))warnings.push(a.name+": not assigned to any phase.");});
    const phases=(p.phases||[]).map(ph=>{
      const c={...defaults(),...ph.calculation};
      if(!ph.deliveryDate)warnings.push(ph.name+": delivery date missing.");
      if(ph.productionStart&&ph.deliveryDate&&ph.productionStart>ph.deliveryDate)errors.push(ph.name+": production start is after delivery.");
      const items=ph.items.map(i=>{
        const a=s.articles.find(a=>a.id===i.articleId&&a.projectId===p.id);
        if(!a){errors.push(ph.name+": article missing.");return null;}
        const selected=price(a),r=selected.phasePrices?{...selected,pricePerSqm:selected.phasePrices[ph.id]}:selected,qty=Number(i.quantity),rate=r.currency&&r.currency!==p.currency?Number(r.fxRate):1;
        if(!Number.isFinite(qty)||qty<=0)errors.push(a.name+": quantity must be greater than 0.");
        if(!Number.isFinite(rate)||rate<=0)errors.push(a.name+": enter the exchange rate to "+p.currency+'.');
        if(!Number.isFinite(Number(r.pricePerSqm))||Number(r.pricePerSqm)<0)errors.push(a.name+": invalid production price.");
        if(r.status!=='Godkänt')warnings.push(a.name+": production price is not approved.");
        if(Number(r.moq)>Number(counts.get(a.id)))warnings.push(a.name+": total quantity is below MOQ "+r.moq+'.');
        const unit=r.priceUnit||'per m²';
        // Legacy fixed prices represent the complete article quantity; allocate once across phases.
        const base=Number(r.pricePerSqm)||0;
        const cost=(unit==='fast pris'?(base+(Number(a.additionalCost)||0))*qty/counts.get(a.id):((unit==='per m²'?area(a)*base:base)+(Number(a.additionalCost)||0))*qty)*(rate||0);
        return {...clone(a),articleId:a.id,quantity:qty,area:area(a),totalArea:area(a)*qty,manufacturer:r.manufacturer||a.manufacturer,pricePerSqm:base,priceUnit:unit,cost,unitCost:cost/qty,phaseId:ph.id};
      }).filter(Boolean);
      for(const k of ['freightCost','customerFreight','dutyCost','importVatCost','otherImportCost','otherDeliveryCost'])if(!Number.isFinite(Number(c[k]))||Number(c[k])<0)errors.push(ph.name+": invalid delivery cost.");
      const productionCost=items.reduce((n,a)=>n+a.cost,0),freightCost=Number(c.freightCost)||0;
      const dutyCost=c.deliveryTerm==='DDP'?Number(c.dutyCost)||0:0,importVatCost=c.deliveryTerm==='DDP'&&c.includeImportVatInCost?Number(c.importVatCost)||0:0,otherImportCost=c.deliveryTerm==='DDP'?Number(c.otherImportCost)||0:0;
      const totalCost=productionCost+freightCost+dutyCost+importVatCost+otherImportCost+(Number(c.otherDeliveryCost)||0);
      const salesPrice=cents(totalCost/(1-margin/100));
      const freightShown=c.freightPresentation==='Separat rad'?Number(c.customerFreight)||0:0;
      if(freightShown>salesPrice)errors.push(ph.name+": freight charged exceeds the phase quotation price.");
      if(!items.length&&salesPrice>freightShown)errors.push(ph.name+": add articles to allocate the quotation price.");
      let allocated=0;items.forEach((a,index)=>{a.salesTotal=index===items.length-1?cents(salesPrice-freightShown-allocated):cents((salesPrice-freightShown)*(productionCost?a.cost/productionCost:1/items.length));allocated+=a.salesTotal;a.salesUnit=a.salesTotal/a.quantity;});
      return {...clone(ph),items,calculation:c,productionCost,freightCost,dutyCost,importVatCost,otherImportCost,totalCost,salesPrice,freightShown};
    });
    const sum=k=>phases.reduce((n,p)=>n+p[k],0);
    // Reconcile the final cent against the project formula, not a sum of rounded phases.
    const correction=cents(cents(sum('totalCost')/(1-margin/100))-sum('salesPrice'));
    const last=phases.filter(ph=>ph.items.length).at(-1);
    if(last && correction){last.salesPrice=cents(last.salesPrice+correction);const item=last.items.at(-1);item.salesTotal=cents(item.salesTotal+correction);item.salesUnit=item.salesTotal/item.quantity;}
    return {phases,productionCost:sum('productionCost'),freightCost:sum('freightCost'),dutyCost:sum('dutyCost'),importVatCost:sum('importVatCost'),otherImportCost:sum('otherImportCost'),totalCost:sum('totalCost'),salesPrice:cents(sum('salesPrice')),grossProfit:sum('salesPrice')-sum('totalCost'),margin,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
  }
  function snapshot(s,p){const pc=calculate(s,p);if(pc.errors.length)throw Error(pc.errors.join('\n'));if(!pc.phases.some(ph=>ph.items.length))throw Error("Add articles to at least one phase.");return {projectId:p.id,project:p.name,currency:p.currency||'EUR',amount:pc.salesPrice,margin:pc.margin,status:'Utkast',created:today(),articleSnapshots:clone(pc.phases.flatMap(ph=>ph.items)),phaseSnapshots:clone(pc.phases),calculationSnapshot:clone(p.calculation),costSnapshot:clone(pc),companySnapshot:clone(s.company||{}),customerSnapshot:clone(p.customerData||{})};}
  function createProject(s,v){
    const name=String(v.name||'').trim();if(!name)throw Error("Enter a project name.");
    const value=Number(v.value||0),probability=Number(v.probability??20);
    if(!Number.isFinite(value)||value<0||!Number.isFinite(probability)||probability<0||probability>100)throw Error("Check the value and probability.");
    const prefix='P-'+String(new Date().getFullYear()).slice(-2)+'-';
    const n=Math.max(0,...s.projects.map(p=>p.id.startsWith(prefix)?Number(p.id.slice(prefix.length))||0:0))+1;
    const customer=String(v.customer||'').trim(),country=String(v.country||'').trim();
    const billing={name:customer,country,address:'',zip:'',city:'',vatNumber:'',contact:'',email:''};
    const p={id:window.CDPRemote?crypto.randomUUID():prefix+String(n).padStart(4,'0'),name,customer,country,currency:v.currency||'EUR',value,probability,owner:v.owner||'DE',phase:'Kalkyl',businessStatus:'Aktivt',next:"Plan articles and phases",createdAt:today(),createdDirectly:true,phases:[],description:v.description||'',customerData:{sameAsBilling:true,billing,delivery:{...billing,phone:''}},preliminaryScope:[],designFiles:[]};
    s.projects.unshift(p);migrate(s);return p;
  }
  function loseProject(s,id,v){
    const p=s.projects.find(p=>p.id===id);if(!p)throw Error("The project is missing.");
    if(p.businessStatus==='Vunnet'||p.phase==='Vunnet'||s.quotations.some(q=>q.projectId===id&&q.status==='Accepterad'))throw Error("An accepted project cannot be marked as lost.");
    if(p.businessStatus==='Förlorat')return p;
    const reason=String(v.reason||'').trim(),lostAt=v.lostAt||today();if(!reason)throw Error("Enter the reason for the loss.");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(lostAt)||Number.isNaN(Date.parse(lostAt)))throw Error("Enter a valid date.");
    p.beforeLoss={phase:p.phase,probability:p.probability,next:p.next};
    Object.assign(p,{businessStatus:'Förlorat',phase:'Förlorat',probability:0,lostAt,lossReason:reason,lossComment:String(v.comment||'').trim(),next:"Lost: "+reason});
    p.history=p.history||[];p.history.push({status:'Förlorat',date:lostAt,reason,comment:p.lossComment});
    s.quotations.filter(q=>q.projectId===id).forEach(q=>{if(['Skickad','Revidering begärd'].includes(q.status))q.status='Avböjd';else if(['Utkast','Intern granskning'].includes(q.status))q.status='Återkallad';});
    return p;
  }
  function reopenProject(s,id){const p=s.projects.find(p=>p.id===id);if(!p)throw Error("The project is missing.");if(p.businessStatus!=='Förlorat')return p;const old=p.beforeLoss||{};Object.assign(p,{businessStatus:'Aktivt',phase:['Kalkyl','Offert skickad','Förhandling'].includes(old.phase)?old.phase:'Kalkyl',probability:old.probability??20,next:old.next||"Planera next steg"});p.history=p.history||[];p.history.push({status:'Aktivt',date:today(),note:"Reactivated"});return p;}
  window.CDPStructure={migrate,go,calculate,snapshot,area,price,uid,today,defaults,clone,createProject,loseProject,reopenProject};
})();
