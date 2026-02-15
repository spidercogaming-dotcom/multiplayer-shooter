const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const WORLD_SIZE = 2000;

let players = {};
let myId = null;

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", (serverPlayers) => {
    players = serverPlayers;

    if (players[myId]) {
        document.getElementById("coins").innerText = players[myId].coins;
        document.getElementById("weapon").innerText = players[myId].weapon;
        document.getElementById("deathScreen").style.display =
            players[myId].dead ? "block" : "none";
    }
});

function toggleShop() {
    const shop = document.getElementById("shop");
    shop.style.display = shop.style.display === "none" ? "block" : "none";
}

function openCrate(type) {
    socket.emit("openCrate", type);
    animateCrate();
}

function respawn() {
    socket.emit("respawn");
}

document.addEventListener("keydown", (e) => {
    const speed = 10;
    if (!players[myId] || players[myId].dead) return;

    if (e.key === "w") socket.emit("move", { dx: 0, dy: -speed });
    if (e.key === "s") socket.emit("move", { dx: 0, dy: speed });
    if (e.key === "a") socket.emit("move", { dx: -speed, dy: 0 });
    if (e.key === "d") socket.emit("move", { dx: speed, dy: 0 });
});

canvas.addEventListener("click", () => {
    for (let id in players) {
        if (id !== myId) {
            socket.emit("damage", id);
            break;
        }
    }
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!players[myId]) return;

    const me = players[myId];
    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    for (let id in players) {
        const p = players[id];
        const x = p.x - camX;
        const y = p.y - camY;

        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(x, y, 30, 30);
    }

    drawMinimap();
    requestAnimationFrame(draw);
}

function drawMinimap() {
    const mapSize = 150;
    const scale = mapSize / WORLD_SIZE;

    ctx.fillStyle = "#000";
    ctx.fillRect(canvas.width - mapSize - 20, 20, mapSize, mapSize);

    for (let id in players) {
        const p = players[id];
        const miniX = canvas.width - mapSize - 20 + p.x * scale;
        const miniY = 20 + p.y * scale;

        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(miniX, miniY, 4, 4);
    }
}

function animateCrate() {
    const div = document.createElement("div");
    div.style.position = "absolute";
    div.style.top = "50%";
    div.style.left = "50%";
    div.style.transform = "translate(-50%, -50%)";
    div.style.fontSize = "40px";
    div.innerText = "Opening...";
    document.body.appendChild(div);

    setTimeout(() => {
        div.remove();
    }, 1000);
}

draw();
