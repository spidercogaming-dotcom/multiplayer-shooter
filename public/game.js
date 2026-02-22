const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

let playerId = null;
let players = {};
let bullets = [];
let keys = {};
let mouse = { x: 0, y: 0 };

let shopOpen = false;

/* 🎰 CRATE SPIN */
let crateSpin = false;
let spinItems = [];
let spinIndex = 0;
let spinSpeed = 40;
let spinSlowdown = 0.5;

function startGame() {
    const username = document.getElementById("usernameInput").value || "Ikon";

    document.getElementById("menu").style.display = "none";
    document.getElementById("coinsDisplay").style.display = "block";
    document.getElementById("shopBtn").style.display = "block";
    canvas.style.display = "block";

    socket.emit("joinGame", username);
    gameLoop();
}

socket.on("connect", () => playerId = socket.id);

socket.on("state", data => {
    players = data.players;
    bullets = data.bullets;

    if (players[playerId]) {
        document.getElementById("coinsDisplay").innerText =
            "Coins: " + players[playerId].coins;
    }
});

socket.on("crateResult", weapon => {

    const pool = [
        "pistol","rpg","rifle","ak47",
        "sniper","minigun","k24","testy","laser"
    ];

    spinItems = [];

    for (let i = 0; i < 30; i++) {
        spinItems.push(pool[Math.floor(Math.random()*pool.length)]);
    }

    spinItems.push(weapon);

    spinIndex = 0;
    spinSpeed = 40;
    crateSpin = true;
});

/* ============================= */

window.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
window.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

canvas.addEventListener("mousemove", e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

canvas.addEventListener("click", () => {
    const me = players[playerId];
    if (!me) return;

    const angle = Math.atan2(
        mouse.y - canvas.height/2,
        mouse.x - canvas.width/2
    );

    socket.emit("shoot", angle);
});

/* ============================= */

function gameLoop() {
    requestAnimationFrame(gameLoop);

    const me = players[playerId];
    if (!me) return;

    if (keys["w"]) socket.emit("move", { dx: 0, dy: -5 });
    if (keys["s"]) socket.emit("move", { dx: 0, dy: 5 });
    if (keys["a"]) socket.emit("move", { dx: -5, dy: 0 });
    if (keys["d"]) socket.emit("move", { dx: 5, dy: 0 });

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const camX = me.x - canvas.width/2;
    const camY = me.y - canvas.height/2;

    ctx.save();
    ctx.translate(-camX, -camY);

    for (let id in players) {
        const p = players[id];

        ctx.fillStyle = id === playerId ? "cyan" : "red";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.fillText(p.username, p.x-20, p.y-30);
    }

    ctx.fillStyle = "yellow";
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI*2);
        ctx.fill();
    });

    ctx.restore();

    drawMinimap();

    if (crateSpin) drawCrateSpin();
}

/* ============================= */
/* 🗺 MINIMAP */
/* ============================= */

function drawMinimap() {
    ctx.fillStyle = "#000";
    ctx.fillRect(10, 10, 200, 200);

    for (let id in players) {
        const p = players[id];
        const miniX = 10 + (p.x / MAP_WIDTH) * 200;
        const miniY = 10 + (p.y / MAP_HEIGHT) * 200;

        ctx.fillStyle = id === playerId ? "cyan" : "red";
        ctx.fillRect(miniX, miniY, 4, 4);
    }
}

/* ============================= */
/* 🎰 SPIN ANIMATION */
/* ============================= */

function drawCrateSpin() {

    ctx.fillStyle = "rgba(0,0,0,0.8)";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const centerY = canvas.height/2;

    for (let i = 0; i < spinItems.length; i++) {
        const y = centerY + (i - spinIndex) * 60;
        ctx.fillStyle = "white";
        ctx.fillText(spinItems[i], canvas.width/2 - 50, y);
    }

    spinIndex += spinSpeed/100;
    spinSpeed -= spinSlowdown;

    if (spinSpeed <= 0) {
        crateSpin = false;
    }
}
