const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

const WORLD_SIZE = 2000;
let players = {};

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
        x: Math.random() * WORLD_SIZE,
        y: Math.random() * WORLD_SIZE,
        coins: 10,
        weapon: "Flawless"
    };

    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.x += data.dx;
        p.y += data.dy;
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

