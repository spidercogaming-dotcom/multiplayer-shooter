const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let myId = null;

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", (serverPlayers) => {
    players = serverPlayers;
});

document.addEventListener("keydown", (e) => {
    const speed = 10;

    if (e.key === "w") socket.emit("move", { dx: 0, dy: -speed });
    if (e.key === "s") socket.emit("move", { dx: 0, dy: speed });
    if (e.key === "a") socket.emit("move", { dx: -speed, dy: 0 });
    if (e.key === "d") socket.emit("move", { dx: speed, dy: 0 });
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let id in players) {
        const p = players[id];
        ctx.fillStyle = id === myId ? "lime" : "red";
        ctx.fillRect(p.x, p.y, 30, 30);
    }

    requestAnimationFrame(draw);
}

draw();
