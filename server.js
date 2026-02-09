const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

const players = {};
const bullets = [];

io.on("connection", (socket) => {
  console.log("Player joined:", socket.id);

  socket.on("join", (name) => {
    players[socket.id] = {
      id: socket.id,
      name,
      x: 400,
      y: 300,
      hp: 100
    };
  });

  socket.on("move", (data) => {
    if (!players[socket.id]) return;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
  });

  socket.on("shoot", (bullet) => {
    bullets.push({
      x: bullet.x,
      y: bullet.y,
      dx: bullet.dx,
      dy: bullet.dy,
      owner: socket.id
    });
  });

  socket.on("disconnect", () => {
    delete players[socket.id];
  });
});

setInterval(() => {
  bullets.forEach((b, i) => {
    b.x += b.dx * 8;
    b.y += b.dy * 8;

    for (let id in players) {
      if (id !== b.owner) {
        const p = players[id];
        const dist = Math.hypot(p.x - b.x, p.y - b.y);
        if (dist < 15) {
          p.hp -= 10;
          bullets.splice(i, 1);
          if (p.hp <= 0) {
            p.hp = 100;
            p.x = 400;
            p.y = 300;
          }
        }
      }
    }
  });

  io.emit("state", { players, bullets });
}, 1000 / 60);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
