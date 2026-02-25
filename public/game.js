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

const weapons = {
    pistol: { damage: 10, fireRate: 400, range: 700 },
    rifle: { damage: 15, fireRate: 250, range: 800 },
    rpg: { damage: 40, fireRate: 900, range: 600 },
    ak47: { damage: 20, fireRate: 180, range: 750 },
    revolver: { damage: 25, fireRate: 500, range: 650 },
    sniper: { damage: 50, fireRate: 1000, range: 1200 },
    shotgun: { damage: 35, fireRate: 600, range: 400 },
    minigun: { damage: 8, fireRate: 80, range: 700 },
    laser: { damage: 60, fireRate: 700, range: 1000 }
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

        const endX = shooter.x + dirX * weapon.range;
        const endY = shooter.y + dirY * weapon.range;

        for (let id in players) {
            if (id === socket.id) continue;

            const p = players[id];

            // Distance from player to shot line
            const A = endY - shooter.y;
            const B = shooter.x - endX;
            const C = endX * shooter.y - shooter.x * endY;

            const distanceFromLine =
                Math.abs(A * p.x + B * p.y + C) /
                Math.hypot(A, B);

            const withinRange =
                Math.hypot(p.x - shooter.x, p.y - shooter.y) <= weapon.range;

            if (distanceFromLine < 20 && withinRange) {
                p.hp -= weapon.damage;

                if (p.hp <= 0) {
                    p.hp = 100;
                    p.x = Math.random() * MAP_SIZE;
                    p.y = Math.random() * MAP_SIZE;
                    shooter.coins += 20;
                }

                break;
            }
        }

        // Visual tracer effect
        io.emit("shotFired", {
            x1: shooter.x,
            y1: shooter.y,
            x2: endX,
            y2: endY
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
    console.log("Server running on port", PORT);
});

