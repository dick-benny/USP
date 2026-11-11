const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
async function authScenario(session,valid=true,failScript=false,failData=false){
  const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:false,inert:false,textContent:'',querySelector:()=>({focus(){}}),addEventListener(){}});return nodes.get(id);};
  const loaded=[],calls=[];
  const ctx={window:{CDPApp:{ready:true},CDPRemote:{start:async()=>{calls.push('database');if(failData)throw Error('Database unavailable');}},OFFERTVERKTYG_SUPABASE:{url:'https://example.invalid',publishableKey:'test'},supabase:{createClient(){return {auth:{onAuthStateChange(){},getSession:async()=>{calls.push('session');return {data:{session}};},getUser:async()=>{calls.push('user');return {data:{user:valid?{id:'test'}:null}};},signOut:async()=>{calls.push('signout');return {};},signInWithPassword:async()=>({})}};}}},document:{querySelector:node,querySelectorAll:()=>[],createElement:()=>({}),body:{appendChild(s){loaded.push(s.src);if(failScript)s.onerror();else s.onload();}}},location:{reload(){}},setTimeout,console};
  vm.runInNewContext(read('JS/auth.js'),ctx);await new Promise(r=>setImmediate(r));return {nodes,loaded,calls};
}
(async()=>{
  const html=read('index.html');assert.equal(read('dist/index.html'),html);assert.ok(html.includes('class="app-shell" hidden inert'));assert.ok(!html.includes('data-view="inquiries"'));assert.ok(html.includes('Projects · v7.9'));assert.ok(!html.includes('src="JS/app.js'));assert.ok(!html.includes('src="JS/data.js'));
  for(const dir of ['JS','CSS','vendor'])for(const file of fs.readdirSync(path.join(root,dir)))assert.deepEqual(fs.readFileSync(path.join(root,dir,file)),fs.readFileSync(path.join(root,'dist',dir,file)));
  console.log('PASS built dist matches v7.9 sources, assets and gated entrypoint');
  assert.ok(!/localStorage\.(getItem|setItem)|const seed =/.test(read('JS/app.js')+read('JS/data.js')+read('JS/remote.js')));assert.ok(read('JS/app.js').includes('CDPData.createRemoteStore'));console.log('PASS app uses Supabase without seed/localStorage fallback');
  let r=await authScenario(null);assert.equal(r.loaded.length,0);assert.equal(r.nodes.get('.app-shell').hidden,true);console.log('PASS signed-out user cannot load application scripts');
  r=await authScenario({user:{email:'test@example.invalid'}},false);assert.equal(r.loaded.length,0);assert.ok(r.calls.includes('signout'));console.log('PASS invalid session is rejected');
  r=await authScenario({user:{email:'test@example.invalid'}});assert.deepEqual(r.calls,['session','user','database']);assert.deepEqual(r.loaded,['JS/structure.js?v=7.9.23','JS/workflow.js?v=7.9.23','JS/rfq-project.js?v=7.9.23','JS/remote.js?v=7.9.23','JS/data.js?v=7.9.23','JS/xlsx.js?v=7.9.23','JS/app.js?v=7.9.23']);assert.equal(r.nodes.get('.app-shell').hidden,false);assert.equal(r.nodes.get('#login-screen').hidden,true);console.log('PASS authenticated startup loads model, data, application in order');
  r=await authScenario({user:{email:'test@example.invalid'}},true,true);assert.equal(r.nodes.get('.app-shell').hidden,true);assert.ok(r.nodes.get('#login-error').textContent.includes("Could not"));console.log('PASS failed asset load keeps application hidden');
  r=await authScenario({user:{email:'test@example.invalid'}},true,false,true);assert.equal(r.nodes.get('.app-shell').hidden,true);assert.ok(!r.loaded.some(x=>x.startsWith('JS/app.js')));console.log('PASS failed database read keeps application hidden');
  console.log('7 integration tests passed (auth mocked; no external requests).');
})().catch(e=>{console.error(e);process.exitCode=1;});
