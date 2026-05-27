const express = require('express');
const app = express();
const server = require('http').createServer(app);
const { WebSocketServer } = require('ws'); // Dùng ws thuần không phụ thuộc socket.io

const wss = new WebSocketServer({ server });
let players = {};
let foods = [];
const MAP_SIZE = 1600;
const colors = ["#ff4757","#2ed573","#1e90ff","#ffa502","#9b59b6"];

function spawnFood(x, y, r, c) {
    return { id: Math.random(), x: x || Math.random() * MAP_SIZE, y: y || Math.random() * MAP_SIZE, r: r || Math.random() * 3 + 3, c: c || colors[Math.floor(Math.random() * colors.length)] };
}
for(let i=0; i<100; i++) foods.push(spawnFood());

wss.on('connection', (ws) => {
    ws.id = Math.random().toString(36).substring(2, 9);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'join') {
                players[ws.id] = {
                    id: ws.id, name: data.name || "Player",
                    x: Math.random() * (MAP_SIZE - 200) + 100, y: Math.random() * (MAP_SIZE - 200) + 100,
                    r: 14, c: colors[Math.floor(Math.random() * colors.length)],
                    body: [], len: 25, sc: 0, a: 0, isAlive: true
                };
                ws.send(JSON.stringify({ type: 'init', myId: ws.id, foods, mapSize: MAP_SIZE }));
            }

            if (data.type === 'input') {
                let p = players[ws.id];
                if (!p || !p.isAlive) return;
                p.a = data.a;
                let speed = (data.isBoost && p.sc > 0) ? 4.8 : 2.5;
                if (data.isBoost && p.sc > 0) { p.sc -= 0.04; p.len = 25 + p.sc * 3.5; }

                let nextX = p.x + Math.cos(p.a) * speed;
                let nextY = p.y + Math.sin(p.a) * speed;
                if (nextX >= 0 && nextX <= MAP_SIZE) p.x = nextX;
                if (nextY >= 0 && nextY <= MAP_SIZE) p.y = nextY;

                p.body.unshift({ x: p.x, y: p.y });
                if (p.body.length > p.len) p.body.pop();

                foods.forEach((f, idx) => {
                    if (Math.sqrt((p.x - f.x)**2 + (p.y - f.y)**2) < p.r + f.r) {
                        p.sc += (f.r > 5) ? 2.5 : 1; p.len += (f.r > 5) ? 8 : 4;
                        foods[idx] = spawnFood();
                    }
                });
            }
        } catch(e){}
    });

    ws.on('close', () => { delete players[ws.id]; });
});

// Vòng lặp đồng bộ dữ liệu và check va chạm đâm nhau chết (60fps)
setInterval(() => {
    let activeIds = Object.keys(players).filter(id => players[id].isAlive);
    let deadIds = [];

    activeIds.forEach(id1 => {
        let p1 = players[id1];
        activeIds.forEach(id2 => {
            let p2 = players[id2];
            if (p1.id === p2.id) return;
            for (let i = 12; i < p2.body.length; i += 3) {
                if (p2.body[i] && Math.sqrt((p1.x - p2.body[i].x)**2 + (p1.y - p2.body[i].y)**2) < p1.r + p2.r - 3) {
                    if (!deadIds.includes(id1)) deadIds.push(id1);
                }
            }
        });
    });

    deadIds.forEach(id => {
        let p = players[id];
        if (p) {
            p.isAlive = false;
            for (let i = 0; i < p.body.length; i += 6) {
                if (p.body[i]) foods.push(spawnFood(p.body[i].x, p.body[i].y, 6.5, p.c));
            }
            wss.clients.forEach(client => { if(client.id === id) client.send(JSON.stringify({ type: 'dead' })); });
        }
    });

    let state = JSON.stringify({ type: 'state', players, foods });
    wss.clients.forEach(client => { if (client.readyState === 1) client.send(state); });
}, 1000 / 60);

server.listen(process.env.PORT || 3000);
