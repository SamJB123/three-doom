const http = require('http');
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const threeDir = path.join(__dirname, '../../three.js');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.wad': 'application/octet-stream' };
http.createServer((req, res) => {
  let f;
  if (req.url.startsWith('/three/')) {
    f = path.join(threeDir, req.url.slice(7));
  } else {
    f = path.join(dir, req.url === '/' ? '/viewer.html' : req.url);
  }
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('Not found: ' + f); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(3000, () => console.log('Serving at http://localhost:3000/viewer.html'));
