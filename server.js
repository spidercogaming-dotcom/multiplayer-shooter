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
const MAX_NAME_LENGTH = 16;

let players = {};

io.on("connection", (socket) => {

    socket.on("joinGame", (username) => {

        if (typeof username !== "string") username = "Player";
        username = username.trim();
        if (username.length === 0) username = "Player";
        if (username.length > MAX_NAME_LENGTH)
            username = username.substring(0, MAX_NAME_LENGTH);

        username = username.replace(/[^a-zA-Z0-9_ ]/g, "");

        players[socket.id] = {
            x: 1500,
            y: 1500,
            speed: 5,
            name: username,
            lastNameChange: 0
        };
    });

    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;

        p.x += data.dx * p.speed;
        p.y += data.dy * p.speed;

        p.x = Math.max(0, Math.min(MAP_WIDTH, p.x));
        p.y = Math.max(0, Math.min(MAP_HEIGHT, p.y));
    });

    socket.on("setUsername", (newName) => {
        const p = players[socket.id];
        if (!p) return;

        const now = Date.now();
        if (now - p.lastNameChange < 5000) return;

        if (typeof newName !== "string") return;

        newName = newName.trim();
        if (newName.length === 0 || newName.length > MAX_NAME_LENGTH) return;

        newName = newName.replace(/[^a-zA-Z0-9_ ]/g, "");

        p.name = newName;
        p.lastNameChange = now;
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

setInterval(() => {
    io.volatile.emit("state", { players });
}, 1000 / 30);

server.listen(PORT, () => {
    console.log("Rise of Ikon running on port " + PORT);
});

