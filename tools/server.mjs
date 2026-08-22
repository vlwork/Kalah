import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
const root = process.cwd(); const types = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.svg':'image/svg+xml' };
createServer((request,response)=>{ const path = normalize(join(root, decodeURIComponent(request.url.split('?')[0] === '/' ? 'index.html' : request.url.split('?')[0]))); if (!path.startsWith(root) || !existsSync(path)) { response.writeHead(404); response.end('Not found'); return; } response.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream'}); createReadStream(path).pipe(response); }).listen(8080,()=>console.log('Kalah: http://localhost:8080'));
