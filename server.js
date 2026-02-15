const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

const players = {};
const WORLD_SIZE = 2000;

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
        if (!players[socket.id] || players[socket.id].dead) return;

        players[socket.id].x += data.dx;
        players[socket.id].y += data.dy;

        players[socket.id].x = Math.max(0, Math.min(WORLD_SIZE, players[socket.id].x));
        players[socket.id].y = Math.max(0, Math.min(WORLD_SIZE, players[socket.id].y));
    });

    socket.on("damage", (targetId) => {
        if (!players[targetId] || players[targetId].dead) return;

        players[targetId].hp -= 25;

        if (players[targetId].hp <= 0) {
            players[targetId].dead = true;
            players[socket.id].coins += 20;
        }
    });

    socket.on("respawn", () => {
        players[socket.id] = {
            ...players[socket.id],
            x: Math.random() * WORLD_SIZE,
            y: Math.random() * WORLD_SIZE,
            hp: 100,
            dead: false
        };
    });

    socket.on("openCrate", () => {
        const p = players[socket.id];
        if (!p || p.coins < 10) return;

        p.coins -= 10;

        const rewards = ["Flawless", "Shadow", "Blaze", "Testi"];
        const reward = rewards[Math.floor(Math.random() * rewards.length)];

        p.weapon = reward;
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

setInterval(() => {
    io.emit("state", players);
}, 1000 / 60);

server.listen(3000, () => console.log("Server running on 3000"));
