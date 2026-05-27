const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, { cors: { origin: "*" } });

let players = {};
let foods = [];
const maxFoods = 60;
const colors = ["#ff4757","#2ed573","#1e90ff","#ffa502","#9b59b6","#ff6b81"];

// Hàm sinh mồi ngẫu nhiên
function spawnFood() {
    return { id: Math.random(), x: Math.random() * 1500, y: Math.random() * 1500, r: Math.random() * 3 + 3, c: colors[Math.floor(Math.random() * colors.length)] };
}
for(let i=0; i<maxFoods; i++) foods.push(spawnFood());

io.on('connection', (socket) => {
    // Khi có người chơi mới đăng nhập
    socket.on('join-game', (data) => {
        players[socket.id] = {
            id: socket.id, name: data.name || "Player", x: 400, y: 400, r: 14, c: colors[Math.floor(Math.random()*colors.length)],
            body: [], len: 25, sc: 0, a: 0
        };
        // Gửi danh sách thức ăn hiện tại cho người mới vào
        socket.emit('init-foods', foods);
    });

    // Nhận dữ liệu cập nhật hướng di chuyển từ client
    socket.on('update-input', (data) => {
        let p = players[socket.id];
        if (!p) return;
        p.a = data.a;
        // Xử lý tăng tốc
        let speed = (data.isBoost && p.sc > 0) ? 4.8 : 2.5;
        if (data.isBoost && p.sc > 0) { p.sc -= 0.04; p.len = 25 + p.sc * 3.5; }

        // Di chuyển tọa độ
        p.x += Math.cos(p.a) * speed;
        p.y += Math.sin(p.a) * speed;

        // Cập nhật mảng thân uốn lượn
        p.body.unshift({ x: p.x, y: p.y });
        if (p.body.length > p.len) p.body.pop();

        // Xử lý ăn mồi
        foods.forEach((f, index) => {
            if (Math.sqrt((p.x - f.x)**2 + (p.y - f.y)**2) < p.r + f.r) {
                p.sc += (f.r > 5) ? 2.5 : 1;
                p.len += (f.r > 5) ? 8 : 4;
                foods[index] = spawnFood(); // Đổi vị trí mồi
                io.emit('update-foods', foods);
            }
        });
    });

    // Khi ngắt kết nối (thoát game hoặc chết)
    socket.on('disconnect', () => { delete players[socket.id]; });
});

// Gửi đồng bộ vị trí tất cả người chơi về các máy client (60fps)
setInterval(() => { io.emit('game-state', players); }, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server chạy trên port ${PORT}`));
