const socket = io({ transports: ["websocket"] });

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let bullets = [];
let myId = null;

let camera = { x: 0, y: 0 };

socket.on("connect", () => {
    myId = socket.id;
});

socket.on("state", (data) => {
    players = data.players || {};
    bullets = Array.isArray(data.bullets) ? data.bullets : {};

    if (players[myId]) {
        document.getElementById("coins").innerText = players[myId].coins;
        document.getElementById("weapon").innerText = players[myId].weapon;
    }
});

let keys = {};

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

document.addEventListener("click", (e) => {
    if (!players[myId]) return;

    let angle = Math.atan2(
        e.clientY - canvas.height/2,
        e.clientX - canvas.width/2
    );

    socket.emit("shoot", angle);
});

function update() {
    if (!players[myId]) return;

    let vx = 0;
    let vy = 0;

    if (keys["w"]) vy = -1;
    if (keys["s"]) vy = 1;
    if (keys["a"]) vx = -1;
    if (keys["d"]) vx = 1;

    socket.emit("move", { vx, vy });

    let p = players[myId];

    camera.x += ((p.x - canvas.width/2) - camera.x) * 0.1;
    camera.y += ((p.y - canvas.height/2) - camera.y) * 0.1;
}

function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    ctx.fillStyle = "#444";
    ctx.fillRect(0,0,2000,2000);

    for (let id in players) {
        let p = players[id];
        ctx.fillStyle = id === myId ? "white" : "red";
        ctx.fillRect(p.x-10,p.y-10,20,20);
    }

    ctx.fillStyle = "yellow";
    bullets.forEach(b => {
        ctx.beginPath();
        ctx.arc(b.x,b.y,5,0,Math.PI*2);
        ctx.fill();
    });

    ctx.restore();

    drawMiniMap();
}

function drawMiniMap() {
    const size = 150;
    const mapSize = 2000;

    ctx.fillStyle = "black";
    ctx.fillRect(canvas.width - size - 20, 20, size, size);

    for (let id in players) {
        let p = players[id];
        let x = canvas.width - size - 20 + (p.x/mapSize)*size;
        let y = 20 + (p.y/mapSize)*size;

        ctx.fillStyle = id === myId ? "white" : "red";
        ctx.fillRect(x,y,4,4);
    }
}

function gameLoop(){
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
