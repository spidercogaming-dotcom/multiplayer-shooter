const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const minimap = document.getElementById("minimap");
const miniCtx = minimap.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let player = null;
let keys = {};

document.addEventListener("keydown", (e)=> keys[e.key]=true);
document.addEventListener("keyup", (e)=> keys[e.key]=false);
document.addEventListener("mousedown", ()=> socket.emit("shoot"));

socket.on("updatePlayers", (serverPlayers)=>{
    players = serverPlayers;
    player = players[socket.id];
});

function update(){
    if(!player) return;

    let speed = 5;
    let dx=0, dy=0;

    if(keys["w"]) dy -= speed;
    if(keys["s"]) dy += speed;
    if(keys["a"]) dx -= speed;
    if(keys["d"]) dx += speed;

    socket.emit("move",{x:dx,y:dy});
}

function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!player) return;

    const camX = player.x - canvas.width/2;
    const camY = player.y - canvas.height/2;

    ctx.fillStyle="#1e1e1e";
    ctx.fillRect(-camX,-camY,3000,3000);

    for(let id in players){
        let p = players[id];
        ctx.fillStyle = id===socket.id ? "#00ff00":"#ff0000";
        ctx.beginPath();
        ctx.arc(p.x-camX,p.y-camY,20,0,Math.PI*2);
        ctx.fill();
    }

    document.getElementById("weaponText").innerText =
        "Weapon: " + player.weapon.toUpperCase();

    document.getElementById("coinsText").innerText =
        "Coins: " + player.coins;

    drawMinimap();
}

function drawMinimap(){
    miniCtx.clearRect(0,0,150,150);

    for(let id in players){
        let p = players[id];
        miniCtx.fillStyle = id===socket.id?"#00ff00":"#ff0000";
        miniCtx.fillRect((p.x/3000)*150,(p.y/3000)*150,5,5);
    }
}

function toggleShop(){
    const shop = document.getElementById("shop");
    shop.style.display = shop.style.display==="none"?"block":"none";
}

function buy(weapon){
    socket.emit("buyWeapon",weapon);
}

const crateWeapons = [
    "pistol","pistol","pistol","pistol",
    "rifle","rifle",
    "ak47",
    "k24",
    "minigun",
    "sniper",
    "testy",
    "laser"
];

function openCrate(){
    if(player.coins < 100){
        alert("Not enough coins!");
        return;
    }

    socket.emit("addCoins",-100);

    document.getElementById("crateUI").style.display="block";
    let spin = document.getElementById("crateSpin");

    let spins = 0;
    let interval = setInterval(()=>{
        let randomWeapon = crateWeapons[Math.floor(Math.random()*crateWeapons.length)];
        spin.innerText = randomWeapon.toUpperCase();
        spins++;

        if(spins > 25){
            clearInterval(interval);

            let finalWeapon = crateWeapons[Math.floor(Math.random()*crateWeapons.length)];
            spin.innerText = "YOU GOT: " + finalWeapon.toUpperCase();

            socket.emit("buyWeapon", finalWeapon);
        }
    },100);
}

function closeCrate(){
    document.getElementById("crateUI").style.display="none";
}

function gameLoop(){
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
