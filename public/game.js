const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const minimap = document.getElementById("minimap");
const miniCtx = minimap.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let bullets = [];
let me = null;
let keys = {};

function startGame(){
    const username = document.getElementById("usernameInput").value.trim();
    if(!username) return;

    socket.emit("joinGame", username);

    document.getElementById("menu").style.display="none";
    document.getElementById("coinsDisplay").style.display="block";
    document.getElementById("shopBtn").style.display="block";
    document.getElementById("healthBarContainer").style.display="block";
    canvas.style.display="block";
}

socket.on("gameState", state=>{
    players = state.players || {};
    bullets = state.bullets || [];
    me = players[socket.id];
});

socket.on("crateReward", reward=>{
    alert("You got " + reward.toUpperCase());
});

socket.on("notEnoughCoins", ()=>{
    alert("Not enough coins!");
});

document.addEventListener("keydown", e=> keys[e.key]=true);
document.addEventListener("keyup", e=> keys[e.key]=false);

setInterval(()=>{
    if(!me) return;
    let dx=0, dy=0;
    const speed=6;
    if(keys["w"]) dy-=speed;
    if(keys["s"]) dy+=speed;
    if(keys["a"]) dx-=speed;
    if(keys["d"]) dx+=speed;
    if(dx||dy) socket.emit("move",{dx,dy});
},1000/60);

canvas.addEventListener("click", e=>{
    if(!me) return;
    socket.emit("shoot",{
        x: me.x + (e.clientX - canvas.width/2),
        y: me.y + (e.clientY - canvas.height/2)
    });
});

function toggleShop(){
    const panel=document.getElementById("shopPanel");
    panel.style.display = panel.style.display==="block"?"none":"block";
}

function openCrate(type){
    socket.emit("openCrate", type);
}

function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    if(!me){ requestAnimationFrame(draw); return; }

    // arena grid
    ctx.strokeStyle="rgba(255,255,255,0.05)";
    for(let i=0;i<3000;i+=100){
        ctx.beginPath();
        ctx.moveTo(i-me.x+canvas.width/2,0);
        ctx.lineTo(i-me.x+canvas.width/2,canvas.height);
        ctx.stroke();
    }

    for(let id in players){
        const p=players[id];
        const sx=p.x-me.x+canvas.width/2;
        const sy=p.y-me.y+canvas.height/2;

        ctx.shadowBlur=20;
        ctx.shadowColor=id===socket.id?"gold":"white";

        ctx.fillStyle=id===socket.id?"gold":"white";
        ctx.beginPath();
        ctx.arc(sx,sy,20,0,Math.PI*2);
        ctx.fill();

        ctx.shadowBlur=0;
        ctx.fillStyle="white";
        ctx.font="bold 14px Arial";
        ctx.fillText(p.username,sx-20,sy-30);
    }

    bullets.forEach(b=>{
        ctx.shadowBlur=15;
        ctx.shadowColor="red";
        ctx.fillStyle="red";
        ctx.beginPath();
        ctx.arc(
            b.x-me.x+canvas.width/2,
            b.y-me.y+canvas.height/2,
            6,0,Math.PI*2
        );
        ctx.fill();
        ctx.shadowBlur=0;
    });

    document.getElementById("healthBar").style.width=me.hp+"%";
    document.getElementById("coinsDisplay").innerText="Coins: "+me.coins;
    document.getElementById("weaponDisplay").innerText="Weapon: "+me.weapon.toUpperCase();

    const sorted = Object.values(players)
        .sort((a,b)=>b.coins-a.coins)
        .slice(0,5);

    document.getElementById("leaderboard").innerHTML =
        "<b>Top Ikons</b><br>" +
        sorted.map(p=>p.username+" - "+p.coins).join("<br>");

    miniCtx.clearRect(0,0,200,200);
    for(let id in players){
        const p=players[id];
        miniCtx.fillStyle=id===socket.id?"gold":"white";
        miniCtx.fillRect((p.x/3000)*200,(p.y/3000)*200,4,4);
    }

    requestAnimationFrame(draw);
}

draw();

