const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

let playerId = null;
let players = {};
let bullets = [];
let keys = {};
let mouse = { x: 0, y: 0 };
let shopOpen = false;

/* ============================= */
/* START GAME */
/* ============================= */

function startGame() {
    document.getElementById("menu").style.display = "none";
    document.getElementById("coinsDisplay").style.display = "block";
    document.getElementById("shopBtn").style.display = "block";
    canvas.style.display = "block";

    const username =
        document.getElementById("usernameInput").value || "Ikon";

    socket.emit("joinGame", username);
    gameLoop();
}

/* ============================= */
/* SHOP */
/* ============================= */

function toggleShop() {
    shopOpen = !shopOpen;
    document.getElementById("shopMenu").style.display =
        shopOpen ? "block" : "none";
}

function openCrate(type) {
    socket.emit("openCrate", type);
}

/* ============================= */
/* SOCKET */
/* ============================= */

socket.on("connect", () => {
    playerId = socket.id;
});

socket.on("state", data => {
    players = data.players;
    bullets = data.bullets;

    if (players[playerId]) {
        document.getElementById("coinsDisplay").innerText =
            "Coins: " + players[playerId].coins;
    }
});

/* ============================= */
/* CONTROLS */
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
/* GAME LOOP */
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
        drawPlayer(players[id], id === playerId);
    }

    drawBullets();

    ctx.restore();

    drawMinimap();
}

/* ============================= */
/* DRAW PLAYER */
/* ============================= */

function drawPlayer(p, isMe) {

    // body
    ctx.fillStyle = isMe ? "cyan" : "red";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI*2);
    ctx.fill();

    // username
    ctx.fillStyle = "white";
    ctx.fillText(p.username, p.x - 20, p.y - 30);

    // weapon
    drawWeapon(p, isMe);
}

/* ============================= */
/* DRAW WEAPON */
/* ============================= */

function drawWeapon(p, isMe) {

    let angle = 0;

    if (isMe) {
        angle = Math.atan2(
            mouse.y - canvas.height/2,
            mouse.x - canvas.width/2
        );
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);

    let color = "gray";
    let length = 30;

    if (p.weapon === "pistol") {
        color = "gray";
        length = 25;
    }

    if (p.weapon === "rifle") {
        color = "green";
        length = 40;
    }

    if (p.weapon === "sniper") {
        color = "blue";
        length = 55;
    }

    ctx.fillStyle = color;
    ctx.fillRect(0, -5, length, 10);

    ctx.restore();
}

/* ============================= */
/* DRAW BULLETS */
/* ============================= */

function drawBullets() {
    ctx.fillStyle = "yellow";

    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI*2);
        ctx.fill();
    });
}

/* ============================= */
/* 🗺 MINIMAP */
/* ============================= */

function drawMinimap() {

    const size = 180;
    const padding = 15;

    ctx.fillStyle = "#000";
    ctx.fillRect(padding, padding, size, size);

    for (let id in players) {

        const p = players[id];

        const miniX =
            padding + (p.x / MAP_WIDTH) * size;

        const miniY =
            padding + (p.y / MAP_HEIGHT) * size;

        ctx.fillStyle =
            id === playerId ? "cyan" : "red";

        ctx.fillRect(miniX, miniY, 4, 4);
    }
}
