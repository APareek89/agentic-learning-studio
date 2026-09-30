/** Only lesson reading/check actions cross the opaque iframe boundary. */
export const IFRAME_BRIDGE_JS = String.raw`(function(){
  if(window.parent===window)return;
  var originalFetch=window.fetch.bind(window),seq=0,pending={};
  window.addEventListener("message",function(event){
    if(event.source!==window.parent)return;
    var d=event.data;if(!d||d.type!=="als-api-result"||!pending[d.id])return;
    var item=pending[d.id];delete pending[d.id];clearTimeout(item.timer);
    item.resolve(new Response(JSON.stringify(d.body),{status:d.status,headers:{"Content-Type":"application/json"}}));
  });
  window.fetch=function(input,init){
    if(typeof input!=="string"||!["/api/module","/api/check"].includes(input))return originalFetch(input,init);
    return new Promise(function(resolve,reject){
      var id=String(++seq),body={};try{body=JSON.parse(init&&init.body||"{}");}catch(e){reject(e);return;}
      pending[id]={resolve:resolve,timer:setTimeout(function(){delete pending[id];reject(new Error("Lesson request timed out."));},30000)};
      window.parent.postMessage({type:"als-api",id:id,path:input,body:body},"*");
    });
  };
})();`;
