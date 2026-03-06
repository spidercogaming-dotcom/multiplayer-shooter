const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

let players = {};
let bullets = [];

const WORLD_SIZE = 3000;

io.on("connection", socket => {

socket.on("joinGame", name => {

players[socket.id] = {
id: socket.id,
name: name,
x: Math.random()*WORLD_SIZE,
y: Math.random()*WORLD_SIZE,
hp: 100,
coins: 0,
weapon: "pistol",
skin: "cyan"
};

});

socket.on("move", data => {

const p = players[socket.id];
if(!p) return;

p.x += data.dx;
p.y += data.dy;

p.x = Math.max(0, Math.min(WORLD_SIZE, p.x));
p.y = Math.max(0, Math.min(WORLD_SIZE, p.y));

});

socket.on("shoot", data => {

const p = players[socket.id];
if(!p) return;

const angle = Math.atan2(data.y - p.y, data.x - p.x);

bullets.push({
x:p.x,
y:p.y,
vx:Math.cos(angle)*20,
vy:Math.sin(angle)*20,
owner:socket.id,
life:80
});

});

socket.on("setWeapon", w => {

if(players[socket.id])
players[socket.id].weapon = w;

});

socket.on("setSkin", s => {

if(players[socket.id])
players[socket.id].skin = s;

});

socket.on("disconnect", ()=>{

delete players[socket.id];

});

});

function updateGame(){

bullets.forEach((b,i)=>{

b.x += b.vx;
b.y += b.vy;
b.life--;

if(b.life <=0){
bullets.splice(i,1);
return;
}

for(let id in players){

if(id === b.owner) continue;

let p = players[id];

let dx = p.x - b.x;
let dy = p.y - b.y;

if(Math.sqrt(dx*dx+dy*dy) < 20){

p.hp -= 20;

if(p.hp <=0){

p.hp = 100;
p.x = Math.random()*WORLD_SIZE;
p.y = Math.random()*WORLD_SIZE;

players[b.owner].coins += 20;

}

bullets.splice(i,1);
break;

}

}

});

}

setInterval(()=>{

updateGame();

io.emit("gameState",{
players,
bullets
});

}, 1000/60);

http.listen(process.env.PORT || 3000, ()=>{
console.log("Server running");
});
