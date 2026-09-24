const circuit=require('./providerCircuit');
/** Bounded fetch; never include credential-bearing URLs or provider bodies in errors. */
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
    const parsed=new URL(url);
    const protectedProvider=['generativelanguage.googleapis.com','api.mercadolibre.com'].includes(parsed.hostname);
    if(protectedProvider&&circuit.isBlocked(parsed.hostname))throw Object.assign(new Error('Provider temporarily unavailable'),{code:'PROVIDER_COOLDOWN'});
    const headers={...options.headers};
    if(parsed.hostname==='generativelanguage.googleapis.com'&&parsed.searchParams.has('key')){
        headers['x-goog-api-key']=parsed.searchParams.get('key');parsed.searchParams.delete('key');
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true});
    if(options.signal?.aborted)controller.abort();
    try {
        const response=await fetch(parsed.toString(),{...options,headers,signal:controller.signal});
        if(protectedProvider)circuit.observe(parsed.hostname,response.status);
        return response;
    } catch (error) {
        throw Object.assign(new Error(error.name==='AbortError'?'Provider request timed out or cancelled':'Provider request failed'),{code:error.name==='AbortError'?'ERR_CANCELED':'PROVIDER_REQUEST_FAILED'});
    } finally {
        clearTimeout(timeoutId);options.signal?.removeEventListener('abort',abort);
    }
}
module.exports=fetchWithTimeout;
