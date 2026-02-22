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
    pistol:   { fireRate: 400, damage: 18 },
    rifle:    { fireRate: 220, damage: 20 },
    ak47:     { fireRate: 160, damage: 24 },
    k24:      { fireRate: 130, damage: 28 },
    sniper:   { fireRate: 350, damage: 80 },
    minigun:  { fireRate: 60,  damage: 15 },
    testy:    { fireRate: 45,  damage: 30 },
    laser:    { fireRate: 30,  damage: 35 }
};

io.on("connection", (socket) => {

    players[socket.id] = {
        x: 1500,
        y: 1500,
        hp: 100,
        weapon: "pistol",
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
        if (weapons[weaponName]) {
            players[socket.id].weapon = weaponName;
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
