const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;
const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

let players = {};
let bullets = [];
let crates = [];

function spawnCrate() {
    crates.push({
        id: Date.now() + Math.random(),
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT
    });
}

setInterval(() => {
    if (crates.length < 15) spawnCrate();
}, 3000);

io.on("connection", (socket) => {

    socket.on("joinGame", (username) => {

        username = typeof username === "string" ? username.trim() : "Player";
        if (!username) username = "Player";
        username = username.substring(0, 16);
        username = username.replace(/[^a-zA-Z0-9_ ]/g, "");

        players[socket.id] = {
            x: 1500,
            y: 1500,
            speed: 5,
            hp: 100,
            coins: 0,
            weapon: "pistol",
            lastShot: 0,
            name: username
        };
    });

    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.x += data.dx * p.speed;
        p.y += data.dy * p.speed;

        p.x = Math.max(0, Math.min(MAP_WIDTH, p.x));
        p.y = Math.max(0, Math.min(MAP_HEIGHT, p.y));
    });

    socket.on("shoot", (angle) => {
        const p = players[socket.id];
        if (!p) return;

        const now = Date.now();
        const fireRate = p.weapon === "rifle" ? 150 : 400;
        if (now - p.lastShot < fireRate) return;

        p.lastShot = now;

        bullets.push({
            x: p.x,
            y: p.y,
            angle,
            speed: 12,
            owner: socket.id,
            damage: p.weapon === "rifle" ? 15 : 25
        });
    });

    socket.on("buyWeapon", (weapon) => {
        const p = players[socket.id];
        if (!p) return;

        if (weapon === "rifle" && p.coins >= 100) {
            p.weapon = "rifle";
            p.coins -= 100;
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

function updateGame() {

    bullets.forEach((b, index) => {
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;

        if (b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT) {
            bullets.splice(index, 1);
            return;
        }

        for (let id in players) {
            if (id === b.owner) continue;

            const p = players[id];
            const dx = p.x - b.x;
            const dy = p.y - b.y;

            if (Math.sqrt(dx * dx + dy * dy) < 20) {
                p.hp -= b.damage;
                bullets.splice(index, 1);

                if (p.hp <= 0) {
                    players[b.owner].coins += 50;
                    p.hp = 100;
                    p.x = 1500;
                    p.y = 1500;
                }
                break;
            }
        }
    });

    // Crate pickup
    for (let id in players) {
        const p = players[id];

        crates.forEach((c, index) => {
            const dx = p.x - c.x;
            const dy = p.y - c.y;

            if (Math.sqrt(dx * dx + dy * dy) < 25) {
                p.coins += 25;
                crates.splice(index, 1);
            }
        });
    }

    io.volatile.emit("state", { players, bullets, crates });
}

setInterval(updateGame, 1000 / 30);

server.listen(PORT, () => {
    console.log("Rise of Ikon running on port " + PORT);
});

