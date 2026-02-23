const socket = io();
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let playerId = null;
let players = {};
let bullets = [];
let keys = {};
let mouse = { x: 0, y: 0 };

socket.on("connect", () => playerId = socket.id);

socket.on("state", (data) => {
    for (let id in data.players) {
        const np = data.players[id];

        if (!players[id]) {
            players[id] = { ...np, renderX: np.x, renderY: np.y };
        } else {
            players[id].targetX = np.x;
            players[id].targetY = np.y;
            players[id].hp = np.hp;
            players[id].coins = np.coins;
            players[id].weapon = np.weapon;
            players[id].name = np.name;
            players[id].kills = np.kills;
        }
    }

    bullets = data.bullets;
});

window.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
window.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

canvas.addEventListener("mousemove", e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

canvas.addEventListener("click", () => {
    const angle = Math.atan2(
        mouse.y - canvas.height / 2,
        mouse.x - canvas.width / 2
    );
    socket.emit("shoot", angle);
});

function updateMovement() {
    let dx = 0;
    let dy = 0;

    if (keys["w"]) dy -= 1;
    if (keys["s"]) dy += 1;
    if (keys["a"]) dx -= 1;
    if (keys["d"]) dx += 1;

    socket.emit("move", { dx, dy });
}

function draw(me) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const SMOOTH = 0.15;

    for (let id in players) {
        const p = players[id];

        if (p.targetX !== undefined) {
            p.renderX += (p.targetX - p.renderX) * SMOOTH;
            p.renderY += (p.targetY - p.renderY) * SMOOTH;
        }

        const screenX = canvas.width/2 + (p.renderX - me.renderX);
        const screenY = canvas.height/2 + (p.renderY - me.renderY);

        ctx.fillStyle = id === playerId ? "red" : "white";
        ctx.fillRect(screenX-15, screenY-15, 30, 30);

        ctx.fillStyle = "yellow";
        ctx.textAlign = "center";
        ctx.fillText(p.name, screenX, screenY-25);
    }

    bullets.forEach(b => {
        const screenX = canvas.width/2 + (b.x - me.renderX);
        const screenY = canvas.height/2 + (b.y - me.renderY);
        ctx.fillStyle = "orange";
        ctx.fillRect(screenX, screenY, 5, 5);
    });

    document.getElementById("healthBar").style.width = me.hp + "%";
    document.getElementById("coinsDisplay").innerText =
        `Coins: ${me.coins} | Weapon: ${me.weapon}`;

    updateLeaderboard();
}

function updateLeaderboard() {
    const board = document.getElementById("leaderboard");

    const sorted = Object.values(players)
        .sort((a,b)=>b.kills-a.kills)
        .slice(0,5);

    board.innerHTML = "<b>Leaderboard</b><br>";
    sorted.forEach(p=>{
        board.innerHTML += `${p.name} - ${p.kills}<br>`;
    });
}

function gameLoop() {
    const me = players[playerId];
    if (!me) return requestAnimationFrame(gameLoop);

    updateMovement();
    draw(me);
    requestAnimationFrame(gameLoop);
}

function startGame() {
    const username = document.getElementById("usernameInput").value || "Ikon";
    document.getElementById("menu").style.display = "none";
    document.getElementById("healthBarContainer").style.display = "block";
    document.getElementById("leaderboard").style.display = "block";
    canvas.style.display = "block";

    socket.emit("joinGame", username);
    gameLoop();
}

