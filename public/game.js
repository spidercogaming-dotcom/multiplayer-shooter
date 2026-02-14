const socket = io();
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let keys = {};
let coins = 0;

document.addEventListener("keydown", e => keys[e.key] = true);
document.addEventListener("keyup", e => keys[e.key] = false);

socket.on("currentPlayers", (serverPlayers) => {
    players = serverPlayers;
});

socket.on("newPlayer", (player) => {
    players[player.id] = player;
});

socket.on("playerDisconnected", (id) => {
    delete players[id];
});

socket.on("updateCoins", (newCoins) => {
    coins = newCoins;
    document.getElementById("coinCount").innerText = coins;
});

socket.on("crateResult", (result) => {
    document.getElementById("crateResult").innerText = result;
});

function buyCrate(type) {
    socket.emit("buyCrate", type);
}

document.getElementById("shopBtn").onclick = () => {
    document.getElementById("shopUI").style.display = "block";
};

function closeShop() {
    document.getElementById("shopUI").style.display = "none";
}

function gameLoop() {
    ctx.clearRect(0,0,canvas.width,canvas.height);

    for(let id in players) {
        ctx.fillStyle = id === socket.id ? "white" : "red";
        ctx.fillRect(players[id].x - 10, players[id].y - 10, 20, 20);
    }

    if(players[socket.id]) {
        if(keys["w"]) players[socket.id].y -= 5;
        if(keys["s"]) players[socket.id].y += 5;
        if(keys["a"]) players[socket.id].x -= 5;
        if(keys["d"]) players[socket.id].x += 5;

        socket.emit("move", {
            x: players[socket.id].x,
            y: players[socket.id].y
        });
    }

    requestAnimationFrame(gameLoop);
}

gameLoop();

