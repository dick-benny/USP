const clone=x=>JSON.parse(JSON.stringify(x));
const blank=()=>Object.fromEntries(["companies","customers","agents","manufacturers","meetings","leads","projects","project_history","articles","bom_items","rfqs","rfq_responses","article_prices","phases","phase_items","quotation_versions","orders","deliveries"].map(t=>['cdp_'+t,[]]));
const same=(a,b)=>Object.keys(b).every(k=>JSON.stringify(a[k])===JSON.stringify(b[k]));
function server(){let db=blank(),calls=[],fail=false,lostReply=false;
return {get db(){return clone(db);},get calls(){return calls;},set fail(v){fail=v;},set lostReply(v){lostReply=v;},async rpc(name,args){
calls.push(name);if(fail)return {error:{message:'Network failed'}};
if(name==='cdp_read_state')return {data:clone(db)};
const staged=clone(db),result=[];
try{for(const c of args.changes){const list=staged[c.table],r=clone(c.row),old=list.find(x=>x.id===r.id);
if(old&&same(old,r)){result.push({table:c.table,id:r.id,revision:old.revision});continue;}
if(old&&old.revision!==c.revision||!old&&c.revision!=null)throw Object.assign(Error('Conflict'),{code:'40001'});
if(c.table==='cdp_quotation_versions'&&old&&['snapshot','amount','total_cost','currency','version','project_id'].some(k=>Object.hasOwn(r,k)&&JSON.stringify(old[k])!==JSON.stringify(r[k])))throw Error('Frozen quote');
if(c.table==='cdp_phase_items'&&!old&&list.some(x=>x.phase_id===r.phase_id&&x.article_id===r.article_id))throw Error('Duplicate phase item');
if(old)Object.assign(old,r,{revision:old.revision+1});else list.push({...r,revision:1});result.push({table:c.table,id:r.id,revision:old?.revision||1});
}db=staged;if(lostReply){lostReply=false;return {error:{message:'Reply lost'}};}return {data:result};}catch(error){return {error};}
}};}

module.exports=server;
