const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const MAP_SIZE = 4000;

let players = {};

const weapons = {
pistol:{damage:10,range:500},
rifle:{damage:18,range:700},
sniper:{damage:60,range:1200},
sword:{damage:30,range:60},
knife:{damage:20,range:40},
pickaxe:{damage:25,range:50}
};

let gameMode = "ffa"; // ffa, team, swords

io.on("connection",socket=>{

socket.on("joinGame",data=>{

players[socket.id]={
id:socket.id,
name:data.name,
x:2000,
y:-500, // start in sky (battle bus)
hp:100,
coins:100,
gems:10,
weapon:"pistol",
inventory:["pistol"],
skin:"cyan",
inBus:true,
team:Math.random()<0.5?"red":"blue"
};

});

socket.on("drop",()=>{

let p=players[socket.id];
if(!p) return;

p.inBus=false;
p.y=0;

});

socket.on("move",data=>{

let p=players[socket.id];
if(!p) return;

if(p.inBus) return;

p.x+=data.dx;
p.y+=data.dy;

p.x=Math.max(0,Math.min(MAP_SIZE,p.x));
p.y=Math.max(0,Math.min(MAP_SIZE,p.y));

});

socket.on("attack",target=>{

let p=players[socket.id];
if(!p) return;

let w=weapons[p.weapon];

for(let id in players){

if(id===socket.id) continue;

let e=players[id];

if(gameMode==="team" && e.team===p.team) continue;

let d=Math.hypot(e.x-target.x,e.y-target.y);

if(d<w.range){

e.hp-=w.damage;

if(e.hp<=0){

e.hp=100;
e.x=Math.random()*MAP_SIZE;
e.y=Math.random()*MAP_SIZE;

p.coins+=30;
p.gems+=2;

}

}

}

});

socket.on("switchWeapon",w=>{

let p=players[socket.id];
if(!p) return;

if(p.inventory.includes(w)){
p.weapon=w;
}

});

socket.on("setMode",mode=>{
gameMode=mode;
});

socket.on("disconnect",()=>{
delete players[socket.id];
});

});

setInterval(()=>{

io.emit("state",players);

},1000/60);

server.listen(process.env.PORT||3000);
