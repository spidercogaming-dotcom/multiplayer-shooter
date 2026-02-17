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
let usernameSet = false;

let lightning = 0; // for flash effect

socket.on("connect", () => myId = socket.id);

// ================= Username Setup =================
function submitUsername() {
    const input = document.getElementById("usernameInput");
    const name = input.value.trim();
    if (!name) return;

    socket.emit("setUsername", name);
}

socket.on("usernameDenied", () => {
    document.getElementById("usernameError").innerText = "Username already taken!";
});

socket.on("usernameAccepted", (name) => {
    usernameSet = true;
    document.getElementById("usernameDiv").style.display = "none";
});

// ================= Game State =================
socket.on("state", (data) => {
    players = data.players;
    bullets = data.bullets;

    if (!usernameSet) return;

    if (players[myId]) {
        document.getElementById("coins").innerText = players[myId].coins;
        document.getElementById("weapon").innerText = players[myId].weapon;
    }

    // Update leaderboard (top 5)
    const sorted = Object.values(players)
        .sort((a,b)=>b.coins - a.coins)
        .slice(0,5);
    const listDiv = document.getElementById("leaderboardList");
    listDiv.innerHTML = "";
    sorted.forEach(p=>{
        listDiv.innerHTML += `<div>${p.name}: ${p.coins}</div>`;
    });
});

// Crate animations
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

// ================= Controls =================
function toggleShop() {
    const shop = document.getElementById("shop");
    shop.style.display = shop.style.display === "none" ? "block" : "none";
}

function openCrate(type) {
    socket.emit("openCrate", type);
}

document.addEventListener("keydown", e => { if (e.key in keys) keys[e.key] = true; });
document.addEventListener("keyup", e => { if (e.key in keys) keys[e.key] = false; });

canvas.addEventListener("click", (e) => {
    if (!usernameSet) return;
    const me = players[myId];
    if (!me) return;

    const rect = canvas.getBoundingClientRect();
    const worldX = e.clientX - rect.left + camera.x;
    const worldY = e.clientY - rect.top + camera.y;

    const angle = Math.atan2(worldY - me.y, worldX - me.x);
    socket.emit("shoot", { angle });
});

// Movement
function handleMovement() {
    if (!usernameSet) return;
    const speed = 5;
    let dx=0, dy=0;
    if (keys.w) dy -= speed;
    if (keys.s) dy += speed;
    if (keys.a) dx -= speed;
    if (keys.d) dx += speed;
    if (dx || dy) socket.emit("move", { dx, dy });
}

// Camera
function updateCamera() {
    if (!usernameSet) return;
    const me = players[myId];
    if (!me) return;

    camera.x = me.x - canvas.width/2;
    camera.y = me.y - canvas.height/2;

    camera.x = Math.max(0, Math.min(camera.x, MAP_WIDTH - canvas.width));
    camera.y = Math.max(0, Math.min(camera.y, MAP_HEIGHT - canvas.height));
}

// ================= Background =================
function drawBackground() {
    // Stormy gradient
    const grad = ctx.createLinearGradient(0, 0, 0, MAP_HEIGHT);
    grad.addColorStop(0, "#111");
    grad.addColorStop(1, "#222");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Grid overlay
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const gridSize = 100;
    for (let x = 0; x <= MAP_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, MAP_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= MAP_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(MAP_WIDTH, y);
        ctx.stroke();
    }

    // Lightning flash
    if (Math.random() < 0.002 && lightning === 0) lightning = 5;
    if (lightning > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
        lightning--;
    }
}

// ================= Minimap =================
function drawMinimap() {
    if (!usernameSet) return;
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

// ================= Draw Loop =================
function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    handleMovement();
    updateCamera();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

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

        // Username
        ctx.fillStyle = "white";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(p.name, p.x + 15, p.y - 15);
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

