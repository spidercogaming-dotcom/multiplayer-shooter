const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

let players = {};
let bullets = [];
let myId = null;
let camera = { x: 0, y: 0 };

const keys = { w:false,a:false,s:false,d:false };

socket.on("connect", () => myId = socket.id);

socket.on("state", (data) => {
    players = data.players;
    bullets = data.bullets;

    if (players[myId]) {
        document.getElementById("coins").innerText = players[myId].coins;
        document.getElementById("weapon").innerText = players[myId].weapon;
        document.getElementById("hp").innerText = players[myId].hp;
    }
});

// Crate events
socket.on("crateResult", (weapon) => {
    const box = document.getElementById("crateAnimation");
    box.innerText = "You got: " + weapon + "!";
    box.style.display = "block";
    setTimeout(() => box.style.display = "none", 600);
});

socket.on("crateDenied", () => {
    const box = document.getElementById("crateAnimation");
    box.innerText = "Not enough coins!";
    box.style.display = "block";
    setTimeout(() => box.style.display = "none", 800);
});

function toggleShop() {
    const shop = document.getElementById("shop");
    shop.style.display = shop.style.display === "none" ? "block" : "none";
}

function openCrate(type) {
    socket.emit("openCrate", type); // server decides if allowed
}

document.addEventListener("keydown", e => { if (e.key in keys) keys[e.key] = true; });
document.addEventListener("keyup", e => { if (e.key in keys) keys[e.key] = false; });

canvas.addEventListener("click", (e) => {
    const me = players[myId];
    if (!me) return;

    const rect = canvas.getBoundingClientRect();
    const worldX = e.clientX - rect.left + camera.x;
    const worldY = e.clientY - rect.top + camera.y;

    const angle = Math.atan2(worldY - me.y, worldX - me.x);
    socket.emit("shoot", { angle });
});

function handleMovement() {
    const speed = 5;
    let dx=0, dy=0;
    if (keys.w) dy -= speed;
    if (keys.s) dy += speed;
    if (keys.a) dx -= speed;
    if (keys.d) dx += speed;
    if (dx || dy) socket.emit("move", { dx, dy });
}

function updateCamera() {
    const me = players[myId];
    if (!me) return;

    camera.x = me.x - canvas.width/2;
    camera.y = me.y - canvas.height/2;

    camera.x = Math.max(0, Math.min(camera.x, MAP_WIDTH - canvas.width));
    camera.y = Math.max(0, Math.min(camera.y, MAP_HEIGHT - canvas.height));
}

// DRAW MINIMAP TOP-RIGHT
function drawMinimap() {
    const size = 150;
    const scaleX = size / MAP_WIDTH;
    const scaleY = size / MAP_HEIGHT;

    const xPos = canvas.width - size - 20;
    const yPos = 20;

    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(xPos, yPos, size, size);

    for (let id in players) {
        const p = players[id];
        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(xPos + p.x * scaleX, yPos + p.y * scaleY, 4, 4);
    }
}

// DRAW GRID BACKGROUND
function drawBackground() {
    const gridSize = 50;
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;

    const startX = -camera.x % gridSize;
    const startY = -camera.y % gridSize;

    for (let x = startX; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = startY; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    handleMovement();
    updateCamera();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // MAP BACKGROUND
    ctx.fillStyle="#111";
    ctx.fillRect(0,0,MAP_WIDTH,MAP_HEIGHT);

    // GRID for motion feel
    drawBackground();

    // Players
    for (let id in players) {
        const p = players[id];
        ctx.fillStyle = id===myId?"lime":"red";
        ctx.fillRect(p.x,p.y,30,30);

        // HP bar
        ctx.fillStyle = "red";
        ctx.fillRect(p.x, p.y - 10, 30, 5);
        ctx.fillStyle = "lime";
        ctx.fillRect(p.x, p.y - 10, 30 * (p.hp / 100), 5);
    }

    // Bullets
    bullets.forEach(b=>{
        ctx.fillStyle="yellow";
        ctx.fillRect(b.x,b.y,5,5);
    });

    ctx.restore();

    drawMinimap();

    requestAnimationFrame(draw);
}

draw();

