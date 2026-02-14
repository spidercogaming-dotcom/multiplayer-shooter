const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const MAP_SIZE = 3000;
let myId;
let players = {};
let bullets = {};
let keys = {};
let coins = 200;

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

socket.on("init", (data) => {
    myId = data.id;
    players = data.players;
});

socket.on("newPlayer", (player) => {
    players[player.id] = player;
});

socket.on("removePlayer", (id) => {
    delete players[id];
});

socket.on("state", (data) => {
    players = data.players;
    bullets = data.bullets;
});

socket.on("updateCoins", (c) => {
    coins = c;
    document.getElementById("coinCount").innerText = coins;
});

socket.on("crateResult", (r) => {
    document.getElementById("crateResult").innerText = r;
});

canvas.addEventListener("click", (e) => {
    if(!players[myId]) return;

    let rect = canvas.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;

    let dx = mx - canvas.width/2;
    let dy = my - canvas.height/2;
    let angle = Math.atan2(dy, dx);

    socket.emit("shoot", {
        x: players[myId].x,
        y: players[myId].y,
        dx: Math.cos(angle)*10,
        dy: Math.sin(angle)*10
    });
});

function buyCrate(type){
    socket.emit("buyCrate", type);
}

document.getElementById("shopBtn").onclick = () =>
    document.getElementById("shopUI").style.display="block";

function closeShop(){
    document.getElementById("shopUI").style.display="none";
}

function gameLoop(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    if(players[myId]){
        if(keys["w"]) players[myId].y -= 5;
        if(keys["s"]) players[myId].y += 5;
        if(keys["a"]) players[myId].x -= 5;
        if(keys["d"]) players[myId].x += 5;

        socket.emit("move", players[myId]);
    }

    let camX = players[myId] ? players[myId].x - canvas.width/2 : 0;
    let camY = players[myId] ? players[myId].y - canvas.height/2 : 0;

    ctx.save();
    ctx.translate(-camX, -camY);

    ctx.fillStyle="#333";
    ctx.fillRect(0,0,MAP_SIZE,MAP_SIZE);

    for(let id in players){
        let p = players[id];
        ctx.fillStyle = id === myId ? "white" : "red";
        ctx.fillRect(p.x-10, p.y-10, 20, 20);

        ctx.fillStyle="green";
        ctx.fillRect(p.x-20, p.y-25, p.health/5, 5);
    }

    bullets.forEach(b=>{
        ctx.fillStyle="yellow";
        ctx.fillRect(b.x-3,b.y-3,6,6);
    });

    ctx.restore();

    requestAnimationFrame(gameLoop);
}

gameLoop();
