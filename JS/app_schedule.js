const DAY_NAMES=['Mån','Tis','Ons','Tor','Fre'];
const LABELS={office:'Kontoret',off:'Ledig',remote:'Distans',pending:'Ansökt',approved:'Semester',rejected:'Avslagen',cancelled:'Återkallad'};
export function addDays(day,count){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+count);return d.toISOString().slice(0,10);}
export function mondayOf(day){const d=new Date(day+'T12:00:00Z');return addDays(day,1-(d.getUTCDay()||7));}
export function weekLabel(day){const d=new Date(addDays(mondayOf(day),3)+'T12:00:00Z');const year=d.getUTCFullYear();const first=mondayOf(year+'-01-04');return `${year} · Vecka ${1+Math.round((Date.parse(mondayOf(day))-Date.parse(first))/604800000)}`;}
export function dayPresentation(base,leave){return base==='off'?'off':leave?.status||base||'office';}
export function createSchedule({supabase}){
 let host,week=mondayOf(today()),data=null,busy=false,sequence=0;
 function today(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
 function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;if(tag==='button')n.type='button';return n;}
 function button(label,fn,cls='secondary-button'){const b=el('button',label,cls);b.onclick=fn;return b;}
 async function rpc(name,args){const r=await supabase.rpc(name,args);if(r.error)throw r.error;return r.data;}
 function isApprover(){return data?.user_id===data?.approver_id;}
 function person(id){return data?.people.find(p=>p.id===id)?.name||'Tidigare kollega';}
 function modal(title){
   const overlay=el('div',undefined,'overlay-modal schedule-overlay');const panel=el('section',undefined,'side-panel schedule-modal');
   panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',title);
   const heading=el('div',undefined,'side-panel__header');const body=el('form',undefined,'side-panel__body');const actions=el('div',undefined,'side-panel__header-actions');const message=el('p');message.setAttribute('role','alert');
   let saving=false;const previous=document.activeElement;const close=()=>{if(!saving){overlay.remove();if(previous?.isConnected)previous.focus();}};
   actions.append(button('Stäng',close));heading.append(el('h2',title,'side-panel__title'),actions);panel.append(heading,body,message);overlay.append(panel);document.body.append(overlay);
   overlay.onkeydown=e=>{if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button,input,textarea,select')].filter(n=>!n.disabled);if(!nodes.length)return;if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}};
   body.onsubmit=e=>e.preventDefault();
   const run=async operation=>{if(saving)return;saving=true;message.textContent='';const controls=[...panel.querySelectorAll('input,textarea,select,button')];controls.forEach(n=>n.disabled=true);
     try{await operation();saving=false;close();await load();}catch(e){message.textContent=e.message;}finally{saving=false;controls.forEach(n=>n.disabled=false);}};
   actions.querySelector('button').focus();return{body,actions,message,close,run};
 }
 function field(form,label,type,value=''){const wrap=el('label',undefined,'detail-field');const input=el(type==='textarea'?'textarea':'input',undefined,'detail-field__control');if(type!=='textarea')input.type=type;input.value=value;input.setAttribute('aria-label',label);wrap.append(el('span',label,'detail-field__label'),input);form.append(wrap);return input;}
 function apply(){const m=modal('Ansök om semester');const start=field(m.body,'Från','date',today());const end=field(m.body,'Till','date',today());start.required=end.required=true;const comment=field(m.body,'Kommentar (valfri)','textarea');comment.maxLength=2000;comment.rows=4;
   m.body.append(el('p','Hela dagar. Helger och dagar markerade Ledig räknas inte som semester. Dagstatusen behålls under ansökan.','side-panel__text'));
   m.actions.append(button('Skicka ansökan',()=>m.body.requestSubmit()));m.body.onsubmit=e=>{e.preventDefault();void m.run(async()=>{if(end.value<start.value)throw Error('Till måste vara samma dag som eller efter Från.');await rpc('planning_leave_apply',{p_start:start.value,p_end:end.value,p_comment:comment.value.trim()});});};start.focus();
 }
 function requestDetails(request){const full=data.requests.find(r=>r.id===request.id)||request;const own=full.user_id===data.user_id;const m=modal('Semester – '+person(full.user_id));
   m.body.append(el('p',`${full.start_date} – ${full.end_date}`),el('p',LABELS[full.status]));
   if(full.comment)m.body.append(el('p',full.comment,'schedule-preserve'));
   if(full.decision_comment)m.body.append(el('p','Beslutskommentar: '+full.decision_comment,'schedule-preserve'));
   if(full.decided_at)m.body.append(el('p','Beslut: '+new Date(full.decided_at).toLocaleString('sv-SE')));
   if(isApprover()&&full.status==='pending'){
     const note=field(m.body,'Beslutskommentar (valfri)','textarea');note.maxLength=2000;
     for(const [label,action] of [['Godkänn','approve'],['Avslå','reject']])m.actions.append(button(label,()=>{void m.run(()=>rpc('planning_leave_action',{p_id:full.id,p_action:action,p_comment:note.value.trim()}));}));
   }
   if((own&&full.status==='pending')||(isApprover()&&['pending','approved'].includes(full.status)))m.body.append(button('Återkalla ansökan',()=>{if(confirm('Återkalla semesterperioden? Tidigare dagmarkeringar visas igen.'))void m.run(()=>rpc('planning_leave_action',{p_id:full.id,p_action:'cancel',p_comment:''}));}));
   if(own&&full.status==='approved'&&!isApprover())m.body.append(el('p','Kontakta semesteransvarig om perioden behöver ändras.'));
 }
 function requests(){const m=modal(isApprover()?'Semesteransökningar':'Mina semesteransökningar');
   const rows=[...data.requests].sort((a,b)=>(a.status==='pending'?0:1)-(b.status==='pending'?0:1)||b.created_at.localeCompare(a.created_at));
   if(!rows.length)m.body.append(el('p','Inga ansökningar ännu.'));
   for(const r of rows)m.body.append(button(`${person(r.user_id)} · ${r.start_date}–${r.end_date} · ${LABELS[r.status]}`,()=>{m.close();requestDetails(r);},'secondary-button schedule-request'));
 }
 const savingDays=new Set();
 async function toggle(user,day,button){
   const key=user.id+':'+day;if(savingDays.has(key))return;
   const base=data.days.find(d=>d.user_id===user.id&&d.day===day)?.status||'office';
   const next={office:'off',off:'remote',remote:'office'}[base];
   savingDays.add(key);button.disabled=true;button.setAttribute('aria-busy','true');showError('');
   try{
     await rpc('planning_schedule_set_day',{p_user_id:user.id,p_day:day,p_status:next,p_expected:base});
     if(data){const existing=data.days.find(d=>d.user_id===user.id&&d.day===day);if(existing)existing.status=next;else data.days.push({user_id:user.id,day,status:next});}
     const current=host?.querySelector(`[data-schedule-day="${day}"][data-schedule-user="${user.id}"]`);
     if(current){current.textContent=LABELS[next];current.className='schedule-day schedule-'+next;current.setAttribute('aria-label',`${user.name}, ${day}: ${LABELS[next]}`);}
   }catch(e){showError(e.message);}
   finally{
     savingDays.delete(key);
     const current=host?.querySelector(`[data-schedule-day="${day}"][data-schedule-user="${user.id}"]`);
     if(current){current.disabled=false;current.removeAttribute('aria-busy');}
     button.removeAttribute('aria-busy');
   }
 }
 let lastError='';function showError(message){lastError=message;const n=host?.querySelector('.schedule-error');if(n){n.textContent=message;n.hidden=!message;}}
 function draw(){if(!host?.isConnected||!data)return;host.replaceChildren();
   const header=el('div',undefined,'view-card__header');header.append(el('h1','Schema – vecka '+weekLabel(week).split('Vecka ')[1],'view-card__title'));const actions=el('div',undefined,'schedule-actions');
   const applyButton=button('Ansök om semester',apply);applyButton.disabled=!data.approver_id||busy;const pending=data.requests.filter(r=>r.status==='pending').length;
   actions.append(applyButton,button(`${isApprover()?'Semesteransökningar':'Mina ansökningar'} (${pending})`,requests));header.append(actions);host.append(header);
   const toolbar=el('div',undefined,'schedule-toolbar');
   for(const [label,offset] of [['← Föregående vecka',-7],['Nästa vecka →',7]]){const b=button(label,()=>{week=addDays(week,offset);void load();});b.disabled=busy;toolbar.append(b);}
   const current=button('Denna vecka',()=>{week=mondayOf(today());void load();});current.disabled=busy;toolbar.append(current,el('strong',weekLabel(week)),button('Hämta senaste',()=>load()));host.append(toolbar);
   const legend=el('div',undefined,'schedule-legend');for(const key of ['office','off','remote','pending','approved'])legend.append(el('span',LABELS[key],'schedule-state schedule-'+key));host.append(legend);
   host.append(el('p','Klicka på din dag: Kontoret → Ledig → Distans → Kontoret. Semester öppnas separat.','schedule-help'));
   host.append(el('p',data.approver_id?'Semesteransvarig: '+person(data.approver_id):'Semesteransvarig saknas. Kontrollera SQL-installationen.','schedule-help'));
   const error=el('p',lastError,'schedule-error');error.hidden=!lastError;error.setAttribute('role','alert');host.append(error);
   const table=el('table',undefined,'schedule-table');const head=el('tr');const nameHead=el('th','Kollega');nameHead.scope='col';head.append(nameHead);
   for(let i=0;i<5;i++){const day=addDays(week,i);const th=el('th');const label=el('span',`${DAY_NAMES[i]} ${day.slice(8)}/${day.slice(5,7)}`,'schedule-date-label');if(day===today()){label.classList.add('schedule-date-label--today');th.setAttribute('aria-current','date');}th.append(label);th.scope='col';head.append(th);}const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');
   for(const user of data.people){const tr=el('tr');const th=el('th',user.name+(user.id===data.user_id?' (du)':''));th.scope='row';tr.append(th);
     for(let i=0;i<5;i++){const day=addDays(week,i);const base=data.days.find(d=>d.user_id===user.id&&d.day===day)?.status||'office';const leave=data.leaves.find(l=>l.user_id===user.id&&l.start_date<=day&&l.end_date>=day);const state=dayPresentation(base,leave);
       const cell=el('td');const b=button(LABELS[state],()=>leave?requestDetails(leave):toggle(user,day,b),'schedule-day schedule-'+state);
       b.dataset.scheduleDay=day;b.dataset.scheduleUser=user.id;
       b.disabled=busy||savingDays.has(user.id+':'+day)||(!leave&&user.id!==data.user_id&&!data.is_admin&&!isApprover());b.setAttribute('aria-label',`${user.name}, ${day}: ${LABELS[state]}`);if(day<today())cell.classList.add('schedule-past');cell.append(b);tr.append(cell);
     }body.append(tr);
   }table.append(body);host.append(table);
 }
 async function load(){const token=++sequence;lastError='';if(host?.isConnected)host.replaceChildren(el('p','Läser schema…'));try{const result=await rpc('planning_schedule_read',{p_monday:week});if(token!==sequence)return;data=result;draw();}catch(e){if(token!==sequence)return;data=null;lastError=e.message;if(host?.isConnected)host.replaceChildren(el('p','Schema kunde inte läsas: '+e.message),button('Försök igen',()=>load()));}}
 return{createView(){host=el('section',undefined,'view-card schedule-view');host.append(el('p','Läser schema…'));setTimeout(()=>load(),0);return host;}};
}
