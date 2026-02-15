const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = {};
let bullets = [];

const weapons = {
    pistol: { fireRate: 500, damage: 20 },
    rifle: { fireRate: 250, damage: 15 },
    testi: { fireRate: 100, damage: 10 } // fastest
};

io.on("connection", (socket) => {

    players[socket.id] = {
        x: 500,
        y: 300,
        hp: 100,
        coins: 10,
        weapon: "pistol",
        lastShot: 0
    };

    socket.on("move", ({ dx, dy }) => {
        const p = players[socket.id];
        if (!p) return;

        p.x += dx;
        p.y += dy;
    });

    socket.on("shoot", ({ angle }) => {
        const p = players[socket.id];
        if (!p) return;

        const now = Date.now();
        const weapon = weapons[p.weapon];

        if (now - p.lastShot < weapon.fireRate) return;

        p.lastShot = now;

        bullets.push({
            x: p.x + 15,
            y: p.y + 15,
            vx: Math.cos(angle) * 10,
            vy: Math.sin(angle) * 10,
            owner: socket.id,
            damage: weapon.damage
        });
    });

    socket.on("openCrate", (type) => {
        const p = players[socket.id];
        if (!p || p.coins < 10) return;

        p.coins -= 10;

        const rand = Math.random();

        if (rand < 0.60) p.weapon = "pistol";
        else if (rand < 0.90) p.weapon = "rifle";
        else p.weapon = "testi"; // 10% chance
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

function gameLoop() {

    bullets.forEach((b, index) => {
        b.x += b.vx;
        b.y += b.vy;

        for (let id in players) {
            const p = players[id];

            if (id === b.owner) continue;

            if (
                b.x > p.x &&
                b.x < p.x + 30 &&
                b.y > p.y &&
                b.y < p.y + 30
            ) {
                p.hp -= b.damage;

                if (p.hp <= 0) {
                    p.hp = 100;
                    p.x = 500;
                    p.y = 300;

                    if (players[b.owner]) {
                        players[b.owner].coins += 20; // kill reward
                    }
                }

                bullets.splice(index, 1);
            }
        }
    });

    io.emit("state", { players, bullets });
}

setInterval(gameLoop, 1000 / 60);

server.listen(3000, () => {
    console.log("Server running");
});
