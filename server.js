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

io.on("connection",socket=>{

    socket.on("joinGame",username=>{
        players[socket.id]={
            id:socket.id,
            username,
            x:Math.random()*MAP_SIZE,
            y:Math.random()*MAP_SIZE,
            hp:100
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

        const dx=target.x-p.x;
        const dy=target.y-p.y;
        const dist=Math.hypot(dx,dy);

        const speed=20;

        bullets.push({
            x:p.x,
            y:p.y,
            vx:(dx/dist)*speed,
            vy:(dy/dist)*speed,
            owner:socket.id
        });
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

            const p=players[id];
            const d=Math.hypot(p.x-b.x,p.y-b.y);

            if(d<20){
                p.hp-=20;

                if(p.hp<=0){
                    p.hp=100;
                    p.x=Math.random()*MAP_SIZE;
                    p.y=Math.random()*MAP_SIZE;
                }

                b.dead=true;
            }
        }
    });

    bullets=bullets.filter(b=>!b.dead);

    io.emit("gameState",{players,bullets});

},1000/60);

server.listen(PORT,()=>{
    console.log("Server running");
});

