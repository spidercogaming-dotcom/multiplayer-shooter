const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let players = {};
let bullets = [];

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    players[socket.id] = {
        x: 200,
        y: 200,
        coins: 0,
        weapon: "Flawless"
    };

    socket.on("move", (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
        }
    });

    socket.on("shoot", (data) => {
        bullets.push({
            x: data.x,
            y: data.y,
            angle: data.angle,
            speed: 8,
            owner: socket.id
        });
    });

    socket.on("addCoins", (amount) => {
        if (players[socket.id]) {
            players[socket.id].coins += amount;
        }
    });

    socket.on("setWeapon", (weaponName) => {
        if (players[socket.id]) {
            players[socket.id].weapon = weaponName;
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

setInterval(() => {
    bullets.forEach((b) => {
        b.x += Math.cos(b.angle) * b.speed;
        b.y += Math.sin(b.angle) * b.speed;
    });

    io.emit("state", { players, bullets });
}, 1000 / 60);

server.listen(3000, () => {
    console.log("Server running on port 3000");
});


