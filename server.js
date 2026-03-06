const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server,{
cors:{origin:"*"}
});

app.use(express.static(path.join(__dirname,"public")));

const PORT = process.env.PORT || 3000;
const MAP_SIZE = 3000;

let players = {};
let bullets = [];

const weapons = {

pistol:{damage:10,rate:400},
rifle:{damage:15,rate:250},

bazooka:{damage:40,rate:900},
rpg:{damage:35,rate:850},
smg:{damage:8,rate:120},

sniper:{damage:60,rate:1000},
laser:{damage:25,rate:150},
minigun:{damage:7,rate:70}

};

io.on("connection",socket=>{

socket.on("joinGame",name=>{

players[socket.id]={

id:socket.id,
name,
x:Math.random()*MAP_SIZE,
y:Math.random()*MAP_SIZE,
hp:100,
coins:0,
weapon:"pistol",
skin:"gold",
lastShot:0

};

});

socket.on("move",data=>{

const p=players[socket.id];
if(!p) return;

p.x+=data.dx;
p.y+=data.dy;

p.x=Math.max(0,Math.min(MAP_SIZE,p.x));
p.y=Math.max(0,Math.min(MAP_SIZE,p.y));

});

socket.on("shoot",target=>{

const p=players[socket.id];
if(!p) return;

const weapon=weapons[p.weapon];
const now=Date.now();

if(now-p.lastShot < weapon.rate) return;

p.lastShot = now;

const dx = target.x - p.x;
const dy = target.y - p.y;
const dist = Math.hypot(dx,dy);

bullets.push({

x:p.x,
y:p.y,
vx:(dx/dist)*20,
vy:(dy/dist)*20,
damage:weapon.damage,
owner:socket.id

});

});

socket.on("setSkin",color=>{

if(players[socket.id]){
players[socket.id].skin=color;
}

});

socket.on("openCrate",type=>{

const p = players[socket.id];
if(!p) return;

let cost = 0;
let reward;

if(type==="epic"){

cost=50;

if(p.coins < cost){
socket.emit("notEnoughCoins");
return;
}

reward = Math.random()<0.5 ? "pistol" : "rifle";

}

if(type==="rare"){

cost=100;

if(p.coins < cost){
socket.emit("notEnoughCoins");
return;
}

let r=Math.random();
reward = r<0.33?"bazooka":r<0.66?"rpg":"smg";

}

if(type==="legendary"){

cost=200;

if(p.coins < cost){
socket.emit("notEnoughCoins");
return;
}

let r=Math.random();
reward = r<0.33?"sniper":r<0.66?"laser":"minigun";

}

p.coins -= cost;
p.weapon = reward;

socket.emit("crateReward",reward);

});

socket.on("disconnect",()=>{
delete players[socket.id];
});

});

setInterval(()=>{

bullets.forEach(b=>{

b.x+=b.vx;
b.y+=b.vy;

for(let id in players){

if(id===b.owner) continue;

const p = players[id];
const d = Math.hypot(p.x-b.x,p.y-b.y);

if(d<20){

p.hp -= b.damage;

if(p.hp<=0){

p.hp=100;
p.x=Math.random()*MAP_SIZE;
p.y=Math.random()*MAP_SIZE;

if(players[b.owner]){
players[b.owner].coins += 20;
}

}

b.dead=true;

}

}

});

bullets = bullets.filter(b=>!b.dead);

io.emit("gameState",{players,bullets});

},1000/60);

server.listen(PORT,()=>{

console.log("Server running");

});


