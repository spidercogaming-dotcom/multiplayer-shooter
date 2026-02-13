// ===== server.js =====
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let players = {};
let bullets = [];
let crates = [];

function spawnCrate(){
  crates.push({
    id: Date.now(),
    x: Math.random() * 1200,
    y: Math.random() * 800,
    size: 20,
  });
}

// spawn crate every 15 seconds
setInterval(spawnCrate, 15000);

io.on('connection', socket => {
  console.log('Player connected:', socket.id);

  // Add player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 1200,
    y: Math.random() * 800,
    size: 30,
    health: 100,
    coins: 0,
    fireRate: 500 // ms between shots
  };

  // Send all current data
  socket.emit('currentPlayers', players);
  socket.emit('currentCrates', crates);

  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Player movement
  socket.on('playerMove', data => {
    if(players[socket.id]){
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      io.emit('playerMoved', players[socket.id]);
    }
  });

  // Player shooting bullet
  socket.on('shootBullet', bullet => {
    bullets.push(bullet); // bullet: {x, y, vx, vy, ownerId}
    io.emit('newBullet', bullet);
  });

  // Player hit another player
  socket.on('playerHit', ({ victimId, damage }) => {
    const victim = players[victimId];
    const attacker = players[socket.id];
    if(!victim || !attacker) return;

    victim.health -= damage;

    if(victim.health <= 0){
      attacker.coins += 5;
      victim.health = 100;
      victim.x = Math.random() * 1200;
      victim.y = Math.random() * 800;

      io.emit('playerRespawn', { id: victimId, x: victim.x, y: victim.y });
      io.to(attacker.id).emit('updateCoins', attacker.coins);
    }
  });

  // Crate collected
  socket.on('collectCrate', crateId => {
    const crateIndex = crates.findIndex(c => c.id === crateId);
    if(crateIndex !== -1){
      players[socket.id].fireRate = Math.max(100, players[socket.id].fireRate - 50);
      crates.splice(crateIndex, 1);
      io.emit('updateCrates', crates);
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));
