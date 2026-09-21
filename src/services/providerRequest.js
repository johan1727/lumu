const {createHash}=require('node:crypto');
function createProviderRequest(transport,{now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),maxEntries=100,ttl=30000}={}) {
    const inflight=new Map(),cache=new Map(),cooldowns=new Map();
    const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
    function forCaller(pending, signal) {
        if (!signal) return pending;
        return new Promise((resolve, reject) => {
            const cancel = () => reject(Object.assign(new Error('Request cancelled'), {code:'ERR_CANCELED'}));
            if (signal.aborted) return cancel();
            signal.addEventListener('abort', cancel, {once:true});
            pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
        });
    }
    return async function request(config,retries=1){
        if(config.signal?.aborted) throw Object.assign(new Error('Request cancelled'),{code:'ERR_CANCELED'});
        const provider=new URL(config.url).origin;
        const scope=fingerprint([provider,config.headers]);
        const blockedUntil=cooldowns.get(scope)||0;
        if(blockedUntil>now()) {const e=new Error('Provider cooldown');e.response={status:429};throw e;}
        if(blockedUntil)cooldowns.delete(scope);
        const key=fingerprint([scope,config.method,config.url,config.data,config.timeout]);
        const share=true;
        const cached=cache.get(key);
        if(share&&cached&&cached.expires>now())return structuredClone(cached.response);
        if(cached)cache.delete(key);
        if(share&&inflight.has(key))return structuredClone(await forCaller(inflight.get(key),config.signal));
        const run=async()=>{
            for(let attempt=0;;attempt++){
                try {
                    const result=await transport({...config, signal:undefined, timeout:config.timeout || 12000});
                    const response={data:result.data,status:result.status};
                    if(share&&response.status>=200&&response.status<300){
                        if(cache.size>=maxEntries)cache.delete(cache.keys().next().value);
                        cache.set(key,{expires:now()+ttl,response:structuredClone(response)});
                    }
                    return response;
                }catch(error){
                    const status=error.response?.status;
                    if(status===429){
                        const raw=error.response?.headers?.['retry-after'];
                        const seconds=Number(raw);
                        const parsed=Number.isFinite(seconds)&&raw!=null ? seconds*1000 : Date.parse(raw)-now();
                        const delay=Number.isFinite(parsed)?Math.max(1000,Math.min(parsed,3600000)):60000;
                        if(cooldowns.size>=maxEntries)cooldowns.delete(cooldowns.keys().next().value);
                        cooldowns.set(scope,now()+delay);
                        throw error;
                    }
                    const transient=status>=500||['ECONNABORTED','ETIMEDOUT','ECONNRESET'].includes(error.code);
                    if(!transient||attempt>=Math.min(2,Math.max(0,retries)))throw error;
                    await sleep(500*2**attempt);
                }
            }
        };
        const pending=run();
        if(share&&inflight.size<maxEntries)inflight.set(key,pending);
        pending.then(() => {if(inflight.get(key)===pending)inflight.delete(key);}, () => {if(inflight.get(key)===pending)inflight.delete(key);});
        return structuredClone(await forCaller(pending,config.signal));
    };
}
module.exports={createProviderRequest};
