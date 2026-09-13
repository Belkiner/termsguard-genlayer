import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from '../frontend/node_modules/typescript/lib/typescript.js';
const base=new URL('../frontend/',import.meta.url);
const js=path=>readFile(new URL(path,base),'utf8').then(s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
const helpers={exports:{}};
vm.runInNewContext(await js('lib/x-post.ts'),{exports:helpers.exports,URL,BigInt});
const {postId,normalizeXPost}=helpers.exports;
assert.equal(postId('https://twitter.com/builder/status/123?s=20'),'123');
for(const url of ['https://x.com.evil.test/a/status/123','http://x.com/a/status/123','https://x.com/a','https://x.com/a/status/18446744073709551616','https://secret@x.com/a/status/123']) assert.throws(()=>postId(url));
const payload={data:{id:'123',author_id:'99',text:'We will publish an audit.',created_at:'2026-09-13T12:00:00Z'},includes:{users:[{id:'99',username:'builder'}]}};
assert.equal(normalizeXPost(payload,'123').url,'https://x.com/builder/status/123');
assert.throws(()=>normalizeXPost(payload,'124'));
assert.throws(()=>normalizeXPost({...payload,includes:{users:{}}},'123'));
const env={X_BEARER_TOKEN:'test-secret',UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'redis-secret',X_DAILY_LOOKUP_LIMIT:'2'};
let upstream=0,budget=0,cache=null,redisDown=false;
const fetch=async(url,options)=>{
 if(url==='https://redis.example'){
  if(redisDown)throw Error('private internal details');
  const command=JSON.parse(options.body);let result;
  if(command[0]==='GET')result=cache;
  if(command[0]==='EVAL')result=budget++<2?1:0;
  if(command[0]==='SET'){cache=command[2];result='OK';}
  return Response.json({result});
 }
 assert.ok(url.startsWith('https://api.x.com/2/tweets/123?'));
 assert.equal(options.headers.Authorization,'Bearer test-secret');upstream++;
 return Response.json(payload);
};
const api={exports:{}};
vm.runInNewContext(await js('app/api/social/posts/[id]/route.ts'),{exports:api.exports,require:()=>helpers.exports,process:{env},fetch,Response,AbortSignal,BigInt,Date});
const get=(id='123')=>api.exports.GET(new Request('https://site.example'),{params:Promise.resolve({id})});
assert.equal((await get('bad')).status,400);assert.equal(upstream,0);
env.X_DAILY_LOOKUP_LIMIT='0';assert.equal((await get()).status,503);assert.equal(upstream,0);
env.X_DAILY_LOOKUP_LIMIT='2';assert.equal((await get()).status,200);assert.equal(upstream,1);
assert.equal((await get()).status,200);assert.equal(upstream,1);
cache=null;assert.equal((await get()).status,200);assert.equal(upstream,2);
cache=null;assert.equal((await get()).status,429);assert.equal(upstream,2);
redisDown=true;const unavailable=await get();assert.equal(unavailable.status,503);assert.equal(upstream,2);
assert.ok(!(await unavailable.text()).includes('secret'));
console.log('PASS: URL spoofing, payload validation, disabled configuration, cache, request cap, Redis failure and secret-safe errors. Mocked services; no paid X calls.');
