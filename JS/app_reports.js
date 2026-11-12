const TYPES = { b2c: 'Sälj B2C', b2b: 'Sälj B2B', result: 'Resultaträkning', balance: 'Balansräkning', budget: 'Budget', forecast: 'Prognos' };
const MONTHS = ['Januari','Februari','Mars','April','Maj','Juni','Juli','Augusti','September','Oktober','November','December'];
export function validReportUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && /^[a-z0-9-]+\.sharepoint\.com$/i.test(u.hostname); } catch { return false; }
}
export function currentReportPeriod(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Stockholm',year:'numeric',month:'numeric'}).formatToParts(date);
  const year = Number(parts.find(p=>p.type==='year').value), month = Number(parts.find(p=>p.type==='month').value);
  return {year, month, quarter: Math.ceil(month / 3)};
}
export function latestReportPeriod(rows, types) {
  return rows.filter(r=>types.includes(r.report_type)).reduce((latest,r)=>!latest || r.year*12+r.period > latest.year*12+latest.month ? {year:r.year,month:r.period} : latest, null);
}
export function createReports({supabase, isAdmin}) {
  let host, year = currentReportPeriod().year, rows = [], loading = false, error = '', sequence = 0;
  let category = 'sales', mode = 'latest', annualYear = year;
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  function button(text, fn) { const b = el('button', text, 'secondary-button'); b.type = 'button'; b.onclick = fn; return b; }
  async function load() {
    const token = ++sequence; loading = true; error = ''; draw();
    try { const r = await supabase.from('planning_reports').select('*').order('year', {ascending:false}); if (r.error) throw r.error; if(token !== sequence)return; rows = r.data || []; }
    catch(e) { if(token !== sequence)return; rows = []; error = 'Rapporter kunde inte hämtas. '+e.message; }
    if(token !== sequence)return; loading = false; draw();
  }
  function edit(existing, preset = {}) {
    if (!isAdmin()) return;
    const previousFocus = document.activeElement;
    const dialog = el('dialog', undefined, 'reports-modal');
    const form = el('form'); dialog.append(form);
    form.append(el('h2', existing ? 'Redigera rapport' : 'Lägg till rapport'));
    function field(label, node) { const wrap = el('label',undefined,'detail-field'); wrap.append(el('span',label,'detail-field__label'),node); node.className = 'detail-field__control'; node.setAttribute('aria-label', label); form.append(wrap); return node; }
    function option(select, value, text) { const o = el('option',text); o.value=value; select.append(o); }
    const type = field('Rapporttyp',el('select')); Object.entries(TYPES).forEach(([k,v])=>option(type,k,v));
    const yy = field('År',el('input')); yy.type='number'; yy.min='2000'; yy.max='2100'; yy.required=true;
    const period = field('Period',el('select'));
    const name = field('Dokumentnamn',el('input')); name.required=true; name.maxLength=180;
    const url = field('SharePoint-länk',el('input')); url.type='url'; url.required=true; url.maxLength=4000;
    type.value=existing?.report_type || preset.report_type || 'b2c'; yy.value=existing?.year || preset.year || year;
    let automatic = !existing;
    function suggest() { if(automatic) name.value = `${TYPES[type.value]}${type.value==='budget'?'':type.value==='forecast'?' Q'+period.value:' – '+MONTHS[Number(period.value)-1].toLowerCase()} ${yy.value}`; }
    function periods(value) { period.replaceChildren(); if(type.value==='budget') option(period,0,'Helår'); else if(type.value==='forecast') [2,3,4].forEach(q=>option(period,q,'Q'+q)); else MONTHS.forEach((m,i)=>option(period,i+1,m)); if(value!==undefined)period.value=String(value); if(!period.value)period.selectedIndex=0; suggest(); }
    periods(existing?.period ?? preset.period); if(existing) { name.value=existing.document_name; url.value=existing.url; }
    name.oninput=()=>{automatic=false;}; type.onchange=()=>periods(); period.onchange=suggest; yy.oninput=suggest;
    const message=el('p'); message.setAttribute('role','alert'); form.append(message);
    const actions=el('div',undefined,'reports-actions'); form.append(actions);
    let busy=false;
    function close(){if(busy)return;dialog.close();dialog.remove();previousFocus?.focus();}
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    actions.append(button('Stäng',close));
    const save=el('button','Spara','primary-button'); save.type='submit'; actions.append(save);
    async function run(fn) { if(busy)return; busy=true; Array.from(form.elements).forEach(n=>n.disabled=true); message.textContent=''; try { await fn(); busy=false; close(); await load(); } catch(e) {message.textContent=e.code==='23505'?'En rapport finns redan för denna typ och period. Redigera den befintliga rapporten.':e.message;busy=false;Array.from(form.elements).forEach(n=>n.disabled=false);} }
    form.onsubmit=e=>{e.preventDefault(); if(!name.value.trim()){message.textContent='Ange ett dokumentnamn.';return;} if(!validReportUrl(url.value.trim())){message.textContent='Ange en HTTPS-länk till SharePoint.';return;}
      const values={report_type:type.value,year:Number(yy.value),period:Number(period.value),document_name:name.value.trim(),url:url.value.trim()};
      void run(async()=>{let q=supabase.from('planning_reports');q=existing?q.update(values).eq('id',existing.id):q.insert(values);const r=await q.select('id');if(r.error)throw r.error;if(!r.data?.length)throw Error('Inget sparades. Kontrollera behörigheten och ladda om.');if(['budget','forecast'].includes(values.report_type)){annualYear=values.year;category='annual';const now=currentReportPeriod();if(values.year!==now.year||(values.report_type==='forecast'&&values.period!==now.quarter))mode='all';}else{year=values.year;category=['b2c','b2b'].includes(values.report_type)?'sales':'economy';const latest=latestReportPeriod([...rows.filter(r=>r.id!==existing?.id),values],category==='sales'?['b2c','b2b']:['result','balance']);if(values.year!==latest.year||values.period!==latest.month)mode='all';}});
    };
    if(existing)actions.append(button('Ta bort rapport',()=>{if(confirm('Ta bort rapportlänken från Planning? Filen i SharePoint behålls.'))void run(async()=>{const r=await supabase.from('planning_reports').delete().eq('id',existing.id).select('id');if(r.error)throw r.error;if(!r.data?.length)throw Error('Rapporten kunde inte tas bort. Ladda om och försök igen.');});}));
    document.body.append(dialog);dialog.showModal();name.focus();
  }
  function slot(type, period, reportYear) {
    const wrap=el('div',undefined,'reports-slot'); const row=rows.find(r=>r.year===reportYear&&r.report_type===type&&r.period===period);
    if(row) { if(validReportUrl(row.url)){const a=el('a',row.document_name);a.href=row.url;a.target='_blank';a.rel='noopener noreferrer';wrap.append(a);}else wrap.append(el('span','Ogiltig länk'));
      if(isAdmin()){const b=button('⋯',()=>edit(row));b.setAttribute('aria-label','Redigera '+row.document_name);wrap.append(b);}
    } else {if(!isAdmin())wrap.append(el('span','—')); if(isAdmin()){wrap.classList.add('reports-slot--empty');const b=button('+',()=>edit(null,{report_type:type,period,year:reportYear}));b.setAttribute('aria-label',`Lägg till ${TYPES[type]} ${period}`);wrap.append(b);}}
    return wrap;
  }
  function selectControl(label, choices, value, change) {
    const wrap=el('label',label+' '), select=el('select'); select.className='detail-field__control';select.setAttribute('aria-label',label);
    choices.forEach(([v,text])=>{const o=el('option',text);o.value=v;select.append(o);});select.value=value;select.onchange=()=>change(select.value);wrap.append(select);return wrap;
  }
  function yearControl(label,value,change) {
    const now=currentReportPeriod().year;const years=[...new Set([value,now-1,now,now+1,...rows.map(r=>r.year)])].sort((a,b)=>b-a);
    return selectControl(label,years.map(y=>[y,y]),value,v=>{change(Number(v));draw();});
  }
  function draw() {
    if(!host)return;host.replaceChildren();const now=currentReportPeriod();
    const types=category==='sales'?['b2c','b2b']:['result','balance'];
    const latest=latestReportPeriod(rows,types), reportYear=mode==='latest'?latest?.year:year;
    const budgetYear=mode==='latest'?now.year:annualYear;
    const header=el('div',undefined,'view-card__header');header.append(el('h1','Rapporter','view-card__title'));
    const controls=el('div',undefined,'reports-actions');
    controls.append(selectControl('Rapport',[['sales','Sales'],['economy','Economy'],['annual','Budget/Prognos']],category,v=>{category=v;draw();}),selectControl('Visa',[['latest','Senaste'],['all','Alla']],mode,v=>{mode=v;draw();}));
    if(mode==='all')controls.append(yearControl('År',category==='annual'?annualYear:year,v=>{if(category==='annual')annualYear=v;else year=v;}));
    if(isAdmin()&&!loading&&!error)controls.append(button('Lägg till rapport',()=>edit(null,category==='annual'?{report_type:'budget',year:budgetYear,period:0}:{report_type:types[0],year:reportYear||now.year,period:mode==='latest'?(latest?.month||now.month):1})));
    header.append(controls);host.append(header);
    const body=el('div',undefined,'reports-body');host.append(body);
    if(loading){body.append(el('p','Hämtar rapporter…'));return;}if(error){const p=el('p',error);p.setAttribute('role','alert');body.append(p,button('Försök igen',()=>void load()));return;}
    if(category==='annual') {
      const annual=el('div',undefined,'reports-annual'),budget=el('section');budget.append(el('h2','Budget '+budgetYear),slot('budget',0,budgetYear));
      const forecast=el('section');forecast.append(el('h2','Prognos '+budgetYear),el('p','Reviderad helårsbudget'));
      const quarters=mode==='latest'?(now.quarter>=2?[now.quarter]:[]):[2,3,4];
      if(!quarters.length)forecast.append(el('p','Prognoser börjar i Q2. Under Q1 gäller årets budget.'));
      quarters.forEach(q=>{const row=el('div');row.append(el('h3','Q'+q),slot('forecast',q,budgetYear));forecast.append(row);});annual.append(budget,forecast);body.append(annual);return;
    }
    if(mode==='latest'&&!latest){body.append(el('p','Inga rapporter publicerade ännu.'));return;}
    const scroll=el('div',undefined,'reports-scroll'),table=el('table',undefined,'reports-table'),head=el('thead'),tr=el('tr');
    ['Månad',...types.map(t=>TYPES[t])].forEach(s=>{const th=el('th',s);th.scope='col';tr.append(th);});head.append(tr);table.append(head);
    const tbody=el('tbody');const months=mode==='latest'?[latest.month]:MONTHS.map((_,i)=>i+1);
    months.forEach(month=>{const r=el('tr'),th=el('th',MONTHS[month-1]+' '+reportYear);th.scope='row';r.append(th);types.forEach(t=>{const td=el('td');td.append(slot(t,month,reportYear));r.append(td);});tbody.append(r);});table.append(tbody);scroll.append(table);body.append(scroll);
  }
  return {createView(){host=el('section',undefined,'view-card reports-view');void load();return host;}};
}
