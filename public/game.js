const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let bullets = {};
let myId = null;
let camera = { x: 0, y: 0 };

const keys = { w:false,a:false,s:false,d:false };

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
    const p = players[myId];
    if (!p) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left + camera.x;
    const mouseY = e.clientY - rect.top + camera.y;

    const angle = Math.atan2(mouseY - p.y, mouseX - p.x);

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

function drawMinimap() {
    const size = 150;
    const scale = 0.1;

    ctx.fillStyle = "black";
    ctx.fillRect(10, 10, size, size);

    for (let id in players) {
        const p = players[id];
        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(
            10 + p.x * scale,
            10 + p.y * scale,
            5,
            5
        );
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    handleMovement();

    const me = players[myId];
    if (me) {
        camera.x = me.x - canvas.width / 2;
        camera.y = me.y - canvas.height / 2;
    }

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    for (let id in players) {
        const p = players[id];
        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(p.x, p.y, 30, 30);
    }

    bullets.forEach(b => {
        ctx.fillStyle = "yellow";
        ctx.fillRect(b.x, b.y, 5, 5);
    });

    ctx.restore();

    drawMinimap();

    requestAnimationFrame(draw);
}

draw();
