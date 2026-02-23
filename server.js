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
const TICK_RATE = 30;
const PLAYER_SPEED = 5;
const HIT_RADIUS = 20;

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
            name: username || "Ikon",
            kills: 0,
            deaths: 0,
            input: { dx: 0, dy: 0 }
        };
    });

    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.input.dx = Math.max(-1, Math.min(1, data.dx));
        p.input.dy = Math.max(-1, Math.min(1, data.dy));
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

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

function updateGame() {

    // Move players (server authoritative)
    for (let id in players) {
        const p = players[id];

        const mag = Math.sqrt(p.input.dx * p.input.dx + p.input.dy * p.input.dy);
        if (mag > 0) {
            const nx = p.input.dx / mag;
            const ny = p.input.dy / mag;

            p.x += nx * PLAYER_SPEED;
            p.y += ny * PLAYER_SPEED;
        }

        p.x = Math.max(0, Math.min(MAP_WIDTH, p.x));
        p.y = Math.max(0, Math.min(MAP_HEIGHT, p.y));
    }

    // Update bullets
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

            const distSq = dx * dx + dy * dy;

            if (distSq < HIT_RADIUS * HIT_RADIUS) {
                p.hp -= b.damage;
                bullets.splice(i, 1);

                if (p.hp <= 0) {
                    const killer = players[b.owner];
                    if (killer) {
                        killer.kills++;
                        killer.coins += 20;
                    }

                    p.deaths++;
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

setInterval(updateGame, 1000 / TICK_RATE);

server.listen(PORT, () => {
    console.log("Rise of Ikons running on port " + PORT);
});

