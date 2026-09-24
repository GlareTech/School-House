let csrf = '';
export function setCsrf(value) { csrf = value; }
export function getCsrf() { return csrf; }
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', signal: AbortSignal.timeout(15000), ...options,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, ...options.headers },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
  });
  const data = await response.json();
  if (!response.ok) { const err = new Error(data.error || 'Request failed'); err.status = response.status; throw err; }
  return data;
}
export async function uploadFile(file, purpose='attachment') {
  const response=await fetch('/api/files',{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(30000),headers:{'Content-Type':file.type,'X-File-Name':file.name,'X-File-Purpose':purpose,'X-CSRF-Token':csrf},body:file});
  const data=await response.json();
  if(!response.ok){const err=new Error(data.error||'Upload failed');err.status=response.status;throw err}
  return data;
}
export function downloadCsv(filename, rows) {
  const escape = value => { let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`; return `"${text.replaceAll('"','""')}"`; };
  const blob = new Blob(['\uFEFF' + rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
