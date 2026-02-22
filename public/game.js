const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let playerId = null;
let players = {};
let bullets = {};
let keys = {};
let mouse = { x: 0, y: 0 };
let shopOpen = false;

function startGame() {

    document.getElementById("menu").style.display = "none";
    document.getElementById("coinsDisplay").style.display = "block";
    document.getElementById("shopBtn").style.display = "block";
    canvas.style.display = "block";

    const username = document.getElementById("usernameInput").value || "Ikon";

    socket.emit("joinGame", username);
    gameLoop();
}

function toggleShop() {
    shopOpen = !shopOpen;
    document.getElementById("shopMenu").style.display =
        shopOpen ? "block" : "none";
}

function openCrate(type) {
    socket.emit("openCrate", type);
}

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

window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

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

function gameLoop() {
    requestAnimationFrame(gameLoop);

    const me = players[playerId];
    if (!me) return;

    if (keys["w"]) socket.emit("move", { dx: 0, dy: -5 });
    if (keys["s"]) socket.emit("move", { dx: 0, dy: 5 });
    if (keys["a"]) socket.emit("move", { dx: -5, dy: 0 });
    if (keys["d"]) socket.emit("move", { dx: 5, dy: 0 });

    ctx.clearRect(0,0,canvas.width,canvas.height);

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
    }

    ctx.fillStyle = "yellow";
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI*2);
        ctx.fill();
    });

    ctx.restore();
}
