const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

let players = {};
let bullets = [];
let coins = [];
let healthPacks = [];
let myId = null;
let camera = { x: 0, y: 0 };

const keys = { w:false,a:false,s:false,d:false };

socket.on("connect", () => myId = socket.id);

socket.on("state", (data) => {
    players = data.players;
    bullets = data.bullets;
    coins = data.coins || [];
    healthPacks = data.healthPacks || [];

    if (players[myId]) {
        document.getElementById("coins").innerText = players[myId].coins;
        document.getElementById("weapon").innerText = players[myId].weapon;
        document.getElementById("hp").innerText = players[myId].hp;
    }
});

socket.on("crateResult", (weapon) => {
    const box = document.getElementById("crateAnimation");
    box.innerText = "You got: " + weapon + "!";
    box.style.display = "block";
    setTimeout(() => box.style.display = "none", 1500);
});

function toggleShop() {
    const shop = document.getElementById("shop");
    shop.style.display = shop.style.display === "none" ? "block" : "none";
}

function openCrate(type) {
    socket.emit("openCrate", type);
    startCrateAnimation();
}

function buyHealth() {
    socket.emit("buyItem", "health");
}

function startCrateAnimation() {
    const box = document.getElementById("crateAnimation");
    box.style.display = "block";

    const weapons = ["pistol", "rifle", "sniper", "laser"];
    let i = 0;

    const interval = setInterval(() => {
        box.innerText = "Opening... " + weapons[i % weapons.length];
        i++;
    }, 120);

    socket.once("crateResult", () => clearInterval(interval));
}

document.addEventListener("keydown", e => {
    if (e.key in keys) keys[e.key] = true;
});

document.addEventListener("keyup", e => {
    if (e.key in keys) keys[e.key] = false;
});

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

function collectItems() {
    const me = players[myId];
    if (!me) return;

    // Coins
    coins.forEach((c, index) => {
        if (me.x < c.x + 15 && me.x + 30 > c.x && me.y < c.y + 15 && me.y + 30 > c.y) {
            me.coins += 1;
            coins.splice(index, 1);
        }
    });

    // Health packs
    healthPacks.forEach((h, index) => {
        if (me.x < h.x + 20 && me.x + 30 > h.x && me.y < h.y + 20 && me.y + 30 > h.y) {
            me.hp = Math.min(100, me.hp + h.value);
            healthPacks.splice(index, 1);
        }
    });
}

function drawMinimap() {
    const size = 150;
    const scaleX = size / MAP_WIDTH;
    const scaleY = size / MAP_HEIGHT;

    ctx.fillStyle = "black";
    ctx.fillRect(20, 20, size, size);

    // Players
    for (let id in players) {
        const p = players[id];
        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(20 + p.x * scaleX, 20 + p.y * scaleY, 4, 4);
    }

    // Coins
    coins.forEach(c => {
        ctx.fillStyle = "gold";
        ctx.fillRect(20 + c.x * scaleX, 20 + c.y * scaleY, 3, 3);
    });

    // Health packs
    healthPacks.forEach(h => {
        ctx.fillStyle = "green";
        ctx.fillRect(20 + h.x * scaleX, 20 + h.y * scaleY, 3, 3);
    });
}

function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    handleMovement();
    updateCamera();
    collectItems();

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Map background
    ctx.fillStyle="#222";
    ctx.fillRect(0,0,MAP_WIDTH,MAP_HEIGHT);

    // Coins
    coins.forEach(c => {
        ctx.fillStyle="gold";
        ctx.fillRect(c.x,c.y,15,15);
    });

    // Health packs
    healthPacks.forEach(h => {
        ctx.fillStyle="green";
        ctx.fillRect(h.x,h.y,20,20);
    });

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

