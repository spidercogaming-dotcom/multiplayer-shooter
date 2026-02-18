const socket = io();

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

let players = {};
let myId = null;

let keys = {};

document.addEventListener("keydown", (e) => keys[e.key] = true);
document.addEventListener("keyup", (e) => keys[e.key] = false);

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", (data) => {
    players = data.players;
});

function changeName() {
    const input = document.getElementById("usernameInput");
    const name = input.value.trim();
    if (name.length === 0) return;
    socket.emit("setUsername", name);
}

function update() {
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

function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, 0, MAP_HEIGHT);
    grad.addColorStop(0, "#111");
    grad.addColorStop(1, "#222");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!players[myId]) return;

    const me = players[myId];

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    drawBackground();

    for (let id in players) {
        const p = players[id];

        const drawX = p.x - camX;
        const drawY = p.y - camY;

        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(drawX, drawY, 30, 30);

        ctx.fillStyle = "white";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(p.name, drawX + 15, drawY - 5);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();

