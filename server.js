const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

let players = {};
let bullets = [];

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

/* ============================= */
/* WEAPONS */
/* ============================= */

const weapons = {
    pistol: { fireRate: 400, damage: 20 },
    rifle: { fireRate: 200, damage: 15 },
    sniper: { fireRate: 1000, damage: 80 }
};

function randomSpawn() {
    return {
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT
    };
}

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
        const p = players[socket.id];
        if (!p) return;

        p.x += data.dx;
        p.y += data.dy;
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
            speed: 12,
            damage: weapon.damage,
            owner: socket.id
        });
    });

    socket.on("openCrate", type => {

        const p = players[socket.id];
        if (!p) return;

        let cost = 0;
        let reward = "pistol";

        if (type === "epic") {
            cost = 10;
            reward = "pistol";
        }

        if (type === "rare") {
            cost = 50;
            reward = "rifle";
        }

        if (type === "legendary") {
            cost = 100;
            reward = "sniper";
        }

        if (p.coins < cost) return;

        p.coins -= cost;
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

    bullets.forEach((b, index) => {

        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;

        for (let id in players) {

            if (id === b.owner) continue;

            const p = players[id];
            const dx = p.x - b.x;
            const dy = p.y - b.y;

            if (Math.sqrt(dx*dx + dy*dy) < 20) {

                p.hp -= b.damage;
                bullets.splice(index, 1);

                if (p.hp <= 0) {

                    const killer = players[b.owner];
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
