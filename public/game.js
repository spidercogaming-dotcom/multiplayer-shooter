const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

let username = "";
let coins = 0;

let player = {
    x: MAP_WIDTH / 2,
    y: MAP_HEIGHT / 2,
    size: 30,
    speed: 5
};

let keys = {};
let bullets = [];

let fireRate = 400;
let lastShot = 0;

const weapons = {
    common: { name: "Common Blaster", fireRate: 400, color: "white" },
    rare: { name: "Rare Striker", fireRate: 250, color: "blue" },
    epic: { name: "Epic Destroyer", fireRate: 150, color: "purple" },
    legendary: { name: "Legendary Ikon", fireRate: 80, color: "gold" }
};

let crateAnimation = null;
let crateTimer = 0;

function startGame() {
    username = document.getElementById("usernameInput").value || "Ikon";
    document.getElementById("menu").style.display = "none";
    document.getElementById("crateBtn").style.display = "block";
    document.getElementById("coinsDisplay").style.display = "block";
    canvas.style.display = "block";
    gameLoop();
}

window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

canvas.addEventListener("click", shootBullet);

function shootBullet() {
    const now = Date.now();
    if (now - lastShot < fireRate) return;
    lastShot = now;

    bullets.push({
        x: player.x,
        y: player.y,
        dx: 10,
        dy: 0
    });
}

function update() {

    if (keys["w"]) player.y -= player.speed;
    if (keys["s"]) player.y += player.speed;
    if (keys["a"]) player.x -= player.speed;
    if (keys["d"]) player.x += player.speed;

    bullets.forEach(b => {
        b.x += b.dx;
        b.y += b.dy;
    });

    bullets = bullets.filter(b => 
        b.x < MAP_WIDTH && b.y < MAP_HEIGHT && b.x > 0 && b.y > 0
    );
}

function drawBackground() {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    const gridSize = 100;

    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

function drawPlayer() {
    ctx.fillStyle = "red";
    ctx.fillRect(
        canvas.width/2 - player.size/2,
        canvas.height/2 - player.size/2,
        player.size,
        player.size
    );

    ctx.fillStyle = "white";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.fillText(username, canvas.width/2, canvas.height/2 - 20);
}

function drawBullets() {
    ctx.fillStyle = "yellow";
    bullets.forEach(b => {
        ctx.fillRect(
            canvas.width/2 + (b.x - player.x),
            canvas.height/2 + (b.y - player.y),
            5, 5
        );
    });
}

function drawMiniMap() {
    const size = 150;
    const x = canvas.width - size - 20;
    const y = 20;

    ctx.fillStyle = "#222";
    ctx.fillRect(x, y, size, size);

    ctx.fillStyle = "red";
    ctx.fillRect(
        x + (player.x / MAP_WIDTH) * size,
        y + (player.y / MAP_HEIGHT) * size,
        5, 5
    );
}

function openCrate() {
    if (coins < 50) {
        alert("Not enough coins!");
        return;
    }

    coins -= 50;

    let rand = Math.random();
    let reward;

    if (rand < 0.6) reward = weapons.common;
    else if (rand < 0.85) reward = weapons.rare;
    else if (rand < 0.95) reward = weapons.epic;
    else reward = weapons.legendary;

    fireRate = reward.fireRate;

    crateAnimation = reward;
    crateTimer = 120;
}

function drawCrateAnimation() {
    if (crateTimer > 0) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0,0,canvas.width,canvas.height);

        ctx.fillStyle = crateAnimation.color;
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.fillText(
            crateAnimation.name,
            canvas.width/2,
            canvas.height/2
        );

        crateTimer--;
    }
}

function gameLoop() {
    update();
    drawBackground();
    drawBullets();
    drawPlayer();
    drawMiniMap();
    drawCrateAnimation();

    document.getElementById("coinsDisplay").innerText = "Coins: " + coins;

    requestAnimationFrame(gameLoop);
}

