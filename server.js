// ===== server.js =====
const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let players = {}; // store all players

io.on('connection', socket => {
  console.log('Player connected: ', socket.id);

  // Add player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * 1200,
    y: Math.random() * 800,
    size: 30,
    health: 100,
    coins: 0
  };

  // Send new player their info
  socket.emit('currentPlayers', players);

  // Notify others
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Player movement update
  socket.on('playerMove', data => {
    if(players[socket.id]){
      players[socket.id].x = data.x;
      players[socket.id].y = data.y;
      io.emit('playerMoved', players[socket.id]);
    }
  });

  // Player shooting hits another player
  socket.on('playerHit', ({ victimId, damage }) => {
    const victim = players[victimId];
    const attacker = players[socket.id];
    if(!victim || !attacker) return;

    victim.health -= damage;

    if(victim.health <= 0){
      attacker.coins += 5; // reward killer
      victim.health = 100;
      victim.x = Math.random() * 1200;
      victim.y = Math.random() * 800;

      io.emit('playerRespawn', { id: victimId, x: victim.x, y: victim.y });
      io.to(attacker.id).emit('updateCoins', attacker.coins);
    }
  });

  socket.on('disconnect', () => {
    console.log('Player disconnected: ', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

http.listen(PORT, () => console.log(`Server running on port ${PORT}`));

