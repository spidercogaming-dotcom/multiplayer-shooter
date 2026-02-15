const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let bullets = [];
let myId = null;

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

let camera = { x: 0, y: 0 };

const keys = { w:false, a:false, s:false, d:false };

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", (data) => {
    players = data.players;
    bullets = data.bullets;

    if (players[myId]) {
        document.getElementById("coins").innerText = players[myId].coins;
        document.getElementById("weapon").innerText = players[myId].weapon;
    }
});

document.addEventListener("keydown", e => {
    if (e.key in keys) keys[e.key] = true;
});

document.addEventListener("keyup", e => {
    if (e.key in keys) keys[e.key] = false;
});

canvas.addEventListener("click", (e) => {
    const me = players[myId];
    if (!me) return;

    const rect = canvas.getBoundingClientRect();

    const worldX = e.clientX - rect.left + camera.x;
    const worldY = e.clientY - rect.top + camera.y;

    const angle = Math.atan2(worldY - me.y, worldX - me.x);

    socket.emit("shoot", { angle });
});

function handleMovement() {
    const speed = 5;
    let dx = 0, dy = 0;

    if (keys.w) dy -= speed;
    if (keys.s) dy += speed;
    if (keys.a) dx -= speed;
    if (keys.d) dx += speed;

    if (dx || dy) socket.emit("move", { dx, dy });
}

function updateCamera() {
    const me = players[myId];
    if (!me) return;

    camera.x = me.x - canvas.width / 2;
    camera.y = me.y - canvas.height / 2;

    // Clamp camera inside map
    camera.x = Math.max(0, Math.min(camera.x, MAP_WIDTH - canvas.width));
    camera.y = Math.max(0, Math.min(camera.y, MAP_HEIGHT - canvas.height));
}

function drawMap() {
    ctx.fillStyle = "#222";
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
}

function drawPlayers() {
    for (let id in players) {
        const p = players[id];

        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(p.x, p.y, 30, 30);
    }
}

function drawBullets() {
    bullets.forEach(b => {
        ctx.fillStyle = "yellow";
        ctx.fillRect(b.x, b.y, 5, 5);
    });
}

function drawMinimap() {
    const size = 150;
    const x = 20;
    const y = 20;

    const scaleX = size / MAP_WIDTH;
    const scaleY = size / MAP_HEIGHT;

    ctx.fillStyle = "black";
    ctx.fillRect(x, y, size, size);

    for (let id in players) {
        const p = players[id];

        ctx.fillStyle = id === myId ? "lime" : "red";

        ctx.fillRect(
            x + p.x * scaleX,
            y + p.y * scaleY,
            4,
            4
        );
    }
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    handleMovement();
    updateCamera();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawMap();
    drawPlayers();
    drawBullets();

    ctx.restore();

    drawMinimap();

    requestAnimationFrame(gameLoop);
}

gameLoop();

