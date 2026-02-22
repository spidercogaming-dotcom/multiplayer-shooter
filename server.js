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

const weapons = {
    pistol: { fireRate: 400, damage: 20 },
    rpg: { fireRate: 600, damage: 50 },
    rifle: { fireRate: 200, damage: 15 },
    ak47: { fireRate: 150, damage: 18 },
    sniper: { fireRate: 800, damage: 80 },
    minigun: { fireRate: 70, damage: 8 },
    k24: { fireRate: 120, damage: 22 },
    testy: { fireRate: 50, damage: 10 },
    laser: { fireRate: 40, damage: 12 }
};

io.on("connection", (socket) => {

    socket.on("joinGame", (username) => {
        players[socket.id] = {
            x: Math.random() * MAP_WIDTH,
            y: Math.random() * MAP_HEIGHT,
            hp: 100,
            coins: 10,
            weapon: "pistol",
            lastShot: 0,
            name: username || "Ikon"
        };
    });

    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.x += data.dx * 5;
        p.y += data.dy * 5;

        p.x = Math.max(0, Math.min(MAP_WIDTH, p.x));
        p.y = Math.max(0, Math.min(MAP_HEIGHT, p.y));
    });

    socket.on("shoot", (angle) => {
        const p = players[socket.id];
        if (!p) return;

        const weapon = weapons[p.weapon];
        const now = Date.now();
        if (now - p.lastShot < weapon.fireRate) return;
        p.lastShot = now;

        bullets.push({
            x: p.x,
            y: p.y,
            angle,
            speed: 12,
            owner: socket.id,
            damage: weapon.damage
        });
    });

    socket.on("openCrate", (type) => {
        const p = players[socket.id];
        if (!p) return;

        let cost = 0;
        if (type === "epic") cost = 10;
        if (type === "rare") cost = 50;
        if (type === "legendary") cost = 100;

        if (p.coins < cost) return;

        p.coins -= cost;

        let reward;

        if (type === "epic") {
            reward = "pistol";
        }

        if (type === "rare") {
            const rareWeapons = ["rpg", "rifle", "ak47"];
            reward = rareWeapons[Math.floor(Math.random() * rareWeapons.length)];
        }

        if (type === "legendary") {
            const legendaryWeapons = ["sniper", "minigun", "k24", "testy", "laser"];
            const rand = Math.random();
            if (rand < 0.4) reward = "sniper";
            else if (rand < 0.65) reward = "minigun";
            else if (rand < 0.85) reward = "k24";
            else if (rand < 0.97) reward = "testy";
            else reward = "laser";
        }

        p.weapon = reward;
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

function updateGame() {

    for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];

        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;

        if (b.x < 0 || b.x > MAP_WIDTH || b.y < 0 || b.y > MAP_HEIGHT) {
            bullets.splice(i, 1);
            continue;
        }

        for (let id in players) {
            if (id === b.owner) continue;

            const p = players[id];
            const dx = p.x - b.x;
            const dy = p.y - b.y;

            if (Math.sqrt(dx*dx + dy*dy) < 20) {
                p.hp -= b.damage;
                bullets.splice(i, 1);

                if (p.hp <= 0) {
                    const killer = players[b.owner];
                    if (killer) killer.coins += 20;

                    p.hp = 100;
                    p.x = Math.random() * MAP_WIDTH;
                    p.y = Math.random() * MAP_HEIGHT;
                }
                break;
            }
        }
    }

    io.volatile.emit("state", { players, bullets });
}

setInterval(updateGame, 1000/30);

server.listen(PORT, () => {
    console.log("Rise of Ikon running on port " + PORT);
});
