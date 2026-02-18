const socket = io();

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

let players = {};
let myId = null;
let joined = false;

let keys = {};

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

function startGame() {
    const input = document.getElementById("startName");
    let name = input.value.trim();
    if (name.length === 0) name = "Player";

    socket.emit("joinGame", name);

    document.getElementById("menu").style.display = "none";
    document.getElementById("sidePanel").style.display = "block";
    canvas.style.display = "block";

    joined = true;
}

function changeName() {
    const input = document.getElementById("usernameInput");
    const name = input.value.trim();
    if (name.length === 0) return;
    socket.emit("setUsername", name);
}

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", data => {
    players = data.players;
});

function update() {
    if (!joined) return;

    let dx = 0;
    let dy = 0;

    if (keys["w"] || keys["ArrowUp"]) dy -= 1;
    if (keys["s"] || keys["ArrowDown"]) dy += 1;
    if (keys["a"] || keys["ArrowLeft"]) dx -= 1;
    if (keys["d"] || keys["ArrowRight"]) dx += 1;

    if (dx !== 0 || dy !== 0) {
        socket.emit("move", { dx, dy });
    }
}

function drawBackground(camX, camY) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;

    const gridSize = 100;

    for (let x = 0; x <= MAP_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x - camX, -camY);
        ctx.lineTo(x - camX, MAP_HEIGHT - camY);
        ctx.stroke();
    }

    for (let y = 0; y <= MAP_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-camX, y - camY);
        ctx.lineTo(MAP_WIDTH - camX, y - camY);
        ctx.stroke();
    }
}

function draw() {
    if (!joined || !players[myId]) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const me = players[myId];
    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    drawBackground(camX, camY);

    for (let id in players) {
        const p = players[id];

        const drawX = p.x - camX;
        const drawY = p.y - camY;

        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(drawX, drawY, 30, 30);

        // USERNAME ABOVE PLAYER
        ctx.fillStyle = "white";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(p.name, drawX + 15, drawY - 8);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();

