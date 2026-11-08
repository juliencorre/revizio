import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve('dist');
const port = Number(process.env.PORT || 4173);
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json','.ttf':'font/ttf','.woff2':'font/woff2'};
const server = createServer(async(req,res)=>{
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    let file = resolve(root, '.' + pathname);
    if(file !== root && !file.startsWith(root + sep)){res.writeHead(403);res.end();return;}
    try {if(!(await stat(file)).isFile())file=resolve(root,'index.html');}
    catch {if(extname(pathname)){res.writeHead(404);res.end('Not found');return;}file=resolve(root,'index.html');}
    const body = await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {res.writeHead(500);res.end('Export web indisponible : lancer npm run export:web.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Révizo : http://localhost:${port}`));
