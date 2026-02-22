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
let crateAnimation = null;
let crateTimer = 0;

function startGame() {
    const username = document.getElementById("usernameInput").value || "Ikon";
    document.getElementById("menu").style.display = "none";
    document.getElementById("coinsDisplay").style.display = "block";
    document.getElementById("shopBtn").style.display = "block";
    canvas.style.display = "block";

    socket.emit("joinGame", username);
    gameLoop();
}

socket.on("connect", () => {
    playerId = socket.id;
});

socket.on("state", (data) => {
    players = data.players;
    bullets = data.bullets;
});

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
        mouse.y - canvas.height / 2,
        mouse.x - canvas.width / 2
    );

    socket.emit("shoot", angle);
});

function updateMovement() {
    let dx = 0;
    let dy = 0;

    if (keys["w"]) dy -= 1;
    if (keys["s"]) dy += 1;
    if (keys["a"]) dx -= 1;
    if (keys["d"]) dx += 1;

    if (dx !== 0 || dy !== 0) {
        socket.emit("move", { dx, dy });
    }
}

function drawBackground(me) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const grid = 100;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";

    const offsetX = me.x - canvas.width / 2;
    const offsetY = me.y - canvas.height / 2;

    for (let x = -offsetX % grid; x < canvas.width; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = -offsetY % grid; y < canvas.height; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawPlayers(me) {
    for (let id in players) {
        const p = players[id];

        const screenX = canvas.width / 2 + (p.x - me.x);
        const screenY = canvas.height / 2 + (p.y - me.y);

        ctx.fillStyle = id === playerId ? "red" : "white";
        ctx.fillRect(screenX - 15, screenY - 15, 30, 30);

        ctx.fillStyle = "yellow";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(p.name, screenX, screenY - 25);
    }
}

function drawBullets(me) {
    ctx.fillStyle = "orange";

    bullets.forEach(b => {
        const screenX = canvas.width / 2 + (b.x - me.x);
        const screenY = canvas.height / 2 + (b.y - me.y);
        ctx.fillRect(screenX, screenY, 5, 5);
    });
}

function drawMiniMap(me) {
    const size = 180;
    const x = 20;
    const y = 20;

    ctx.fillStyle = "#222";
    ctx.fillRect(x, y, size, size);

    for (let id in players) {
        const p = players[id];

        const dotX = x + (p.x / MAP_WIDTH) * size;
        const dotY = y + (p.y / MAP_HEIGHT) * size;

        ctx.fillStyle = id === playerId ? "red" : "white";
        ctx.fillRect(dotX, dotY, 4, 4);
    }
}

function drawUI(me) {
    document.getElementById("coinsDisplay").innerText =
        "Coins: " + me.coins + " | Weapon: " + me.weapon;
}

function toggleShop() {
    shopOpen = !shopOpen;
    document.getElementById("shopPanel").style.display =
        shopOpen ? "block" : "none";
}

function openCrate(type) {
    socket.emit("openCrate", type);

    // Start animation
    const me = players[playerId];
    if (!me) return;

    crateAnimation = "Opening " + type.toUpperCase() + " Crate...";
    crateTimer = 120;
}

function drawCrateAnimation() {
    if (crateTimer > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "gold";
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.fillText(crateAnimation, canvas.width/2, canvas.height/2);

        crateTimer--;
    }
}

function gameLoop() {
    const me = players[playerId];
    if (!me) {
        requestAnimationFrame(gameLoop);
        return;
    }

    updateMovement();
    drawBackground(me);
    drawPlayers(me);
    drawBullets(me);
    drawMiniMap(me);
    drawUI(me);
    drawCrateAnimation();

    requestAnimationFrame(gameLoop);
}
