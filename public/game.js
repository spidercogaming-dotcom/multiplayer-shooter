const socket=io();

const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");

const minimap=document.getElementById("minimap");
const mctx=minimap.getContext("2d");

canvas.width=window.innerWidth;
canvas.height=window.innerHeight;

let players={};
let me;

function start(){

let name=document.getElementById("name").value;

socket.emit("joinGame",{name});

document.getElementById("menu").style.display="none";
canvas.style.display="block";

setTimeout(()=>{
socket.emit("drop"); // auto jump from battle bus
},2000);

}

function mode(m){
socket.emit("setMode",m);
}

document.addEventListener("keydown",e=>{

if(!me) return;

let s=10;

if(e.key==="w") socket.emit("move",{dx:0,dy:-s});
if(e.key==="s") socket.emit("move",{dx:0,dy:s});
if(e.key==="a") socket.emit("move",{dx:-s,dy:0});
if(e.key==="d") socket.emit("move",{dx:s,dy:0});

if(e.key==="1") socket.emit("switchWeapon","pistol");
if(e.key==="2") socket.emit("switchWeapon","sword");

});

canvas.addEventListener("click",e=>{

if(!me) return;

socket.emit("attack",{
x:me.x+(e.clientX-canvas.width/2),
y:me.y+(e.clientY-canvas.height/2)
});

});

socket.on("state",data=>{
players=data;
me=players[socket.id];
});

function drawMap(){

ctx.fillStyle="#1e293b";
ctx.fillRect(0,0,canvas.width,canvas.height);

ctx.strokeStyle="#334155";

for(let i=0;i<4000;i+=100){

ctx.beginPath();
ctx.moveTo(i-me.x+canvas.width/2,0);
ctx.lineTo(i-me.x+canvas.width/2,canvas.height);
ctx.stroke();

ctx.beginPath();
ctx.moveTo(0,i-me.y+canvas.height/2);
ctx.lineTo(canvas.width,i-me.y+canvas.height/2);
ctx.stroke();

}

}

function loop(){

requestAnimationFrame(loop);

ctx.clearRect(0,0,canvas.width,canvas.height);

if(!me) return;

drawMap();

for(let id in players){

let p=players[id];

ctx.fillStyle=p.skin;

ctx.beginPath();
ctx.arc(
p.x-me.x+canvas.width/2,
p.y-me.y+canvas.height/2,
20,0,Math.PI*2
);
ctx.fill();

}

mctx.clearRect(0,0,200,200);

for(let id in players){

let p=players[id];

mctx.fillStyle=id===socket.id?"gold":"white";

mctx.fillRect((p.x/4000)*200,(p.y/4000)*200,4,4);

}

document.getElementById("hud").innerText=
"HP:"+me.hp+" Coins:"+me.coins+" Gems:"+me.gems+" Weapon:"+me.weapon;

}

loop();
