const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

let players = {};
let bullets = [];

/* ============================= */
/* 🔫 WEAPON SYSTEM */
/* Higher rarity = faster + stronger */
/* ============================= */

const weapons = {
    // 🟢 COMMON
    pistol:   { fireRate: 400, damage: 18 },

    // 🔵 RARE
    rifle:    { fireRate: 220, damage: 22 },
    ak47:     { fireRate: 160, damage: 26 },

    // 🟣 EPIC
    k24:      { fireRate: 130, damage: 32 },
    rpg:      { fireRate: 500, damage: 70 },

    // 🟠 LEGENDARY
    sniper:   { fireRate: 350, damage: 90 },
    minigun:  { fireRate: 60,  damage: 15 },

    // 🔴 MYTHIC
    testy:    { fireRate: 45,  damage: 35 },
    laser:    { fireRate: 30,  damage: 40 }
};

/* ============================= */
/* Random Spawn */
/* ============================= */

function randomSpawn() {
    return {
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT
    };
}

/* ============================= */
/* SOCKET CONNECTION */
/* ============================= */

io.on("connection", socket => {

    socket.on("joinGame", username => {
        const spawn = randomSpawn();

        players[socket.id] = {
            id: socket.id,
            username,
            x: spawn.x,
            y: spawn.y,
            hp: 100,
            coins: 50,
            weapon: "pistol",
            lastShot: 0
        };
    });

    socket.on("move", data => {
        const p = players[socket.id];
        if (!p) return;

        p.x += data.dx;
        p.y += data.dy;

        // Map boundaries
        p.x = Math.max(0, Math.min(MAP_WIDTH, p.x));
        p.y = Math.max(0, Math.min(MAP_HEIGHT, p.y));
    });

    socket.on("shoot", angle => {
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
            speed: 14,
            damage: weapon.damage,
            owner: socket.id
        });
    });

    /* ============================= */
    /* 🎁 CRATE SYSTEM */
    /* ============================= */

    socket.on("openCrate", type => {
        const p = players[socket.id];
        if (!p) return;

        let cost = 0;
        let pool = [];

        if (type === "rare") {
            cost = 50;
            pool = ["rifle", "ak47"];
        }

        if (type === "epic") {
            cost = 100;
            pool = ["k24", "rpg"];
        }

        if (type === "legendary") {
            cost = 200;
            pool = ["sniper", "minigun"];
        }

        if (type === "mythic") {
            cost = 400;
            pool = ["laser", "testy"];
        }

        if (p.coins < cost) return;

        p.coins -= cost;

        const reward = pool[Math.floor(Math.random() * pool.length)];
        p.weapon = reward;

        socket.emit("crateResult", reward);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

/* ============================= */
/* GAME LOOP */
/* ============================= */

setInterval(() => {

    // Move bullets
    bullets.forEach((b, index) => {
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;

        // Remove if out of map
        if (
            b.x < 0 ||
            b.x > MAP_WIDTH ||
            b.y < 0 ||
            b.y > MAP_HEIGHT
        ) {
            bullets.splice(index, 1);
            return;
        }

        // Check collision
        for (let id in players) {
            if (id === b.owner) continue;

            const p = players[id];
            const dx = p.x - b.x;
            const dy = p.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 20) {
                p.hp -= b.damage;

                if (p.hp <= 0) {
                    const killer = players[b.owner];
                    if (killer) killer.coins += 50;

                    const spawn = randomSpawn();
                    p.x = spawn.x;
                    p.y = spawn.y;
                    p.hp = 100;
                }

                bullets.splice(index, 1);
                break;
            }
        }
    });

    io.emit("update", { players, bullets });

}, 1000 / 60);

/* ============================= */

server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});
