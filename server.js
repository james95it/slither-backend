<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8"><title>Slither Multiplayer Camera Lock</title>
    <style>
        body { margin:0; overflow:hidden; background:#111; font-family:Arial; user-select:none; }
        canvas { display:block; }
        .box { position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(22,22,26,0.95); display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:10; }
        .card { background:#242529; padding:30px; border-radius:12px; text-align:center; border:2px solid #2ecc71; color:#fff; }
        input, button { padding:12px; font-size:16px; border-radius:6px; border:none; margin:8px; }
        button { background:#2ecc71; color:#fff; font-weight:bold; cursor:pointer; }
        #ui { position:absolute; top:20px; left:20px; color:#fff; font-size:20px; font-weight:bold; z-index:5; display:none; }
        #status { color: #ffa502; font-size: 14px; margin-top: 10px; }
    </style>
    <script src="https://socket.io"></script>
</head>
<body>

<div id="menu" class="box">
    <div class="card">
        <h2>SLITHER MULTIPLAYER</h2>
        <input type="text" id="pName" value="Player_" maxlength="10">
        <br><button id="joinBtn" onclick="connectToServer()">VÀO CHIẾN</button>
        <div id="status"></div>
    </div>
</div>

<div id="over" class="box" style="display:none;">
    <div class="card" style="border-color:#ff4757;">
        <h2 style="color:#ff4757; margin:0 0 10px 0;">BẠN ĐÃ CHẾT!</h2>
        <button onclick="location.reload()" style="background:#ff4757;">CHƠI LẠI</button>
    </div>
</div>

<div id="ui">Điểm: <span id="sc">0</span></div>
<canvas id="cv"></canvas>

<script>
const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
let socket, players = {}, foods = [], myId, isBoost = false, angle = 0, MAP_SIZE = 1600;

window.onresize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
window.onresize();

// 💡 ĐIỀN ĐƯỜNG LINK SERVER RENDER CỦA BẠN VÀO ĐÂY
const SERVER_URL = "https://onrender.com";

function connectToServer() {
    let name = document.getElementById("pName").value.trim() || "Player";
    document.getElementById("status").innerText = "Đang kết nối tới đấu trường...";
    document.getElementById("joinBtn").disabled = true;

    socket = io(SERVER_URL);

    socket.on('connect', () => {
        myId = socket.id;
        document.getElementById("menu").style.display = "none";
        document.getElementById("ui").style.display = "block";
        socket.emit('join-game', { name: name });
        loop();
    });

    socket.on('map-info', (data) => MAP_SIZE = data.size);
    socket.on('init-foods', (sFoods) => foods = sFoods);
    socket.on('update-foods', (sFoods) => foods = sFoods);
    socket.on('game-state', (sPlayers) => {
        players = sPlayers;
        if(players[myId]) document.getElementById("sc").innerText = Math.floor(players[myId].sc);
    });

    socket.on('player-dead', () => {
        document.getElementById("ui").style.display = "none";
        document.getElementById("over").style.display = "flex";
    });

    // Tính hướng dựa trên vị trí chuột so với tâm màn hình (Vì camera đã khóa tâm con rắn vào giữa màn hình)
    window.onmousemove = (e) => {
        let dx = e.clientX - cv.width / 2;
        let dy = e.clientY - cv.height / 2;
        angle = Math.atan2(dy, dx);
    };
    window.onmousedown = (e) => { if(e.button === 0) isBoost = true; };
    window.onmouseup = (e) => { if(e.button === 0) isBoost = false; };
}

function drawEye(ctxX, ctxY, r, a, o, d) {
    let ex = ctxX + Math.cos(a)*o + Math.cos(a+d)*d, ey = ctxY + Math.sin(a)*o + Math.sin(a+d)*d;
    ctx.fillStyle="#fff"; ctx.beginPath(); ctx.arc(ex,ey,3.5,0,7); ctx.fill();
    ctx.fillStyle="#000"; ctx.beginPath(); ctx.arc(ex+Math.cos(a),ey+Math.sin(a),1.5,0,7); ctx.fill();
}

function loop() {
    ctx.clearRect(0, 0, cv.width, cv.height);

    let me = players[myId];
    if (!me || !me.isAlive) { requestAnimationFrame(loop); return; }

    // Gửi lệnh điều khiển liên tục lên Server
    socket.emit('update-input', { a: angle, isBoost: isBoost });

    // TÍNH TOÁN ĐỘ LỆCH CAMERA (Biến vị trí của mình thành tọa độ 0,0 ở giữa màn hình)
    let camX = cv.width / 2 - me.x;
    let camY = cv.height / 2 - me.y;

    // 1. Vẽ tường biên giới ranh giới Đỏ dựa theo góc nhìn Camera
    ctx.strokeStyle = "#ff4757"; ctx.lineWidth = 5;
    ctx.strokeRect(camX, camY, MAP_SIZE, MAP_SIZE);

    // 2. Vẽ thức ăn dịch chuyển theo vị trí Camera
    foods.forEach(f => {
        ctx.beginPath(); ctx.arc(f.x + camX, f.y + camY, f.r, 0, 7); ctx.fillStyle = f.c; ctx.fill();
    });

    // 3. Vẽ toàn bộ các người chơi online dựa theo góc dịch chuyển Camera
    Object.keys(players).forEach(id => {
        let s = players[id];
        if (!s || !s.isAlive || !s.body || s.body.length === 0) return;

        // Tính tọa độ hiển thị trên màn hình sau khi trừ đi vị trí camera
        let screenX = s.x + camX;
        let screenY = s.y + camY;

        // Vẽ thân uốn lượn dịch chuyển theo camera
        for (let i = s.body.length - 1; i >= 0; i -= 4) {
            if (s.body[i]) {
                ctx.beginPath(); ctx.arc(s.body[i].x + camX, s.body[i].y + camY, s.r - 2, 0, 7); ctx.fillStyle = s.c + "b3"; ctx.fill();
            }
        }

        // Vẽ đầu và đôi mắt
        ctx.beginPath(); ctx.arc(screenX, screenY, s.r, 0, 7); ctx.fillStyle = s.c; ctx.fill();
        drawEye(screenX, screenY, s.r, s.a, 6, -4); drawEye(screenX, screenY, s.r, s.a, 6, 4);
        
        // Hiện tên người chơi công khai trên đầu
        ctx.fillStyle = "#fff"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
        ctx.fillText(s.name, screenX, screenY - s.r - 6);
    });

    requestAnimationFrame(loop);
}
</script>
</body>
</html>
