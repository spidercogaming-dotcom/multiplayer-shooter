const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

const WORLD_SIZE = 2000;
const players = {};

const crates = {
    basic: {
        cost: 10,
        rewards: ["Flawless", "Shadow"]
    },
    epic: {
        cost: 25,
        rewards: ["Blaze", "Testi"]
    }
};

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    players[socket.id] = {
        id: socket.id,
        x: Math.random() * WORLD_SIZE,
        y: Math.random() * WORLD_SIZE,
        hp: 100,
        coins: 10,
        weapon: "Flawless",
        dead: false
    };

    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p || p.dead) return;

        p.x += data.dx;
        p.y += data.dy;

        p.x = Math.max(0, Math.min(WORLD_SIZE, p.x));
        p.y = Math.max(0, Math.min(WORLD_SIZE, p.y));
    });

    socket.on("damage", (targetId) => {
        const attacker = players[socket.id];
        const target = players[targetId];
        if (!attacker || !target || target.dead) return;

        target.hp -= 25;

        if (target.hp <= 0) {
            target.dead = true;
            attacker.coins += 20;
        }
    });

    socket.on("respawn", () => {
        const p = players[socket.id];
        if (!p) return;

        p.x = Math.random() * WORLD_SIZE;
        p.y = Math.random() * WORLD_SIZE;
        p.hp = 100;
        p.dead = false;
    });

    socket.on("openCrate", (type) => {
        const p = players[socket.id];
        const crate = crates[type];
        if (!p || !crate) return;
        if (p.coins < crate.cost) return;

        p.coins -= crate.cost;

        const reward =
            crate.rewards[Math.floor(Math.random() * crate.rewards.length)];

        p.weapon = reward;
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

setInterval(() => {
    io.emit("state", players);
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
