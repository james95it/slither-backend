const express = require('express');
const app = express();
const server = require('http').createServer(app);
const { WebSocketServer } = require('ws');

const wss = new WebSocketServer({ server });
let players = {};
let foods = [];
const MAP_SIZE = 3500; // 🚀 MỞ RỘNG BẢN ĐỒ GẤP ĐÔI
const colors = ["#ff4757","#2ed573","#1e90ff","#ffa502","#9b59b6","#00d2d3","#ff9ff3"];

function spawnFood(x, y, r, c) {
    return { id: Math.random(), x: x || Math.random() * MAP_SIZE, y: y || Math.random() * MAP_SIZE, r: r || Math.random() * 3 + 3, c: c || colors[Math.floor(Math.random() * colors.length)], targetX: null, targetY: null };
}
// Tăng số lượng mồi lên 300 hạt cho bản đồ rộng
for(let i=0; i<300; i++) foods.push(spawnFood());

wss.on('connection', (ws) => {
    ws.id = Math.random().toString(36).substring(2, 9);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'join') {
                players[ws.id] = {
                    id: ws.id, name: data.name || "Player",
                    x: Math.random() * (MAP_SIZE - 400) + 200, y: Math.random() * (MAP_SIZE - 400) + 200,
                    r: 14, c: colors[Math.floor(Math.random() * colors.length)],
                    body: [], len: 25, sc: 0, a: 0, isAlive: true, isBoosting: false
                };
                ws.send(JSON.stringify({ type: 'init', myId: ws.id, foods, mapSize: MAP_SIZE }));
            }

            if (data.type === 'input') {
                let p = players[ws.id];
                if (!p || !p.isAlive) return;
                p.a = data.a;
                p.isBoosting = data.isBoost && p.sc > 0;
                
                let speed = p.isBoosting ? 5.2 : 2.6;
                if (p.isBoosting) { p.sc -= 0.05; p.len = 25 + p.sc * 3.5; }

                let nextX = p.x + Math.cos(p.a) * speed;
                let nextY = p.y + Math.sin(p.a) * speed;
                
                // Khóa biên bản đồ uốn lượn mượt mà
                if (nextX >= 0 && nextX <= MAP_SIZE) p.x = nextX;
                if (nextY >= 0 && nextY <= MAP_SIZE) p.y = nextY;

                p.body.unshift({ x: p.x, y: p.y });
                if (p.body.length > p.len) p.body.pop();

                // Logic Server: Kiểm tra phạm vi hút mồi và ăn mồi
                foods.forEach((f, idx) => {
                    let dist = Math.sqrt((p.x - f.x)**2 + (p.y - f.y)**2);
                    
                    // Tính năng hút mồi động lực học (Khoảng cách < 70px)
                    if (dist < 70) {
                        f.targetX = p.x;
                        f.targetY = p.y;
                        // Di chuyển hạt mồi trượt dần về phía đầu rắn
                        f.x += (p.x - f.x) * 0.25;
                        f.y += (p.y - f.y) * 0.25;
                    }

                    // Thực tế va chạm ngoạm mồi
                    if (dist < p.r + f.r) {
                        p.sc += (f.r > 5) ? 3.0 : 1; 
                        p.len += (f.r > 5) ? 9 : 4;
                        foods[idx] = spawnFood();
                    }
                });
            }
        } catch(e){}
    });

    ws.on('close', () => { delete players[ws.id]; });
});

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
                if (p.body[i]) foods.push(spawnFood(p.body[i].x, p.body[i].y, 7, p.c));
            }
            wss.clients.forEach(client => { if(client.id === id) client.send(JSON.stringify({ type: 'dead' })); });
        }
    });

    let state = JSON.stringify({ type: 'state', players, foods });
    wss.clients.forEach(client => { if (client.readyState === 1) client.send(state); });
}, 1000 / 60);

server.listen(process.env.PORT || 3000);
