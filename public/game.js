const socket=io();

const canvas=document.getElementById("game");
const ctx=canvas.getContext("2d");

const minimap=document.getElementById("minimap");
const mctx=minimap.getContext("2d");

canvas.width=window.innerWidth;
canvas.height=window.innerHeight;

let players={},me,storm,busX;

function start(){

let name=document.getElementById("name").value;

socket.emit("joinGame",name);

document.getElementById("menu").style.display="none";
canvas.style.display="block";

}

document.addEventListener("keydown",e=>{

if(!me) return;

if(e.key===" "){
socket.emit("drop");
}

let s=10;

if(e.key==="w") socket.emit("move",{dx:0,dy:-s});
if(e.key==="s") socket.emit("move",{dx:0,dy:s});
if(e.key==="a") socket.emit("move",{dx:-s,dy:0});
if(e.key==="d") socket.emit("move",{dx:s,dy:0});

});

canvas.addEventListener("click",e=>{

if(!me) return;

socket.emit("shoot",{
x:me.x+(e.clientX-canvas.width/2),
y:me.y+(e.clientY-canvas.height/2)
});

});

socket.on("state",data=>{
players=data.players;
storm=data.storm;
busX=data.busX;
me=players[socket.id];
});

function draw(){

requestAnimationFrame(draw);

ctx.clearRect(0,0,canvas.width,canvas.height);

if(!me) return;

// map
ctx.fillStyle="#1e293b";
ctx.fillRect(0,0,canvas.width,canvas.height);

// storm circle
ctx.strokeStyle="blue";
ctx.beginPath();
ctx.arc(
storm.x-me.x+canvas.width/2,
storm.y-me.y+canvas.height/2,
storm.radius,
0,Math.PI*2
);
ctx.stroke();

// battle bus
ctx.fillStyle="yellow";
ctx.fillRect(busX-me.x+canvas.width/2,100,80,20);

// players
for(let id in players){

let p=players[id];

ctx.fillStyle=p.alive?"white":"gray";

ctx.beginPath();
ctx.arc(
p.x-me.x+canvas.width/2,
p.y-me.y+canvas.height/2,
15,0,Math.PI*2
);
ctx.fill();

}

// minimap
mctx.clearRect(0,0,200,200);

for(let id in players){
let p=players[id];

mctx.fillStyle=id===socket.id?"gold":"white";
mctx.fillRect((p.x/4000)*200,(p.y/4000)*200,4,4);
}

document.getElementById("hud").innerText=
"HP:"+me.hp+" | Press SPACE to drop";

}

draw();
