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

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    players[socket.id] = {
        x: 1000,
        y: 1000,
        coins: 500,
        weapon: "Flawless"
    };

    socket.on("move", (data) => {
        if (!players[socket.id]) return;
        players[socket.id].x = data.x;
        players[socket.id].y = data.y;
    });

    socket.on("shoot", (data) => {
        bullets.push({
            x: data.x,
            y: data.y,
            angle: data.angle,
            speed: 10,
            owner: socket.id
        });
    });

    socket.on("addCoins", (amount) => {
        if (!players[socket.id]) return;
        players[socket.id].coins += amount;
    });

    socket.on("setWeapon", (weapon) => {
        if (!players[socket.id]) return;
        players[socket.id].weapon = weapon;
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

setInterval(() => {

    // Move bullets
    bullets.forEach((b) => {
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
    });

    // Remove bullets outside map
    bullets = bullets.filter(b =>
        b.x > 0 && b.x < 2000 &&
        b.y > 0 && b.y < 2000
    );

    io.emit("state", {
        players,
        bullets
    });

}, 1000 / 60);

server.listen(PORT, () => {
    console.log("Server running on port", PORT);
});

