const express = require("express");
const http = require("http");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = require("socket.io")(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const MAP_SIZE = 3000;

let players = {};
let bullets = [];

const weapons = {
    pistol: { damage: 10, fireRate: 400 },
    rifle: { damage: 15, fireRate: 250 },
    rpg: { damage: 40, fireRate: 900 },
    ak47: { damage: 20, fireRate: 180 },
    revolver: { damage: 25, fireRate: 500 },
    sniper: { damage: 50, fireRate: 1000 },
    shotgun: { damage: 35, fireRate: 600 },
    minigun: { damage: 8, fireRate: 80 },
    laser: { damage: 60, fireRate: 700 }
};

const crateCosts = {
    rare: 50,
    epic: 100,
    legendary: 200
};

io.on("connection", socket => {

    socket.on("joinGame", username => {
        players[socket.id] = {
            id: socket.id,
            username,
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            hp: 100,
            coins: 0,
            weapon: "pistol",
            lastShot: 0
        };
    });

    socket.on("move", data => {
        const p = players[socket.id];
        if (!p) return;

        p.x += data.dx;
        p.y += data.dy;

        p.x = Math.max(0, Math.min(MAP_SIZE, p.x));
        p.y = Math.max(0, Math.min(MAP_SIZE, p.y));
    });

    socket.on("shoot", target => {
        const p = players[socket.id];
        if (!p) return;

        const weapon = weapons[p.weapon];
        const now = Date.now();

        if (now - p.lastShot < weapon.fireRate) return;
        p.lastShot = now;

        bullets.push({
            x: p.x,
            y: p.y,
            targetX: target.x,
            targetY: target.y,
            owner: socket.id,
            damage: weapon.damage,
            createdAt: Date.now()
        });
    });

    socket.on("openCrate", type => {
        const p = players[socket.id];
        if (!p || !crateCosts[type]) return;

        if (p.coins < crateCosts[type]) {
            io.to(socket.id).emit("notEnoughCoins");
            return;
        }

        p.coins -= crateCosts[type];

        let reward;

        if (type === "rare") {
            reward = Math.random() < 0.6 ? "pistol" : "rifle";
        }

        if (type === "epic") {
            const r = Math.random();
            reward = r < 0.4 ? "rpg" :
                     r < 0.7 ? "ak47" :
                     "revolver";
        }

        if (type === "legendary") {
            const r = Math.random();
            reward = r < 0.3 ? "sniper" :
                     r < 0.55 ? "shotgun" :
                     r < 0.8 ? "minigun" :
                     "laser";
        }

        if (weapons[reward]) {
            p.weapon = reward;
            io.to(socket.id).emit("crateReward", reward);
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

setInterval(() => {

    bullets = bullets.filter(b => {

        if (Date.now() - b.createdAt > 1500) return false;

        const dx = b.targetX - b.x;
        const dy = b.targetY - b.y;
        const dist = Math.hypot(dx, dy);

        if (dist === 0) return false;

        b.x += (dx / dist) * 20;
        b.y += (dy / dist) * 20;

        for (let id in players) {
            if (id === b.owner) continue;

            const p = players[id];
            const d = Math.hypot(p.x - b.x, p.y - b.y);

            if (d < 20) {
                p.hp -= b.damage;

                if (p.hp <= 0) {
                    p.hp = 100;
                    p.x = Math.random() * MAP_SIZE;
                    p.y = Math.random() * MAP_SIZE;

                    if (players[b.owner]) {
                        players[b.owner].coins += 20;
                    }
                }

                return false;
            }
        }

        return true;
    });

    io.emit("gameState", { players, bullets });

}, 1000 / 60);

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});

