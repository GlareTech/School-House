const asDataUrl=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)});
const absolute=value=>new URL(value,document.baseURI).href;

async function inlineImages(source,clone){
 const originals=[...source.querySelectorAll('img')],copies=[...clone.querySelectorAll('img')];
 await Promise.all(originals.map(async(img,index)=>{try{const response=await fetch(absolute(img.currentSrc||img.src),{credentials:'same-origin'});if(!response.ok)throw new Error('Image unavailable');copies[index].src=await asDataUrl(await response.blob())}catch{copies[index]?.remove()}}));
 for(const variable of ['--watermark','--report-watermark']){
  const match=getComputedStyle(source).getPropertyValue(variable).match(/url\(["']?(.+?)["']?\)/);if(!match)continue;
  try{const response=await fetch(absolute(match[1]),{credentials:'same-origin'});if(response.ok)clone.style.setProperty(variable,`url(${await asDataUrl(await response.blob())})`);else clone.style.setProperty(variable,'none')}catch{clone.style.setProperty(variable,'none')}
 }
}

export async function printElement(element,title='School report'){
 if(!element)return;
 const frame=document.createElement('iframe');frame.title='Report print frame';Object.assign(frame.style,{position:'fixed',right:'0',bottom:'0',width:'1px',height:'1px',border:'0'});document.body.append(frame);
 try{
  const clone=element.cloneNode(true);await inlineImages(element,clone);
  const styles=[...document.querySelectorAll('link[rel="stylesheet"],style')].map(node=>node.outerHTML).join('');
  const doc=frame.contentDocument;doc.open();doc.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${document.baseURI}"><title>${String(title).replace(/[<>&]/g,'')}</title>${styles}<style>@media print{body.print-frame,body.print-frame *{visibility:visible!important}.report-actions,.batch-report-toolbar,.modal-actions{display:none!important}.report-card,.progress-report-print{position:static!important;inset:auto!important;width:100%!important;max-width:none!important}body{margin:0;background:#fff}}</style></head><body class="print-frame"></body></html>`);doc.close();doc.body.append(clone);await doc.fonts?.ready;
  await new Promise(resolve=>setTimeout(resolve,100));frame.contentWindow.focus();frame.contentWindow.print();
 }finally{setTimeout(()=>frame.remove(),30000)}
}
