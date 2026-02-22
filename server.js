const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

let players = {};

const weapons = {
    pistol:   { fireRate: 400, damage: 18, price: 0 },
    rifle:    { fireRate: 220, damage: 20, price: 50 },
    ak47:     { fireRate: 160, damage: 24, price: 100 },
    k24:      { fireRate: 130, damage: 28, price: 150 },
    sniper:   { fireRate: 350, damage: 80, price: 200 },
    minigun:  { fireRate: 60,  damage: 15, price: 300 },
    testy:    { fireRate: 45,  damage: 30, price: 500 },
    laser:    { fireRate: 30,  damage: 35, price: 700 }
};

io.on("connection", (socket) => {

    players[socket.id] = {
        x: 1500,
        y: 1500,
        hp: 100,
        weapon: "pistol",
        coins: 200,
        lastShot: 0
    };

    socket.on("move", (data) => {
        const p = players[socket.id];
        if (!p) return;
        p.x += data.x;
        p.y += data.y;
    });

    socket.on("shoot", () => {
        const p = players[socket.id];
        if (!p) return;

        const weapon = weapons[p.weapon];
        const now = Date.now();

        if (now - p.lastShot >= weapon.fireRate) {
            p.lastShot = now;
        }
    });

    socket.on("buyWeapon", (weaponName) => {
        const p = players[socket.id];
        const weapon = weapons[weaponName];
        if (!p || !weapon) return;

        if (p.coins >= weapon.price) {
            p.coins -= weapon.price;
            p.weapon = weaponName;
        }
    });

    socket.on("addCoins", (amount) => {
        if (players[socket.id]) {
            players[socket.id].coins += amount;
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });

    setInterval(() => {
        io.emit("updatePlayers", players);
    }, 1000 / 30);
});

server.listen(PORT, () => console.log("Server running"));
