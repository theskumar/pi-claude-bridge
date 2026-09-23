import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerLimits} from '../src/limits.ts';
function harness() {
 const listeners=new Map(), hooks=new Map(), replies=[];
 return {replies,hooks,pi:{events:{on(name,fn){listeners.set(name,fn);return()=>listeners.delete(name)},emit(name,value){if(name.endsWith(':result'))replies.push(value);listeners.get(name)?.(value)}},on(name,fn){hooks.set(name,fn)}}};
}
const tick=()=>new Promise(r=>setTimeout(r,10));
test('idle quota control never yields a model prompt and closes its SDK query',async()=>{
 const h=harness();let closed=0,created=0,source;
 const sdk={accountInfo:async()=>({email:'a',organization:'org',tokenSource:'secret-source'}),usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET:async()=>({rate_limits_available:true,rate_limits:{five_hour:{utilization:42}},session:{secret:'not emitted'}}),close(){closed++}};
 registerLimits(h.pi,()=>({cwd:'/tmp'}),()=>undefined,args=>{created++;source=args;return sdk});
 h.pi.events.emit('subscription-limits:claude:read',{id:'one'});h.pi.events.emit('subscription-limits:claude:read',{id:'two'});await tick();
 assert.equal(created,1);assert.equal(closed,1);assert.equal(source.options.persistSession,false);assert.deepEqual(await source.prompt.next(),{value:undefined,done:true});assert.equal(h.replies.length,2);assert.equal(h.replies[0].snapshot.account.tokenSource,undefined);assert.equal(h.replies[0].snapshot.usage.session,undefined);
 await h.hooks.get('session_shutdown')();
});
test('active SDK query is reused and never closed by quota reads',async()=>{
 const h=harness();let closed=0;
 const sdk={accountInfo:async()=>({email:'a',organization:'org'}),usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET:async()=>({}),close(){closed++}};
 registerLimits(h.pi,()=>({}),()=>sdk,()=>{throw Error('must not create second query')});h.pi.events.emit('subscription-limits:claude:read',{id:'one'});await tick();assert.equal(h.replies.length,1);assert.equal(closed,0);await h.hooks.get('session_shutdown')();
});
test('account changes fail without exposing raw SDK errors',async()=>{
 const h=harness();let n=0;
 const sdk={accountInfo:async()=>({email:++n===1?'a':'b',organization:'org'}),usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET:async()=>({}),close(){}};
 registerLimits(h.pi,()=>({}),()=>sdk);h.pi.events.emit('subscription-limits:claude:read',{id:'one'});await tick();assert.match(h.replies[0].error,/failed/);assert.equal(h.replies[0].snapshot,undefined);await h.hooks.get('session_shutdown')();
});
