const socket = io(); // IMPORTANT for Render

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

let state = { players: {}, bullets: [] };
let myId = null;

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", (serverState) => {
    state = serverState;

    const me = state.players[myId];
    if (me) {
        document.getElementById("hp").innerText = me.hp;
        document.getElementById("coins").innerText = me.coins;
        document.getElementById("weapon").innerText = me.weapon;
    }
});

socket.on("crateResult", (weapon) => {
    alert("You got: " + weapon);
});

socket.on("crateDenied", () => {
    alert("Not enough coins!");
});

const keys = {};
document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

canvas.addEventListener("click", (e) => {
    const me = state.players[myId];
    if (!me) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const angle = Math.atan2(
        mouseY - canvas.height / 2,
        mouseX - canvas.width / 2
    );

    socket.emit("shoot", { angle });
});

function toggleShop() {
    const shop = document.getElementById("shop");
    shop.style.display = shop.style.display === "none" ? "block" : "none";
}

function openCrate(type) {
    socket.emit("openCrate", type);
}

function update() {
    let dx = 0;
    let dy = 0;

    if (keys["w"]) dy -= 5;
    if (keys["s"]) dy += 5;
    if (keys["a"]) dx -= 5;
    if (keys["d"]) dx += 5;

    if (dx !== 0 || dy !== 0) {
        socket.emit("move", { dx, dy });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const me = state.players[myId];
    if (!me) return;

    const camX = me.x - canvas.width / 2;
    const camY = me.y - canvas.height / 2;

    for (let id in state.players) {
        const p = state.players[id];

        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(p.x - camX, p.y - camY, 30, 30);
    }

    state.bullets.forEach(b => {
        ctx.fillStyle = "yellow";
        ctx.fillRect(b.x - camX, b.y - camY, 5, 5);
    });
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();

