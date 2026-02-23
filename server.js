const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(__dirname));

let players = {};
let bullets = [];

const MAP_SIZE = 3000;

const weapons = {
    pistol: { damage: 10, fireRate: 400 },
    rifle: { damage: 15, fireRate: 250 },
    rpg: { damage: 40, fireRate: 800 },
    ak47: { damage: 20, fireRate: 180 },
    revolver: { damage: 25, fireRate: 500 },
    sniper: { damage: 50, fireRate: 900 },
    shotgun: { damage: 35, fireRate: 600 },
    minigun: { damage: 8, fireRate: 80 },
    laser: { damage: 60, fireRate: 700 }
};

io.on("connection", socket => {

    socket.on("joinGame", username => {
        players[socket.id] = {
            id: socket.id,
            username,
            x: Math.random() * MAP_SIZE,
            y: Math.random() * MAP_SIZE,
            hp: 100,
            coins: 0,
            weapon: "pistol",
            lastShot: 0
        };
    });

    socket.on("move", data => {
        const player = players[socket.id];
        if (!player) return;

        player.x += data.dx;
        player.y += data.dy;

        player.x = Math.max(0, Math.min(MAP_SIZE, player.x));
        player.y = Math.max(0, Math.min(MAP_SIZE, player.y));
    });

    socket.on("shoot", target => {
        const player = players[socket.id];
        if (!player) return;

        const weapon = weapons[player.weapon];
        const now = Date.now();

        if (now - player.lastShot < weapon.fireRate) return;
        player.lastShot = now;

        bullets.push({
            x: player.x,
            y: player.y,
            targetX: target.x,
            targetY: target.y,
            owner: socket.id,
            damage: weapon.damage
        });
    });

    socket.on("setWeapon", weaponName => {
        if (weapons[weaponName]) {
            players[socket.id].weapon = weaponName;
        }
    });

    socket.on("disconnect", () => {
        delete players[socket.id];
    });
});

setInterval(() => {
    bullets.forEach((bullet, i) => {
        const dx = bullet.targetX - bullet.x;
        const dy = bullet.targetY - bullet.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        bullet.x += dx / dist * 20;
        bullet.y += dy / dist * 20;

        for (let id in players) {
            if (id === bullet.owner) continue;
            const p = players[id];
            const d = Math.hypot(p.x - bullet.x, p.y - bullet.y);
            if (d < 20) {
                p.hp -= bullet.damage;
                if (p.hp <= 0) {
                    players[bullet.owner].coins += 20;
                    p.hp = 100;
                    p.x = Math.random() * MAP_SIZE;
                    p.y = Math.random() * MAP_SIZE;
                }
                bullets.splice(i, 1);
            }
        }
    });

    io.emit("gameState", { players, bullets });
}, 1000 / 60);

server.listen(3000, () => console.log("Server running"));


  
 

       
