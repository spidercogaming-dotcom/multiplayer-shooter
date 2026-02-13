// ===== game.js =====
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1200;
canvas.height = 800;

const socket = io();

// ===== Player Data =====
let player = { id: '', x:0, y:0, size:30, health:100, coins:0 };
const otherPlayers = {}; // id -> player
const bullets = [];

// Input
const keys = {};
document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup', e => keys[e.key] = false);

// Shop
const shopBtn = document.getElementById('shopBtn');
shopBtn.addEventListener('click', () => {
  if(player.coins >= 10){
    player.coins -= 10;
    alert("Fire rate upgraded!");
  } else {
    alert("Not enough coins!");
  }
});

// ===== Socket Events =====
socket.on('currentPlayers', players => {
  for(let id in players){
    if(id === socket.id){
      player = players[id];
    } else {
      otherPlayers[id] = players[id];
    }
  }
});

socket.on('newPlayer', p => {
  otherPlayers[p.id] = p;
});

socket.on('playerMoved', p => {
  if(otherPlayers[p.id]) otherPlayers[p.id] = p;
});

socket.on('playerDisconnected', id => {
  delete otherPlayers[id];
});

socket.on('playerRespawn', data => {
  if(otherPlayers[data.id]){
    otherPlayers[data.id].x = data.x;
    otherPlayers[data.id].y = data.y;
    otherPlayers[data.id].health = 100;
  }
});

socket.on('updateCoins', coins => {
  player.coins = coins;
});

// ===== Game Loop =====
function gameLoop(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  handleInput();
  drawPlayer(player, 'cyan');
  for(let id in otherPlayers){
    drawPlayer(otherPlayers[id], 'red');
  }
  drawCoins();
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// ===== Functions =====
function handleInput(){
  let moved = false;
  if(keys['w'] || keys['ArrowUp']) { player.y -= 5; moved=true; }
  if(keys['s'] || keys['ArrowDown']) { player.y += 5; moved=true; }
  if(keys['a'] || keys['ArrowLeft']) { player.x -= 5; moved=true; }
  if(keys['d'] || keys['ArrowRight']) { player.x += 5; moved=true; }

  if(moved){
    socket.emit('playerMove', {x:player.x, y:player.y});
  }

  // Shooting example: Spacebar sends hit to server
  if(keys[' ']){
    // For simplicity, you can later detect hits with ray or rectangles and send:
    // socket.emit('playerHit', { victimId: targetId, damage: 10 });
  }
}

function drawPlayer(p, color){
  ctx.fillStyle = color;
  ctx.fillRect(p.x, p.y, p.size, p.size);
}

function drawCoins(){
  ctx.fillStyle="gold";
  ctx.font="25px Arial";
  ctx.fillText("Coins: "+player.coins, 20, 40);
}
