const socket = io({
    transports: ["websocket"]
});

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let bullets = [];
let myId = null;

let camera = { x: 0, y: 0 };

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", (data) => {

    players = data.players || {};

    if (Array.isArray(data.bullets)) {
        bullets = data.bullets;
    } else {
        bullets = [];
    }

    if (players[myId]) {
        document.getElementById("coins").innerText = players[myId].coins;
        document.getElementById("weapon").innerText = players[myId].weapon;
    }
});

let keys = {};

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

document.addEventListener("click", (e) => {
    if (!players[myId]) return;

    let angle = Math.atan2(
        e.clientY - canvas.height / 2,
        e.clientX - canvas.width / 2
    );

    socket.emit("shoot", {
        x: players[myId].x,
        y: players[myId].y,
        angle: angle
    });
});

function update() {
    if (!players[myId]) return;

    let p = players[myId];

    if (keys["w"]) p.y -= 5;
    if (keys["s"]) p.y += 5;
    if (keys["a"]) p.x -= 5;
    if (keys["d"]) p.x += 5;

    socket.emit("move", { x: p.x, y: p.y });

    // Smooth camera
    camera.x += ((p.x - canvas.width/2) - camera.x) * 0.1;
    camera.y += ((p.y - canvas.height/2) - camera.y) * 0.1;
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // Map
    ctx.fillStyle = "#444";
    ctx.fillRect(0, 0, 2000, 2000);

    // Players
    for (let id in players) {
        let p = players[id];
        ctx.fillStyle = id === myId ? "white" : "red";
        ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
    }

    // Bullets
    ctx.fillStyle = "yellow";
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 5, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.restore();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();

/* =========================
   SHOP + CRATE SYSTEM
========================= */

document.getElementById("shopBtn").onclick = () => {
    document.getElementById("shop").style.display = "block";
};

function closeShop() {
    document.getElementById("shop").style.display = "none";
}

function buyCrate(type) {
    if (!players[myId]) return;

    let cost = 0;
    if (type === "epic") cost = 10;
    if (type === "rare") cost = 100;
    if (type === "special") cost = 500;

    if (players[myId].coins < cost) {
        alert("Not enough coins!");
        return;
    }

    socket.emit("addCoins", -cost);

    let weapon = getDrop(type);
    socket.emit("setWeapon", weapon);

    alert("You got: " + weapon);
}

function getDrop(type) {
    let roll = Math.random() * 100;

    if (type === "epic") {
        if (roll < 65) return randomCommon();
        if (roll < 80) return randomRare();
        return "Testi";
    }

    if (type === "rare") {
        if (roll < 60) return randomCommon();
        if (roll < 90) return randomRare();
        return "Testi";
    }

    if (type === "special") {
        if (roll < 59) return randomCommon();
        if (roll < 90) return randomRare();
        return "Testi";
    }
}

function randomCommon() {
    let weapons = ["Flawless", "Cramp", "FIT"];
    return weapons[Math.floor(Math.random() * weapons.length)];
}

function randomRare() {
    let weapons = ["Lamp", "Krampus", "Grip"];
    return weapons[Math.floor(Math.random() * weapons.length)];
}
