const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let myId = null;

const keys = {
    w: false,
    a: false,
    s: false,
    d: false
};

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", (serverPlayers) => {
    players = serverPlayers;

    if (players[myId]) {
        document.getElementById("coins").innerText = players[myId].coins;
        document.getElementById("weapon").innerText = players[myId].weapon;
    }
});

function toggleShop() {
    const shop = document.getElementById("shop");
    shop.style.display = shop.style.display === "none" ? "block" : "none";
}

function openCrate(type) {
    socket.emit("openCrate", type);
}

document.addEventListener("keydown", (e) => {
    if (e.key in keys) keys[e.key] = true;
});

document.addEventListener("keyup", (e) => {
    if (e.key in keys) keys[e.key] = false;
});

function handleMovement() {
    const speed = 5;
    let dx = 0;
    let dy = 0;

    if (keys.w) dy -= speed;
    if (keys.s) dy += speed;
    if (keys.a) dx -= speed;
    if (keys.d) dx += speed;

    if (dx !== 0 || dy !== 0) {
        socket.emit("move", { dx, dy });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    handleMovement();

    for (let id in players) {
        const p = players[id];
        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(p.x, p.y, 30, 30);
    }

    requestAnimationFrame(draw);
}

draw();
