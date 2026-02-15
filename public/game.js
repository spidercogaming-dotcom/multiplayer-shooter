const socket = io({ transports: ["websocket"] });

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let bullets = [];
let myId = null;
let camera = { x: 0, y: 0 };

const deathScreen = document.getElementById("deathScreen");
const crateScreen = document.getElementById("crateScreen");
const crateWeaponText = document.getElementById("crateWeapon");

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", (data) => {
    players = data.players || {};
    bullets = data.bullets || [];

    if (players[myId]) {
        document.getElementById("coins").innerText = players[myId].coins;
        document.getElementById("weapon").innerText = players[myId].weapon;

        deathScreen.style.display = players[myId].dead ? "block" : "none";
    }
});

/* ================= SHOP ================= */

const shop = document.getElementById("shop");

document.getElementById("shopBtn").onclick = () => {
    shop.style.display = "block";
    canvas.style.pointerEvents = "none";
};

function closeShop() {
    shop.style.display = "none";
    canvas.style.pointerEvents = "auto";
}

function buyCrate(type) {

    if (!players[myId]) return;

    let cost = type === "epic" ? 10 :
               type === "rare" ? 100 : 500;

    if (players[myId].coins < cost) {
        alert("Not enough coins!");
        return;
    }

    socket.emit("addCoins", -cost);
    closeShop();

    const finalWeapon = rollWeapon(type);
    playCrateAnimation(finalWeapon);
}

function rollWeapon(type) {

    const roll = Math.random() * 100;

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
    return ["Flawless","Cramp","FIT"][Math.floor(Math.random()*3)];
}

function randomRare() {
    return ["Lamp","Krampus","Grip"][Math.floor(Math.random()*3)];
}

/* ================= CRATE ANIMATION ================= */

function playCrateAnimation(finalWeapon) {

    crateScreen.style.display = "block";
    crateWeaponText.innerText = "";

    const weapons = [
        "Flawless","Cramp","FIT",
        "Lamp","Krampus","Grip",
        "Testi"
    ];

    let index = 0;
    let speed = 50;
    let spins = 0;

    const interval = setInterval(() => {

        crateWeaponText.innerText = weapons[index];
        index = (index + 1) % weapons.length;
        spins++;

        if (spins > 20) speed += 15;

        if (spins > 40) {
            clearInterval(interval);

            crateWeaponText.innerText = finalWeapon;

            setTimeout(() => {
                crateScreen.style.display = "none";
                socket.emit("setWeapon", finalWeapon);
            }, 1500);
        }

    }, speed);
}

/* ================= MOVEMENT ================= */

let keys = {};

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

canvas.addEventListener("click", (e) => {
    if (!players[myId] || players[myId].dead) return;

    const angle = Math.atan2(
        e.clientY - canvas.height/2,
        e.clientX - canvas.width/2
    );

    socket.emit("shoot", angle);
});

function respawn() {
    socket.emit("respawn");
}

/* ================= GAME LOOP ================= */

function update() {

    if (!players[myId] || players[myId].dead) return;

    let vx = 0;
    let vy = 0;

    if (keys["w"]) vy = -1;
    if (keys["s"]) vy = 1;
    if (keys["a"]) vx = -1;
    if (keys["d"]) vx = 1;

    socket.emit("move", { vx, vy });

    const p = players[myId];

    camera.x += ((p.x - canvas.width/2) - camera.x) * 0.1;
    camera.y += ((p.y - canvas.height/2) - camera.y) * 0.1;
}

function draw() {

    ctx.clearRect(0,0,canvas.width,canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    ctx.fillStyle = "#444";
    ctx.fillRect(0,0,2000,2000);

    for (let id in players) {
        const p = players[id];

        ctx.fillStyle = id === myId ? "white" : "red";
        ctx.fillRect(p.x-10,p.y-10,20,20);

        // health bar
        ctx.fillStyle = "red";
        ctx.fillRect(p.x - 15, p.y - 20, 30, 5);

        ctx.fillStyle = "lime";
        ctx.fillRect(
            p.x - 15,
            p.y - 20,
            30 * (p.health / 100),
            5
        );
    }

    ctx.fillStyle = "yellow";
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x,b.y,5,0,Math.PI*2);
        ctx.fill();
    });

    ctx.restore();
}

function gameLoop(){
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();

