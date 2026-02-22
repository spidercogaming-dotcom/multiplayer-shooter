const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

const MAP_WIDTH = 3000;
const MAP_HEIGHT = 3000;

let players = {};
let bullets = [];

/* ============================= */
/* 🔫 WEAPON SYSTEM */
/* ============================= */

const weapons = {
    pistol: { fireRate: 400, damage: 20 },
    rpg: { fireRate: 1200, damage: 60 },
    rifle: { fireRate: 200, damage: 15 },
    ak47: { fireRate: 150, damage: 18 },
    sniper: { fireRate: 1000, damage: 80 },
    minigun: { fireRate: 80, damage: 10 },
    k24: { fireRate: 250, damage: 22 },
    testy: { fireRate: 60, damage: 25 },
    laser: { fireRate: 40, damage: 30 }
};

function randomSpawn() {
    return {
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT
    };
}

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
            coins: 10,
            weapon: "pistol",
            lastShot: 0
        };
    });

    socket.on("move", data => {
        const player = players[socket.id];
        if (!player) return;

        player.x += data.dx;
        player.y += data.dy;

        player.x = Math.max(0, Math.min(MAP_WIDTH, player.x));
        player.y = Math.max(0, Math.min(MAP_HEIGHT, player.y));
    });

    socket.on("shoot", angle => {

        const player = players[socket.id];
        if (!player) return;

        const weapon = weapons[player.weapon];
        const now = Date.now();

        if (now - player.lastShot < weapon.fireRate) return;

        player.lastShot = now;

        bullets.push({
            x: player.x,
            y: player.y,
            angle,
            speed: 15,
            damage: weapon.damage,
            owner: socket.id
        });
    });

    socket.on("openCrate", type => {

        const player = players[socket.id];
        if (!player) return;

        let cost = 0;
        let pool = [];

        if (type === "epic") {
            cost = 10;
            pool = ["pistol","rpg"];
        }
        if (type === "rare") {
            cost = 50;
            pool = ["rifle","ak47","k24"];
        }
        if (type === "legendary") {
            cost = 100;
            pool = ["sniper","minigun","testy","laser"];
        }

        if (player.coins < cost) return;

        player.coins -= cost;

        const reward = pool[Math.floor(Math.random() * pool.length)];
        player.weapon = reward;

        socket.emit("crateResult", reward);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

/* ============================= */
/* 🎯 GAME LOOP */
/* ============================= */

setInterval(() => {

    bullets.forEach((bullet, index) => {

        bullet.x += Math.cos(bullet.angle) * bullet.speed;
        bullet.y += Math.sin(bullet.angle) * bullet.speed;

        for (let id in players) {
            if (id === bullet.owner) continue;

            const p = players[id];
            const dx = p.x - bullet.x;
            const dy = p.y - bullet.y;

            if (Math.sqrt(dx*dx + dy*dy) < 20) {

                p.hp -= bullet.damage;
                bullets.splice(index, 1);

                if (p.hp <= 0) {
                    const killer = players[bullet.owner];
                    if (killer) killer.coins += 20;

                    const spawn = randomSpawn();
                    p.x = spawn.x;
                    p.y = spawn.y;
                    p.hp = 100;
                }

                break;
            }
        }
    });

    io.emit("state", { players, bullets });

}, 1000 / 60);

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
