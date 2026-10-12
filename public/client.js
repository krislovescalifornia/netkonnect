// Desktop IPC carries data without creating even a loopback network connection.
export async function localRequest(path, options = {}) {
  if (!window.netKonnect) return fetch(path, options);
  const url = new URL(path, location.href);
  try {
    let data;
    // Parse in the page world, after the isolated bridge. Parsing in preload
    // would still make contextBridge copy and freeze the entire object graph.
    if (url.pathname === '/api/snapshot') {
      if(window.netKonnect.snapshotText){
        const reply=JSON.parse(await window.netKonnect.snapshotText());
        if(reply.error)throw new Error(reply.error);
        data=reply.result;
      }else data=await window.netKonnect.snapshot();
    }
    else if (url.pathname === '/api/analytics') data = await window.netKonnect.analytics(Object.fromEntries(url.searchParams));
    else if (url.pathname === '/api/restart' && options.method === 'POST') data = await window.netKonnect.restart();
    else throw new Error('Unsupported local operation.');
    return { ok:true,status:200,json:async()=>data };
  } catch (error) { return { ok:false,status:503,json:async()=>({error:error.message}) }; }
}
