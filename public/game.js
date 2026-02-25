const socket = io(window.location.origin);

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const minimap = document.getElementById("minimap");
const miniCtx = minimap.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let bullets = [];
let me = null;

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

document.addEventListener("keydown", e=>{
    if(!me) return;
    const speed = 10;
    if(e.key==="w") socket.emit("move",{dx:0,dy:-speed});
    if(e.key==="s") socket.emit("move",{dx:0,dy:speed});
    if(e.key==="a") socket.emit("move",{dx:-speed,dy:0});
    if(e.key==="d") socket.emit("move",{dx:speed,dy:0});
});

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
    if(!me) return;

    let reward;

    if(type==="rare"){
        reward = Math.random()<0.6?"pistol":"rifle";
    }
    if(type==="epic"){
        const r=Math.random();
        reward = r<0.4?"rpg":r<0.7?"ak47":"revolver";
    }
    if(type==="legendary"){
        const r=Math.random();
        reward = r<0.3?"sniper":r<0.55?"shotgun":r<0.8?"minigun":"laser";
    }

    socket.emit("setWeapon",reward);
    alert("You got "+reward.toUpperCase());
}

function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);

    if(!me){
        requestAnimationFrame(draw);
        return;
    }

    for(let id in players){
        const p=players[id];
        ctx.fillStyle=id===socket.id?"gold":"white";
        ctx.beginPath();
        ctx.arc(
            p.x-me.x+canvas.width/2,
            p.y-me.y+canvas.height/2,
            20,0,Math.PI*2
        );
        ctx.fill();
    }

    bullets.forEach(b=>{
        ctx.fillStyle="red";
        ctx.fillRect(
            b.x-me.x+canvas.width/2,
            b.y-me.y+canvas.height/2,
            5,5
        );
    });

    document.getElementById("healthBar").style.width=me.hp+"%";
    document.getElementById("coinsDisplay").innerText="Coins: "+me.coins;

    const overlay=document.getElementById("redOverlay");
    overlay.style.opacity = me.hp<30 ? (0.7-(me.hp/50)) : 0;

    miniCtx.clearRect(0,0,200,200);
    for(let id in players){
        const p=players[id];
        miniCtx.fillStyle=id===socket.id?"gold":"white";
        miniCtx.fillRect(
            (p.x/3000)*200,
            (p.y/3000)*200,
            4,4
        );
    }

    requestAnimationFrame(draw);
}

draw();


