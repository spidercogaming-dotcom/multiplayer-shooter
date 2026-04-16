const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const MAP_SIZE = 4000;

let players = {};

let storm = {
x:2000,
y:2000,
radius:1800,
shrinkRate:0.02
};

let busX = 0;

io.on("connection",socket=>{

socket.on("joinGame",name=>{

players[socket.id]={
id:socket.id,
name,
x:busX,
y:-200,
hp:100,
alive:true,
inBus:true,
vy:0,
weapon:"pistol"
};

});

socket.on("drop",()=>{

let p=players[socket.id];
if(!p) return;

p.inBus=false;
p.vy=2;

});

socket.on("move",data=>{

let p=players[socket.id];
if(!p || p.inBus) return;

p.x+=data.dx;
p.y+=data.dy;

p.x=Math.max(0,Math.min(MAP_SIZE,p.x));
p.y=Math.max(0,Math.min(MAP_SIZE,p.y));

});

socket.on("shoot",target=>{

let p=players[socket.id];
if(!p || !p.alive) return;

for(let id in players){

if(id===socket.id) continue;

let e=players[id];

let d=Math.hypot(e.x-target.x,e.y-target.y);

if(d<50){
e.hp-=20;

if(e.hp<=0){
e.alive=false;
}
}

}

});

socket.on("disconnect",()=>{
delete players[socket.id];
});

});

setInterval(()=>{

// move battle bus
busX += 2;
if(busX > MAP_SIZE) busX = 0;

// update players
for(let id in players){

let p=players[id];

// falling (parachute)
if(!p.inBus && p.y < 2000){
p.y += p.vy;
}

// storm damage
let d=Math.hypot(p.x-storm.x,p.y-storm.y);

if(d > storm.radius){
p.hp -= 0.2;
if(p.hp <= 0) p.alive=false;
}

}

// shrink storm
storm.radius -= storm.shrinkRate;

io.emit("state",{players,storm,busX});

},1000/60);

server.listen(process.env.PORT||3000);
