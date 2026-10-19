import type { StudioPairing } from '../shared/studioProfile';

export const MAX_WORKSPACE_EXPORT_BYTES = 8 * 1024 * 1024;

export function scoringBrowserScript(workspace: StudioPairing, token: string): string {
  return `(function(){
    if(window.__njsWorkspaceBridge || !window.ReactNativeWebView || window.location.origin!==${JSON.stringify(workspace.origin)} || !window.location.pathname.startsWith(${JSON.stringify(`/${workspace.slug}/`)})) return true;
    window.__njsWorkspaceBridge=true;
    var token=${JSON.stringify(token)}, blobs=new Map();
    function send(type,payload){window.ReactNativeWebView.postMessage(JSON.stringify(Object.assign({type:type,token:token},payload||{})));}
    function save(blob,name){
      if(blob.size>${MAX_WORKSPACE_EXPORT_BYTES}){send('error',{message:'This export is larger than 8 MB. Open the workspace in your browser to download it.'});return;}
      var reader=new FileReader();
      reader.onload=function(){send('download',{name:name||'scoring-export',dataUrl:reader.result});};
      reader.onerror=function(){send('error',{message:'The export could not be read. Try again.'});};
      reader.readAsDataURL(blob);
    }
    var create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=function(blob){var url=create(blob);blobs.set(url,blob);return url;};
    URL.revokeObjectURL=function(url){blobs.delete(url);return revoke(url);};
    document.addEventListener('click',function(event){
      var target=event.target && event.target.closest ? event.target.closest('a[download]') : null;
      if(!target)return;
      var url=target.href;
      if(!/^(blob:|data:)/i.test(url))return;
      event.preventDefault();event.stopImmediatePropagation();
      var blob=blobs.get(url);
      if(blob)save(blob,target.download);
      else fetch(url).then(function(response){return response.blob();}).then(function(data){save(data,target.download);}).catch(function(){send('error',{message:'The export could not be downloaded.'});});
    },true);
    try{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:function(text){send('clipboard',{text:String(text)});return Promise.resolve();}}});}catch(error){}
    window.print=function(){send('print');};
    return true;
  })();true;`;
}

export type ScoringBrowserMessage =
  | { type: 'clipboard'; text: string }
  | { type: 'download'; name: string; dataUrl: string }
  | { type: 'print' }
  | { type: 'error'; message: string };

export function parseScoringBrowserMessage(data: string, token: string): ScoringBrowserMessage | null {
  if (!token || data.length > Math.ceil(MAX_WORKSPACE_EXPORT_BYTES * 4 / 3) + 2048) return null;
  try {
    const message = JSON.parse(data) as Record<string, unknown>;
    if (!message || message.token !== token) return null;
    if (message.type === 'clipboard' && typeof message.text === 'string' && message.text.length <= 20000) return { type: 'clipboard', text: message.text };
    if (message.type === 'download' && typeof message.name === 'string' && message.name.length <= 256 && typeof message.dataUrl === 'string' && /^data:[^,]*;base64,/i.test(message.dataUrl)) {
      return { type: 'download', name: message.name, dataUrl: message.dataUrl };
    }
    if (message.type === 'print') return { type: 'print' };
    if (message.type === 'error' && typeof message.message === 'string') return { type: 'error', message: message.message.slice(0, 180) };
    return null;
  } catch {
    return null;
  }
}