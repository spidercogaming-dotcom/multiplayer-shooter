const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

const MAP_SIZE = 3000;
let players = {};
let bullets = [];

io.on("connection", (socket) => {

    players[socket.id] = {
        id: socket.id,
        x: MAP_SIZE / 2,
        y: MAP_SIZE / 2,
        health: 100,
        coins: 200
    };

    socket.emit("init", {
        id: socket.id,
        players
    });

    socket.broadcast.emit("newPlayer", players[socket.id]);

    socket.on("move", (data) => {
        if (!players[socket.id]) return;
        players[socket.id].x = data.x;
        players[socket.id].y = data.y;
    });

    socket.on("shoot", (data) => {
        bullets.push({
            x: data.x,
            y: data.y,
            dx: data.dx,
            dy: data.dy,
            owner: socket.id
        });
    });

    socket.on("buyCrate", (type) => {
        const player = players[socket.id];
        if (!player) return;

        let cost = 0;
        if (type === "epic") cost = 10;
        if (type === "rare") cost = 100;
        if (type === "special") cost = 500;

        if (player.coins < cost) {
            socket.emit("crateResult", "Not enough coins!");
            return;
        }

        player.coins -= cost;
        socket.emit("updateCoins", player.coins);

        let rand = Math.random() * 100;
        let reward = "";

        if(type === "epic"){
            if(rand < 70) reward = "Common Skin";
            else if(rand < 90) reward = "Rare Skin";
            else reward = "Epic Weapon";
        }
        if(type === "rare"){
            if(rand < 50) reward = "Rare Weapon";
            else if(rand < 85) reward = "Epic Weapon";
            else reward = "Legendary Weapon";
        }
        if(type === "special"){
            if(rand < 40) reward = "Epic Weapon";
            else if(rand < 80) reward = "Legendary Weapon";
            else reward = "SPECIAL IKON SKIN";
        }

        socket.emit("crateResult", reward);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("removePlayer", socket.id);
    });
});

function gameLoop() {
    bullets.forEach((b, i) => {
        b.x += b.dx;
        b.y += b.dy;

        for (let id in players) {
            if (id === b.owner) continue;

            let p = players[id];
            let dist = Math.hypot(p.x - b.x, p.y - b.y);

            if (dist < 15) {
                p.health -= 20;
                bullets.splice(i, 1);

                if (p.health <= 0) {
                    players[b.owner].coins += 20;
                    io.to(b.owner).emit("updateCoins", players[b.owner].coins);

                    p.health = 100;
                    p.x = MAP_SIZE / 2;
                    p.y = MAP_SIZE / 2;
                }
            }
        }
    });

    io.emit("state", { players, bullets });
}

setInterval(gameLoop, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server running"));

