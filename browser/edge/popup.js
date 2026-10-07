async function refresh(toggle=false){
  const state=await chrome.runtime.sendMessage({action:toggle?'toggle':'status'});
  document.querySelector('#status').textContent=!state.enabled?'Browser observations paused.':state.connected?`Connected locally · ${state.active} active requests.`:state.error||'Waiting for the local companion.';
  document.querySelector('#toggle').textContent=state.enabled?'Pause observations':'Resume observations';
}
document.querySelector('#toggle').addEventListener('click',()=>refresh(true));refresh();
