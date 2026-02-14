const express = require("express");
const http = require("http");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static("public"));

let players = {};
let bullets = [];

io.on("connection", (socket) => {

    players[socket.id] = {
        x: 1500,
        y: 1500,
        health: 100,
        coins: 0
    };

    socket.emit("currentPlayers", players);
    socket.broadcast.emit("newPlayer", players[socket.id]);

    socket.on("move", (data) => {
        if(players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
        }
    });

    socket.on("shoot", (bullet) => {
        bullets.push({
            ...bullet,
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

        let reward = getRandomReward(type);
        socket.emit("crateResult", reward);
        socket.emit("updateCoins", player.coins);
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("playerDisconnected", socket.id);
    });
});

function getRandomReward(type) {
    let rand = Math.random() * 100;

    if(type === "epic") {
        if(rand < 70) return "Common Skin";
        if(rand < 90) return "Rare Skin";
        return "Epic Weapon";
    }

    if(type === "rare") {
        if(rand < 50) return "Rare Weapon";
        if(rand < 85) return "Epic Weapon";
        return "Legendary Weapon";
    }

    if(type === "special") {
        if(rand < 40) return "Epic Weapon";
        if(rand < 80) return "Legendary Weapon";
        return "SPECIAL IKON SKIN";
    }
}

server.listen(3000, () => {
    console.log("Server running on port 3000");
});

