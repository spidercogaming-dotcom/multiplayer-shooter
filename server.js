const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const MAP_SIZE = 2000;

let players = {};
let bullets = [];

/* ================= FIRE RATE ================= */
function getFireRate(weapon) {
    if (["Flawless","Cramp","FIT"].includes(weapon)) return 500;
    if (["Lamp","Krampus","Grip"].includes(weapon)) return 300;
    if (weapon === "Testi") return 120;
    return 500;
}

/* ================= SAFE SPAWN ================= */
function randomSpawn() {
    const margin = 200;
    return {
        x: margin + Math.random() * (MAP_SIZE - margin * 2),
        y: margin + Math.random() * (MAP_SIZE - margin * 2)
    };
}

io.on("connection", (socket) => {

    const spawn = randomSpawn();

    players[socket.id] = {
        x: spawn.x,
        y: spawn.y,
        vx: 0,
        vy: 0,
        health: 100,
        coins: 500,
        weapon: "Flawless",
        lastShot: 0
    };

    socket.on("move", (data) => {
        if (!players[socket.id]) return;
        players[socket.id].vx = data.vx;
        players[socket.id].vy = data.vy;
    });

    socket.on("shoot", (angle) => {
        const p = players[socket.id];
        if (!p) return;

        const now = Date.now();
        const fireRate = getFireRate(p.weapon);

        if (now - p.lastShot < fireRate) return;
        p.lastShot = now;

        bullets.push({
            x: p.x,
            y: p.y,
            angle,
            speed: 10,
            owner: socket.id
        });
    });

    socket.on("addCoins", (amount) => {
        if (players[socket.id])
            players[socket.id].coins += amount;
    });

    socket.on("setWeapon", (weapon) => {
        if (players[socket.id])
            players[socket.id].weapon = weapon;
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

/* ================= GAME LOOP ================= */
setInterval(() => {

    for (let id in players) {
        let p = players[id];

        p.x += p.vx * 3;   // slower movement
        p.y += p.vy * 3;

        p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, p.y));
    }

    bullets.forEach(b => {
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
    });

    bullets = bullets.filter(b => {

        for (let id in players) {
            if (id === b.owner) continue;

            const p = players[id];
            const dx = p.x - b.x;
            const dy = p.y - b.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            if (dist < 15) {
                p.health -= 25;

                if (p.health <= 0) {
                    players[b.owner].coins += 100;
                    const spawn = randomSpawn();
                    p.x = spawn.x;
                    p.y = spawn.y;
                    p.health = 100;
                }

                return false;
            }
        }

        return (
            b.x > 0 && b.x < MAP_SIZE &&
            b.y > 0 && b.y < MAP_SIZE
        );
    });

    io.emit("state", { players, bullets });

}, 1000 / 60);

server.listen(PORT, () => {
    console.log("Server running on", PORT);
});

