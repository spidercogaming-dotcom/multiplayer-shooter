const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

let players = {};
let bullets = [];
let me = null;
const keys = {};

function joinGame() {
  const name = document.getElementById("name").value || "Player";
  socket.emit("join", name);
}

socket.on("state", (data) => {
  players = data.players;
  bullets = data.bullets;
  me = players[socket.id];
});

document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

canvas.addEventListener("click", (e) => {
  if (!me) return;

  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const dx = mx - me.x;
  const dy = my - me.y;
  const len = Math.hypot(dx, dy);

  socket.emit("shoot", {
    x: me.x,
    y: me.y,
    dx: dx / len,
    dy: dy / len,
  });
});

function update() {
  if (me) {
    if (keys["w"]) me.y -= 4;
    if (keys["s"]) me.y += 4;
    if (keys["a"]) me.x -= 4;
    if (keys["d"]) me.x += 4;

    socket.emit("move", me);
  }

  draw();
  requestAnimationFrame(update);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let id in players) {
    const p = players[id];
    ctx.fillStyle = id === socket.id ? "lime" : "red";
    ctx.fillRect(p.x - 10, p.y - 10, 20, 20);

    ctx.fillStyle = "white";
    ctx.fillText(`${p.name} (${p.hp})`, p.x - 20, p.y - 15);
  }

  ctx.fillStyle = "yellow";
  bullets.forEach(b => ctx.fillRect(b.x, b.y, 4, 4));
}

update();

