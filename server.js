const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, { cors: { origin: "*" } });

let players = {};
let foods = [];
const maxFoods = 100;
const MAP_SIZE = 1600; // Chiều rộng và cao của bản đồ cố định
const colors = ["#ff4757","#2ed573","#1e90ff","#ffa502","#9b59b6","#ff6b81"];

function spawnFood(x, y, r, c) {
    return { 
        id: Math.random(), 
        x: x || Math.random() * MAP_SIZE, 
        y: y || Math.random() * MAP_SIZE, 
        r: r || Math.random() * 3 + 3, 
        c: c || colors[Math.floor(Math.random() * colors.length)] 
    };
}
for(let i=0; i<maxFoods; i++) foods.push(spawnFood());

io.on('connection', (socket) => {
    socket.on('join-game', (data) => {
        players[socket.id] = {
            id: socket.id, name: data.name || "Player", 
            x: Math.random() * (MAP_SIZE - 200) + 100, 
            y: Math.random() * (MAP_SIZE - 200) + 100, 
            r: 14, c: colors[Math.floor(Math.random()*colors.length)],
            body: [], len: 25, sc: 0, a: 0, isAlive: true
        };
        socket.emit('init-foods', foods);
        socket.emit('map-info', { size: MAP_SIZE });
    });

    socket.on('update-input', (data) => {
        let p = players[socket.id];
        if (!p || !p.isAlive) return;
        p.a = data.a;
        
        let speed = (data.isBoost && p.sc > 0) ? 4.8 : 2.5;
        if (data.isBoost && p.sc > 0) { p.sc -= 0.04; p.len = 25 + p.sc * 3.5; }

        // Tính toán vị trí mới tiếp theo
        let nextX = p.x + Math.cos(p.a) * speed;
        let nextY = p.y + Math.sin(p.a) * speed;

        // TÍNH NĂNG KHÓA BIÊN: Chạm tường bản đồ thì đứng yên không cho đi tiếp
        if (nextX >= 0 && nextX <= MAP_SIZE) p.x = nextX;
        if (nextY >= 0 && nextY <= MAP_SIZE) p.y = nextY;

        p.body.unshift({ x: p.x, y: p.y });
        if (p.body.length > p.len) p.body.pop();

        // Xử lý ăn mồi thông thường
        foods.forEach((f, index) => {
            if (Math.sqrt((p.x - f.x)**2 + (p.y - f.y)**2) < p.r + f.r) {
                p.sc += (f.r > 5) ? 2.5 : 1;
                p.len += (f.r > 5) ? 8 : 4;
                foods[index] = spawnFood();
                io.emit('update-foods', foods);
            }
        });
    });

    socket.on('disconnect', () => { delete players[socket.id]; });
});

// VÒNG LẶP KIỂM TRA VA CHẠM TỬ THẦN TOÀN MẠNG (60fps)
setInterval(() => {
    let activeIds = Object.keys(players).filter(id => players[id].isAlive);
    let deadIds = [];

    activeIds.forEach(id1 => {
        let p1 = players[id1];
        activeIds.forEach(id2 => {
            let p2 = players[id2];
            if (p1.id === p2.id) return; // Không tự check với chính mình

            // Quét qua các đốt thân của đối phương p2
            for (let i = 12; i < p2.body.length; i += 3) {
                let part = p2.body[i];
                if (!part) continue;

                // Nếu đầu p1 đâm vào thân p2
                if (Math.sqrt((p1.x - part.x)**2 + (p1.y - part.y)**2) < p1.r + p2.r - 3) {
                    if (!deadIds.includes(id1)) deadIds.push(id1);
                }
            }
        });
    });

    // Xử lý nổ xác rắn chết thành chuỗi mồi lớn
    deadIds.forEach(id => {
        let p = players[id];
        if (p) {
            p.isAlive = false;
            for (let i = 0; i < p.body.length; i += 6) {
                if (p.body[i]) foods.push(spawnFood(p.body[i].x, p.body[i].y, 6.5, p.c));
            }
            io.emit('update-foods', foods);
            io.to(id).emit('player-dead'); // Báo riêng cho người đó hiển thị màn hình Game Over
        }
    });

    io.emit('game-state', players);
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server live!`));
