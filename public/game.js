const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

let players = {};
let bullets = [];
let crates = [];
let myId = null;
let joined = false;
let keys = {};

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

canvas.addEventListener("click", (e) => {
    if (!players[myId]) return;

    const angle = Math.atan2(
        e.clientY - canvas.height / 2,
        e.clientX - canvas.width / 2
    );

    socket.emit("shoot", angle);
});

function startGame() {
    const name = document.getElementById("startName").value.trim() || "Player";
    socket.emit("joinGame", name);

    document.getElementById("menu").style.display = "none";
    document.getElementById("sidePanel").style.display = "block";
    canvas.style.display = "block";

    joined = true;
}

function changeName() {
    const name = document.getElementById("usernameInput").value.trim();
    if (!name) return;
    socket.emit("joinGame", name);
}

function buyRifle() {
    socket.emit("buyWeapon", "rifle");
}

socket.on("connect", () => myId = socket.id);

socket.on("state", data => {
    players = data.players;
    bullets = data.bullets;
    crates = data.crates;
});

function update() {
    if (!joined) return;

    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["ArrowUp"]) dy -= 1;
    if (keys["s"] || keys["ArrowDown"]) dy += 1;
    if (keys["a"] || keys["ArrowLeft"]) dx -= 1;
    if (keys["d"] || keys["ArrowRight"]) dx += 1;

    if (dx || dy) socket.emit("move", { dx, dy });
}

function drawBackground(camX, camY) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    for (let x = 0; x < MAP_WIDTH; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x - camX, -camY);
        ctx.lineTo(x - camX, MAP_HEIGHT - camY);
        ctx.stroke();
    }
    for (let y = 0; y < MAP_HEIGHT; y += 100) {
        ctx.beginPath();
        ctx.moveTo(-camX, y - camY);
        ctx.lineTo(MAP_WIDTH - camX, y - camY);
        ctx.stroke();
    }
}

function draw() {
    if (!joined || !players[myId]) return;

    const me = players[myId];
    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground(camX, camY);

    crates.forEach(c => {
        ctx.fillStyle = "orange";
        ctx.fillRect(c.x - camX - 10, c.y - camY - 10, 20, 20);
    });

    for (let id in players) {
        const p = players[id];
        const x = p.x - camX;
        const y = p.y - camY;

        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(x - 15, y - 15, 30, 30);

        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText(p.name, x, y - 25);
        ctx.fillText("HP: " + p.hp, x, y + 30);
    }

    bullets.forEach(b => {
        ctx.fillStyle = "yellow";
        ctx.beginPath();
        ctx.arc(b.x - camX, b.y - camY, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    // Minimap
    const mapSize = 200;
    const mapX = canvas.width - mapSize - 20;
    const mapY = 20;

    ctx.fillStyle = "black";
    ctx.fillRect(mapX, mapY, mapSize, mapSize);
    ctx.strokeStyle = "white";
    ctx.strokeRect(mapX, mapY, mapSize, mapSize);

    for (let id in players) {
        const p = players[id];
        const miniX = mapX + (p.x / MAP_WIDTH) * mapSize;
        const miniY = mapY + (p.y / MAP_HEIGHT) * mapSize;

        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(miniX - 2, miniY - 2, 4, 4);
    }

    crates.forEach(c => {
        const miniX = mapX + (c.x / MAP_WIDTH) * mapSize;
        const miniY = mapY + (c.y / MAP_HEIGHT) * mapSize;

        ctx.fillStyle = "orange";
        ctx.fillRect(miniX - 2, miniY - 2, 4, 4);
    });

    ctx.fillStyle = "white";
    ctx.fillText("Coins: " + me.coins, 100, 30);
    ctx.fillText("Weapon: " + me.weapon, 100, 50);
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

loop();

