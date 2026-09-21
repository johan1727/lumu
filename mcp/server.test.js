import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from './server.js';
const parse=r=>JSON.parse(r.content[0].text);
async function local(t,opts){const server=createServer(opts),client=new Client({name:'test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);t.after(()=>client.close());return client;}
test('real stdio handshake, strict permissions and no credential disclosure',async t=>{
 const client=new Client({name:'smoke',version:'1'});
 const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./server.js',import.meta.url))],env:{LUMU_MCP_ENABLE_LIVE_SEARCH:'0',SERPER_API_KEY:'test-secret-never-return'},stderr:'pipe'});
 await client.connect(transport);t.after(()=>client.close());
 const tools=(await client.listTools()).tools;
 assert.equal(tools.length,4);assert.ok(tools.every(x=>x.annotations.readOnlyHint&&!x.annotations.destructiveHint));
 assert.ok(!tools.some(x=>/sql|write|delete|exec/.test(x.name)));
 const result=await client.callTool({name:'lumu_status',arguments:{}});assert.equal(parse(result).liveSearchEnabled,false);assert.ok(!JSON.stringify(result).includes('test-secret-never-return'));
 assert.equal((await client.callTool({name:'lumu_status',arguments:{sql:'DELETE FROM profiles'}})).isError,true);
 assert.equal((await client.callTool({name:'lumu_search_products',arguments:{query:'iPhone 15',country:'MX'}})).isError,true);
 const link=parse(await client.callTool({name:'lumu_diagnose_affiliate_link',arguments:{url:'https://amazon.com.mx/dp/ABC?tag=private-test'}}));assert.equal(link.amazonTagPresent,true);assert.ok(!JSON.stringify(link).includes('private-test'));
 assert.equal((await client.callTool({name:'lumu_diagnose_affiliate_link',arguments:{url:'file:///etc/passwd'}})).isError,true);
});
test('provider endpoint fixed, deduped, cached and bounded; unknown stock/cost preserved',async t=>{
 let calls=0,time=1000;
 const client=await local(t,{env:{LUMU_MCP_ENABLE_LIVE_SEARCH:'1',SERPER_API_KEY:'test-only'},now:()=>time,fetchImpl:async(url,opts)=>{calls++;assert.equal(url,'https://google.serper.dev/shopping');assert.equal(opts.redirect,'error');return new Response(JSON.stringify({shopping:[{title:'iPhone 15 128GB',link:'https://amazon.com.mx/dp/A',price:100}]}));}});
 const request={name:'lumu_search_products',arguments:{query:'iPhone 15 128GB'}};
 const results=await Promise.all([client.callTool(request),client.callTool(request)]);assert.equal(calls,1);
 assert.equal(parse(results[0]).offers[0].totalCost,null);assert.equal(parse(results[0]).offers[0].availabilityState,'unknown');
 await client.callTool(request);assert.equal(calls,1);
 for(const query of ['Phone two','Phone three'])await client.callTool({...request,arguments:{query}});
 assert.equal(parse(await client.callTool({...request,arguments:{query:'Phone four'}})).error,'LOCAL_REQUEST_LIMIT');
 time+=60001;await client.callTool(request);assert.equal(calls,4);
 assert.equal((await client.callTool({...request,arguments:{query:'Phone',endpoint:'http://localhost',limit:1000}})).isError,true);
});
test('provider secrets/errors are not returned and 429 does not retry',async t=>{
 let calls=0;const client=await local(t,{env:{LUMU_MCP_ENABLE_LIVE_SEARCH:'1',SERPER_API_KEY:'sensitive'},fetchImpl:async()=>{calls++;return new Response('sensitive',{status:429,headers:{'retry-after':'600'}});}});
 const request={name:'lumu_search_products',arguments:{query:'iPhone'}};
 assert.equal(parse(await client.callTool(request)).error,'PROVIDER_RATE_LIMIT');assert.equal(parse(await client.callTool(request)).error,'LOCAL_REQUEST_LIMIT');assert.equal(calls,1);
});
test('comparison uses shared variant rules and total evidence',async t=>{
 const client=await local(t,{env:{}});
 const r=parse(await client.callTool({name:'lumu_compare_offers',arguments:{query:'iPhone 15 128GB',offers:[{title:'iPhone 15 256GB',price:1},{title:'iPhone 15 128GB',price:100}]}}));
 assert.equal(r.offers.length,1);assert.equal(r.rejected[0].reason,'different_capacity');assert.equal(r.verification,'supplied_evidence_only');
});
