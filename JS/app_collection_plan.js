const MONTHS = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Aug','Sep','Okt','Nov','Dec'];
export function weekMonth(year, week) {
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) throw Error('Ange en giltig vecka.');
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(+jan4 + (1 - (jan4.getUTCDay() || 7) + (week - 1) * 7) * 86400000);
  const thursday = new Date(+monday + 3 * 86400000);
  if (thursday.getUTCFullYear() !== year) throw Error('Veckan finns inte under valt år.');
  return monday.getUTCFullYear() < year ? 1 : monday.getUTCMonth() + 1;
}
export function safeFileUrl(value) {
  if (!value.trim()) return '';
  const url = new URL(value.trim());
  if (!['https:', 'http:'].includes(url.protocol)) throw Error('Använd en https- eller http-länk.');
  return url.href;
}
export function createCollectionPlan({supabase, uploadImage, imageUrl}) {
  let collections = [], entries = [], host, loading = false;
  function el(tag, text, cls) {
    const n = document.createElement(tag); if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls; if (tag === 'button') n.type = 'button'; return n;
  }
  function button(text, fn, cls = 'secondary-button') { const b = el('button', text, cls); b.onclick = fn; return b; }
  function field(form, label, type = 'text', value = '') {
    const wrap = el('label', undefined, 'detail-field');
    const input = el(type === 'textarea' ? 'textarea' : 'input', undefined, 'detail-field__control');
    if (type !== 'textarea') input.type = type;
    input.value = value; input.setAttribute('aria-label', label);
    wrap.append(el('span', label, 'detail-field__label'), input); form.append(wrap); return input;
  }
  function modal(title) {
    const overlay = el('div', undefined, 'overlay-modal cp-overlay');
    const panel = el('section', undefined, 'side-panel cp-modal'); panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true'); panel.setAttribute('aria-label', title);
    const header = el('div', undefined, 'side-panel__header'); const form = el('form', undefined, 'side-panel__body');
    const actions = el('div', undefined, 'side-panel__header-actions');
    const error = el('p'); error.setAttribute('role','alert');
    let busy = false; const previous = document.activeElement;
    const close = () => { if (!busy) { overlay.remove(); if (previous?.isConnected) previous.focus(); } };
    actions.append(button('Avbryt',close)); header.append(el('h2',title,'side-panel__title'),actions);
    panel.append(header,form,error); overlay.append(panel); document.body.append(overlay);
    overlay.onkeydown = event => {
      if (event.key === 'Escape') { event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const nodes = [...panel.querySelectorAll('button,input,textarea,select,a[href]')].filter(n=>!n.disabled);
        if (!nodes.length) return;
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
      }
    };
    const run = async operation => {
      if (busy) return;
      busy = true; error.textContent = ''; const controls = [...panel.querySelectorAll('button,input,textarea,select')]; controls.forEach(n=>n.disabled=true);
      try { await operation(); busy=false; close(); await load(); }
      catch (err) { error.textContent = err.code === '23505' ? 'Det finns redan ett möte i månaden, eller en Collection för detta år. Ladda om och försök igen.' : err.message; }
      finally { busy=false; controls.forEach(n=>n.disabled=false); }
    };
    return {form,actions,error,close,run};
  }
  async function save(table, item, payload) {
    const query = supabase.from(table);
    const {error} = await (item?.id ? query.update(payload).eq('id',item.id) : query.insert(payload)).select('id').single();
    if (error) throw error;
  }
  function collectionEditor(item) {
    const m = modal(item ? 'Collection' : 'Ny Collection');
    const year = field(m.form,'År','number',item?.year || new Date().getFullYear()+1); year.min=2000;year.max=2199;year.required=true;
    // Year cannot change once planned entries exist, to avoid silently moving meetings.
    if (item && entries.some(e=>e.collection_id===item.id)) year.readOnly=true;
    const name = field(m.form,'Namn','text',item?.name || `Collection ${year.value}`);name.required=true;name.maxLength=80;
    year.oninput=()=>{name.value=`Collection ${year.value}`;};
    m.actions.append(button('Save',()=>m.form.requestSubmit()));
    m.form.onsubmit=e=>{e.preventDefault();void m.run(async()=>{
      const slot=item?.slot || [1,2,3].find(slot=>!collections.some(c=>c.slot===slot));
      if (!slot || (!item && collections.length>=3)) throw Error('Max tre Collections kan visas.');
      if (!name.value.trim()) throw Error('Ange ett namn.');
      await save('planning_collection_plan',item,{slot,year:Number(year.value),name:name.value.trim()});
    });};
    if (item) {
      const danger=el('div',undefined,'cp-delete-section');
      danger.append(button('Ta bort Collection',()=>{
        const items=entries.filter(e=>e.collection_id===item.id);
        const meetings=items.filter(e=>e.kind==='meeting').length;
        const activities=items.filter(e=>e.kind==='activity').length;
        if (!confirm(`Ta bort ${item.name} och dess ${meetings} möten och ${activities} aktiviteter? Detta går inte att ångra.`)) return;
        void m.run(async()=>{
          const {error}=await supabase.rpc('planning_delete_collection_plan',{
            p_collection_id:item.id,p_meetings:meetings,p_activities:activities,
          });
          if(error)throw error;
        });
      },'secondary-button cp-delete-button'));
      m.form.append(danger);
    }
    name.focus();
  }
  function commentEditor(item) {
    const m=modal('Kommentar');const comment=field(m.form,'Kommentar','textarea',item.comment||'');comment.rows=10;
    m.actions.append(button('Save',()=>m.form.requestSubmit()));
    m.form.onsubmit=e=>{e.preventDefault();void m.run(()=>save('planning_collection_plan_items',item,{comment:comment.value}));};comment.focus();
  }
  function editor(collection, month, kind, item) {
    const m=modal(kind==='meeting'?'Möte – '+collection.name:'Aktivitet – '+collection.name);
    let meetingName, week, image, link, linkName, comment, text, pendingImage=null, removeImage=false;
    if(kind==='meeting') {
      meetingName=field(m.form,'Mötesnamn','text',item?.meeting_name||'');meetingName.required=true;meetingName.maxLength=120;
      let initialWeek=item?.week;
      if(!initialWeek) for(let w=1;w<=53;w++){try{if(weekMonth(collection.year,w)===month){initialWeek=w;break;}}catch{}}
      week=field(m.form,`Vecka (${collection.year})`,'number',initialWeek||1);week.min=1;week.max=53;week.required=true;
      const hint=el('p',undefined,'side-panel__text');m.form.append(hint);
      const updateHint=()=>{try{hint.textContent='Placeras i '+MONTHS[weekMonth(collection.year,Number(week.value))-1]+'. Veckans måndag styr månaden.';}catch(e){hint.textContent=e.message;}};week.oninput=updateHint;updateHint();
      image=field(m.form,'Bild','file');image.accept='image/png,image/jpeg,image/webp,image/gif';
      const preview=el('img',undefined,'cp-preview');preview.alt='Mötesbild';preview.hidden=true;m.form.append(preview);
      if(item?.image_path) void imageUrl(item.image_path).then(url=>{if(preview.isConnected&&!pendingImage&&!removeImage){preview.src=url;preview.hidden=!url;}}).catch(()=>{});
      const pick=file=>{
        if(!file)return;
        if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>10*1024*1024){m.error.textContent='Välj PNG, JPEG, WebP eller GIF, högst 10 MB.';return;}
        pendingImage=file;removeImage=false;const reader=new FileReader();reader.onload=()=>{preview.src=reader.result;preview.hidden=false;};reader.readAsDataURL(file);
      };
      image.onchange=()=>pick(image.files[0]);
      m.form.addEventListener('paste',e=>{const file=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();pick(file);}});
      m.form.append(button('Ta bort bild',()=>{pendingImage=null;removeImage=true;image.value='';preview.hidden=true;}));
      linkName=field(m.form,'Länknamn','text',item?.link_name||'');linkName.maxLength=120;
      link=field(m.form,'Länk till fil','url',item?.file_url||'');
      comment=field(m.form,'Kommentar','textarea',item?.comment||'');comment.rows=4;
    } else {text=field(m.form,'Aktivitet','textarea',item?.text||'');text.required=true;text.rows=4;}
    m.actions.append(button('Save',()=>m.form.requestSubmit()));
    m.form.onsubmit=e=>{e.preventDefault();void m.run(async()=>{
      const payload={collection_id:collection.id,kind,month};
      if(kind==='meeting') {
        payload.meeting_name=meetingName.value.trim();
        if(!payload.meeting_name)throw Error('Ange ett mötesnamn.');
        payload.week=Number(week.value);payload.month=weekMonth(collection.year,payload.week);
        if(entries.some(e=>e.collection_id===collection.id&&e.kind==='meeting'&&e.month===payload.month&&e.id!==item?.id))throw Error('Det finns redan ett möte i denna månad.');
        payload.file_url=safeFileUrl(link.value);payload.link_name=linkName.value.trim();payload.comment=comment.value;
        if(payload.file_url&&!payload.link_name)throw Error('Ange ett namn på fillänken.');
        payload.image_path=removeImage?'':item?.image_path||'';
        if(pendingImage){payload.image_path=await uploadImage(pendingImage);pendingImage=null;item={...item,image_path:payload.image_path};}
      } else {payload.text=text.value.trim();if(!payload.text)throw Error('Skriv en aktivitet.');}
      await save('planning_collection_plan_items',item,payload);
    });};
    if(item?.id)m.actions.append(button('Ta bort',()=>{if(confirm('Ta bort posten?'))void m.run(async()=>{
      const {error}=await supabase.from('planning_collection_plan_items').delete().eq('id',item.id).select('id').single();if(error)throw error;
    });}));
    (meetingName||text).focus();
  }
  function choose(collection,month) {
    const m=modal(`${collection.name} – ${MONTHS[month-1]}`);
    if(!entries.some(e=>e.collection_id===collection.id&&e.month===month&&e.kind==='meeting'))m.form.append(button('Möte',()=>{m.close();editor(collection,month,'meeting');}));
    m.form.append(button('Aktivitet',()=>{m.close();editor(collection,month,'activity');}));m.form.querySelector('button').focus();
  }
  function showImage(url) {
    const previous=document.activeElement;
    const viewer=el('div',undefined,'cp-image-viewer');
    viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label','Mötesbild');
    const close=()=>{viewer.remove();if(previous?.isConnected)previous.focus();};
    const img=el('img');img.src=url;img.alt='Mötesbild i förstoring';
    const dismiss=button('Stäng',close,'secondary-button');
    viewer.append(img,dismiss);document.body.append(viewer);dismiss.focus();
    viewer.onclick=close;
    viewer.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){e.preventDefault();dismiss.focus();}};
  }
  function draw() {
    if(!host?.isConnected)return;host.replaceChildren();
    const header=el('div',undefined,'view-card__header');header.append(el('h1','Collection Plan','view-card__title'));
    const actions=el('div',undefined,'side-panel__header-actions');const add=button('+ Collection',()=>collectionEditor());add.disabled=collections.length>=3||loading;
    actions.append(add);header.append(actions);host.append(header);
    const table=el('table',undefined,'cp-table');const head=el('tr');
    for(const title of ['Collection',...MONTHS]){const th=el('th',title);th.scope='col';head.append(th);}const thead=el('thead');thead.append(head);table.append(thead);
    const tbody=el('tbody');
    for(const collection of collections){
      const row=el('tr');const title=el('th');title.scope='row';title.append(button(collection.name,()=>collectionEditor(collection),'cp-name'));row.append(title);
      for(let month=1;month<=12;month++){
        const cell=el('td');const items=entries.filter(e=>e.collection_id===collection.id&&e.month===month).sort((a,b)=>a.kind===b.kind?String(a.created_at).localeCompare(String(b.created_at)):a.kind==='meeting'?-1:1);
        const content=el('div',undefined,'cp-cell');
        for(const item of items){
          if(item.kind==='activity'){content.append(button(item.text,()=>editor(collection,month,'activity',item),'cp-activity'));continue;}
          const card=el('article',undefined,'cp-meeting');
          const name=button(item.meeting_name||'Möte',()=>editor(collection,month,'meeting',item),'cp-meeting-name');
          name.title=item.meeting_name||'Lägg till mötesnamn';card.append(name);
          const open=button(`${collection.year}–v${String(item.week).padStart(2,'0')} ✎`,()=>editor(collection,month,'meeting',item),'cp-meeting-open');
          open.title='Redigera möte';open.setAttribute('aria-label',`Redigera möte – ${collection.name} vecka ${item.week}`);card.append(open);
          if(item.image_path){
            const zoom=button('',()=>{},'cp-image-button');zoom.title='Förstora bild';zoom.setAttribute('aria-label','Förstora mötesbild');zoom.disabled=true;
            const img=el('img');img.alt='Mötesbild';zoom.append(img);card.append(zoom);
            void imageUrl(item.image_path).then(url=>{if(zoom.isConnected&&url){img.src=url;zoom.disabled=false;zoom.onclick=()=>showImage(url);}}).catch(()=>{img.alt='Bilden kunde inte läsas';});
          } else card.append(el('span','Bild','cp-no-image'));
          if(item.file_url){try{const a=el('a',item.link_name||'Fil');a.href=safeFileUrl(item.file_url);a.target='_blank';a.rel='noopener noreferrer';a.title=item.link_name;card.append(a);}catch{}}
          const comment=button(item.comment||'Kommentar',()=>commentEditor(item),'cp-comment');comment.title=item.comment||'Skriv kommentar';card.append(comment);content.append(card);
        }
        const add=button('+',()=>choose(collection,month),'cp-add');add.setAttribute('aria-label',`Lägg till – ${collection.name} ${MONTHS[month-1]}`);content.append(add);
        cell.onclick=e=>{if(e.target===cell||e.target===content)choose(collection,month);};cell.append(content);row.append(cell);
      }tbody.append(row);
    }table.append(tbody);host.append(table);
    if(!collections.length)host.append(el('p','Lägg till en Collection för att börja planera.','empty-state'));
  }
  async function load() {
    if(loading)return;loading=true;
    try {
      const results=await Promise.all([supabase.from('planning_collection_plan').select('*').order('year'),supabase.from('planning_collection_plan_items').select('*').order('created_at')]);
      for(const r of results)if(r.error)throw r.error;
      collections=results[0].data||[];entries=results[1].data||[];draw();
    } catch(err){if(host?.isConnected){host.replaceChildren(el('p','Collection Plan kunde inte läsas: '+err.message),button('Försök igen',()=>load()));}}
    finally{loading=false;if(host?.isConnected){const b=[...host.querySelectorAll('button')].find(b=>b.textContent==='+ Collection');if(b)b.disabled=collections.length>=3;}}
  }
  return {createView(){host=el('section',undefined,'view-card cp-view');host.append(el('p','Läser Collection Plan…'));setTimeout(()=>load(),0);return host;}};
}
