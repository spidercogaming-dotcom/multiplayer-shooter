const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const MAP_WIDTH = 2000;
const MAP_HEIGHT = 2000;

let players = {};
let bullets = [];

const weapons = {
    pistol: { fireRate: 500, damage: 20 },
    rifle: { fireRate: 250, damage: 15 },
    testi: { fireRate: 100, damage: 10 }
};

// Connection
io.on("connection", (socket) => {

    // Assign default username
    let username = "Player" + Math.floor(Math.random() * 1000);

    // Listen for client setting username
    socket.on("setUsername", (name) => {
        name = name || username;
        username = name;
        if (players[socket.id]) players[socket.id].name = username;
    });

    // Initialize player
    players[socket.id] = {
        x: 1000,
        y: 1000,
        hp: 100,
        coins: 10,
        weapon: "pistol",
        lastShot: 0,
        name: username
    };

    // Movement
    socket.on("move", ({ dx, dy }) => {
        const p = players[socket.id];
        if (!p) return;

        p.x += dx;
        p.y += dy;

        p.x = Math.max(0, Math.min(p.x, MAP_WIDTH - 30));
        p.y = Math.max(0, Math.min(p.y, MAP_HEIGHT - 30));
    });

    // Shooting
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

    // Open crate
    socket.on("openCrate", (type) => {
        const p = players[socket.id];
        if (!p) return;

        let cost = 0;
        if (type === "basic") cost = 10;
        if (type === "epic") cost = 25;
        if (type === "legendary") cost = 50;

        if (p.coins < cost) {
            socket.emit("crateDenied");
            return;
        }

        p.coins -= cost;

        const rand = Math.random();

        if (type === "basic") {
            if (rand < 0.7) p.weapon = "pistol";
            else if (rand < 0.95) p.weapon = "rifle";
            else p.weapon = "testi";
        }

        if (type === "epic") {
            if (rand < 0.6) p.weapon = "rifle";
            else if (rand < 0.95) p.weapon = "pistol";
            else p.weapon = "testi";
        }

        if (type === "legendary") {
            if (rand < 0.8) p.weapon = "rifle";
            else p.weapon = "testi";
        }

        socket.emit("crateResult", p.weapon);
    });

    // Disconnect
    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

// Game loop
function gameLoop() {
    bullets.forEach((b, index) => {
        b.x += b.vx;
        b.y += b.vy;

        if (b.x < 0 || b.y < 0 || b.x > MAP_WIDTH || b.y > MAP_HEIGHT) {
            bullets.splice(index, 1);
            return;
        }

        for (let id in players) {
            const p = players[id];
            if (id === b.owner) continue;

            if (b.x > p.x && b.x < p.x + 30 && b.y > p.y && b.y < p.y + 30) {
                p.hp -= b.damage;

                if (p.hp <= 0) {
                    p.hp = 100;
                    p.x = 1000;
                    p.y = 1000;

                    if (players[b.owner]) players[b.owner].coins += 20;
                }

                bullets.splice(index, 1);
            }
        }
    });

    io.emit("state", { players, bullets });
}

setInterval(gameLoop, 1000 / 60);

server.listen(3000, () => console.log("Server running"));

