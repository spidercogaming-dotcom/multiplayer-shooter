const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let me = null;
let players = {};

function startGame() {
    const username = document.getElementById("usernameInput").value || "Player";
    document.getElementById("menu").style.display = "none";
    canvas.style.display = "block";

    socket.emit("joinGame", username);
}

document.addEventListener("keydown", e => {
    if (!me) return;

    const speed = 10;

    if (e.key === "w") socket.emit("move", { dx: 0, dy: -speed });
    if (e.key === "s") socket.emit("move", { dx: 0, dy: speed });
    if (e.key === "a") socket.emit("move", { dx: -speed, dy: 0 });
    if (e.key === "d") socket.emit("move", { dx: speed, dy: 0 });
});

canvas.addEventListener("click", e => {
    if (!me) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    socket.emit("shoot", {
        x: me.x + (mouseX - canvas.width/2),
        y: me.y + (mouseY - canvas.height/2)
    });
});

socket.on("gameState", serverPlayers => {
    players = serverPlayers;
    me = players[socket.id];
});

socket.on("shotFired", data => {
    ctx.strokeStyle = "yellow";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(
        data.x1 - me.x + canvas.width/2,
        data.y1 - me.y + canvas.height/2
    );
    ctx.lineTo(
        data.x2 - me.x + canvas.width/2,
        data.y2 - me.y + canvas.height/2
    );
    ctx.stroke();
});

function gameLoop() {
    requestAnimationFrame(gameLoop);

    if (!me) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let id in players) {
        const p = players[id];

        const screenX = p.x - me.x + canvas.width/2;
        const screenY = p.y - me.y + canvas.height/2;

        ctx.fillStyle = id === socket.id ? "lime" : "red";
        ctx.beginPath();
        ctx.arc(screenX, screenY, 20, 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = "white";
        ctx.fillText(p.username, screenX - 20, screenY - 30);
    }
}

gameLoop();
