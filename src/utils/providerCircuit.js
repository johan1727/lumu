function createProviderCircuit(now=Date.now) {
 const blockedUntil=new Map();
 return {
  isBlocked:host=>(blockedUntil.get(host)||0)>now(),
  observe(host,status){if([401,403,429].includes(Number(status)))blockedUntil.set(host,now()+(Number(status)===429?60000:300000));}
 };
}
module.exports={...createProviderCircuit(),createProviderCircuit};
