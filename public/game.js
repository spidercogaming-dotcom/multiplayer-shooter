const socket=io();

const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");

const minimap=document.getElementById("minimap");
const miniCtx=minimap.getContext("2d");

canvas.width=window.innerWidth;
canvas.height=window.innerHeight;

let players={};
let bullets=[];
let me=null;

function startGame(){

const name=document.getElementById("username").value||"Player";

document.getElementById("menu").style.display="none";
canvas.style.display="block";

socket.emit("joinGame",name);

}

function toggleShop(){

const s=document.getElementById("shop");

s.style.display=s.style.display==="block"?"none":"block";

}

function crate(type){

if(!me) return;

let cost=0;
let reward;

if(type==="epic"){

cost=50;
if(me.coins<cost){alert("Not enough coins");return;}

reward=Math.random()<0.5?"pistol":"rifle";

}

if(type==="rare"){

cost=100;
if(me.coins<cost){alert("Not enough coins");return;}

let r=Math.random();
reward=r<0.33?"bazooka":r<0.66?"rpg":"smg";

}

if(type==="legendary"){

cost=200;
if(me.coins<cost){alert("Not enough coins");return;}

let r=Math.random();
reward=r<0.33?"sniper":r<0.66?"laser":"minigun";

}

me.coins-=cost;

socket.emit("setWeapon",reward);

alert("You got "+reward);

}

function skin(color){

socket.emit("setSkin",color);

}

document.addEventListener("keydown",e=>{

if(!me) return;

const speed=10;

if(e.key==="w") socket.emit("move",{dx:0,dy:-speed});
if(e.key==="s") socket.emit("move",{dx:0,dy:speed});
if(e.key==="a") socket.emit("move",{dx:-speed,dy:0});
if(e.key==="d") socket.emit("move",{dx:speed,dy:0});

});

canvas.addEventListener("click",e=>{

if(!me) return;

socket.emit("shoot",{

x:me.x+(e.clientX-canvas.width/2),
y:me.y+(e.clientY-canvas.height/2)

});

});

socket.on("gameState",state=>{

players=state.players;
bullets=state.bullets;
me=players[socket.id];

if(me){

document.getElementById("coins").innerText="Coins: "+me.coins;

}

});

function drawGrid(){

const size=100;

ctx.strokeStyle="#1a1a1a";

for(let x=0;x<3000;x+=size){

ctx.beginPath();
ctx.moveTo(x-me.x+canvas.width/2,-me.y+canvas.height/2);
ctx.lineTo(x-me.x+canvas.width/2,3000-me.y+canvas.height/2);
ctx.stroke();

}

for(let y=0;y<3000;y+=size){

ctx.beginPath();
ctx.moveTo(-me.x+canvas.width/2,y-me.y+canvas.height/2);
ctx.lineTo(3000-me.x+canvas.width/2,y-me.y+canvas.height/2);
ctx.stroke();

}

}

function gameLoop(){

requestAnimationFrame(gameLoop);

ctx.clearRect(0,0,canvas.width,canvas.height);

if(!me) return;

drawGrid();

for(let id in players){

const p=players[id];

ctx.fillStyle=p.skin||"white";

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

ctx.fillStyle="red";

ctx.fillRect(

b.x-me.x+canvas.width/2,
b.y-me.y+canvas.height/2,
6,
6

);

});

miniCtx.clearRect(0,0,200,200);

for(let id in players){

const p=players[id];

miniCtx.fillStyle=id===socket.id?"gold":"white";

miniCtx.fillRect(

(p.x/3000)*200,
(p.y/3000)*200,
4,
4

);

}

}

gameLoop();

