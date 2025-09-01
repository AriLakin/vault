const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3014;

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
};

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url);
    let pathname = parsedUrl.pathname;

    // Default to index.html
    if (pathname === '/') {
        pathname = '/index.html';
    }

    const filePath = path.join(__dirname, pathname);
    const ext = path.parse(filePath).ext;
    const mimeType = mimeTypes[ext] || 'text/plain';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found, serve index.html for SPA routing
                fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Error loading index.html');
                    } else {
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(data);
                    }
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${err.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(data);
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n===========================================`);
    console.log(`  CryptoLaunch Frontend Server`);
    console.log(`===========================================`);
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📱 Frontend available at: http://localhost:${PORT}`);
    console.log(`🔗 Direct access: http://localhost:${PORT}/index.html`);
    console.log(`===========================================\n`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.log(`Port ${PORT} is already in use. Trying to kill existing process...`);
        // Try to kill process using port 3014
        const { exec } = require('child_process');
        exec(`netstat -ano | findstr :${PORT}`, (error, stdout) => {
            if (stdout) {
                const lines = stdout.split('\n');
                lines.forEach(line => {
                    if (line.includes('LISTENING')) {
                        const pid = line.trim().split(/\s+/).pop();
                        if (pid && pid !== '0') {
                            exec(`taskkill /F /PID ${pid}`, (killError) => {
                                if (!killError) {
                                    console.log(`Killed process ${pid} using port ${PORT}`);
                                    setTimeout(() => {
                                        server.listen(PORT);
                                    }, 1000);
                                }
                            });
                        }
                    }
                });
            }
        });
    } else {
        console.error('Server error:', err);
    }
});