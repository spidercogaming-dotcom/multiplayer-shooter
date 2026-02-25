const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = 3000;
const MAP_SIZE = 3000;

const players = {};

const weapons = {
    pistol: { damage: 20, fireRate: 400, range: 700 },
    rifle: { damage: 15, fireRate: 150, range: 900 },
    sniper: { damage: 60, fireRate: 900, range: 1500 },
    shotgun: { damage: 35, fireRate: 700, range: 500 },
    minigun: { damage: 8, fireRate: 80, range: 800 }
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

    socket.on("setWeapon", weapon => {
        if (weapons[weapon]) {
            players[socket.id].weapon = weapon;
        }
    });

    // 🔥 FIXED SHOOT SYSTEM
    socket.on("shoot", target => {
        const shooter = players[socket.id];
        if (!shooter) return;

        const weapon = weapons[shooter.weapon];
        const now = Date.now();

        if (now - shooter.lastShot < weapon.fireRate) return;
        shooter.lastShot = now;

        const dx = target.x - shooter.x;
        const dy = target.y - shooter.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;

        const dirX = dx / dist;
        const dirY = dy / dist;

        const maxRange = weapon.range;
        const stepSize = 15;

        let hitX = shooter.x;
        let hitY = shooter.y;
        let hit = false;

        for (let i = 0; i < maxRange; i += stepSize) {
            hitX = shooter.x + dirX * i;
            hitY = shooter.y + dirY * i;

            for (let id in players) {
                if (id === socket.id) continue;

                const p = players[id];
                const d = Math.hypot(p.x - hitX, p.y - hitY);

                if (d < 20) {
                    p.hp -= weapon.damage;

                    if (p.hp <= 0) {
                        p.hp = 100;
                        p.x = Math.random() * MAP_SIZE;
                        p.y = Math.random() * MAP_SIZE;
                        shooter.coins += 20;
                    }

                    hit = true;
                    break;
                }
            }

            if (hit) break;
        }

        io.emit("shotFired", {
            x1: shooter.x,
            y1: shooter.y,
            x2: hitX,
            y2: hitY
        });
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

setInterval(() => {
    io.emit("gameState", { players });
}, 1000 / 60);

server.listen(PORT, () => {
    console.log("Server running on port " + PORT);
});

