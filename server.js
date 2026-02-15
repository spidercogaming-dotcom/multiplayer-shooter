const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

const WORLD_SIZE = 2000;
let players = {};

io.on("connection", (socket) => {
    console.log("Connected:", socket.id);

    players[socket.id] = {
        x: Math.random() * WORLD_SIZE,
        y: Math.random() * WORLD_SIZE,
        coins: 10,
        hp: 100
    };

    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.x += data.dx;
        p.y += data.dy;
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
    console.log("Server running on", PORT);
});
