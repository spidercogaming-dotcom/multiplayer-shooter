const socket = io();

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const minimap = document.getElementById("minimap");
const mctx = minimap.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let players = {};
let bullets = [];
let me;

function startGame(){

let name = document.getElementById("name").value;

socket.emit("joinGame",name);

document.getElementById("menu").style.display="none";
canvas.style.display="block";

document.getElementById("coins").style.display="block";
document.getElementById("shopBtn").style.display="block";

}

socket.on("gameState",state=>{

players = state.players;
bullets = state.bullets;

me = players[socket.id];

});

document.addEventListener("keydown",e=>{

if(!me) return;

let speed=10;

if(e.key==="w") socket.emit("move",{dx:0,dy:-speed});
if(e.key==="s") socket.emit("move",{dx:0,dy:speed});
if(e.key==="a") socket.emit("move",{dx:-speed,dy:0});
if(e.key==="d") socket.emit("move",{dx:speed,dy:0});

});

canvas.addEventListener("click",e=>{

if(!me) return;

let x = me.x + (e.clientX - canvas.width/2);
let y = me.y + (e.clientY - canvas.height/2);

socket.emit("shoot",{x,y});

});

function toggleShop(){

let s = document.getElementById("shop");

s.style.display = s.style.display==="block"?"none":"block";

}

function crate(type){

let reward;

if(type==="epic"){
reward = Math.random()<0.5 ? "pistol":"rifle";
}

if(type==="rare"){
let r=Math.random();
reward = r<0.33?"bazooka":r<0.66?"rpg":"smg";
}

if(type==="legendary"){
let r=Math.random();
reward = r<0.33?"sniper":r<0.66?"laser":"minigun";
}

socket.emit("setWeapon",reward);

alert("You got "+reward);

}

function skin(s){

socket.emit("setSkin",s);

}

function draw(){

ctx.clearRect(0,0,canvas.width,canvas.height);

if(!me){
requestAnimationFrame(draw);
return;
}

drawBackground();

for(let id in players){

let p = players[id];

ctx.fillStyle = p.skin || "white";

ctx.beginPath();
ctx.arc(
p.x-me.x+canvas.width/2,
p.y-me.y+canvas.height/2,
20,
0,
Math.PI*2
);

ctx.fill();

}

bullets.forEach(b=>{

ctx.fillStyle="yellow";

ctx.fillRect(
b.x-me.x+canvas.width/2,
b.y-me.y+canvas.height/2,
6,6
);

});

drawMinimap();

document.getElementById("coins").innerText="Coins: "+me.coins;

requestAnimationFrame(draw);

}

function drawBackground(){

ctx.fillStyle="#111827";
ctx.fillRect(0,0,canvas.width,canvas.height);

ctx.strokeStyle="#1f2937";

for(let x=0;x<3000;x+=100){

ctx.beginPath();
ctx.moveTo(x-me.x+canvas.width/2,0);
ctx.lineTo(x-me.x+canvas.width/2,canvas.height);
ctx.stroke();

}

for(let y=0;y<3000;y+=100){

ctx.beginPath();
ctx.moveTo(0,y-me.y+canvas.height/2);
ctx.lineTo(canvas.width,y-me.y+canvas.height/2);
ctx.stroke();

}

}

function drawMinimap(){

mctx.clearRect(0,0,200,200);

for(let id in players){

let p = players[id];

mctx.fillStyle = id===socket.id ? "gold":"white";

mctx.fillRect(
(p.x/3000)*200,
(p.y/3000)*200,
4,4
);

}

}

draw();
