const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1200;
canvas.height = 800;

const socket = io();

let player = { id:'', x:0, y:0, size:30, health:100, coins:0, fireRate:500 };
const otherPlayers = {};
let bullets = [];
let crates = [];

const keys = {};
document.addEventListener('keydown', e => keys[e.key] = true);
document.addEventListener('keyup', e => keys[e.key] = false);

let lastShot = 0;

// Shop
const shopBtn = document.getElementById('shopBtn');
shopBtn.addEventListener('click', () => {
  if(player.coins >= 10){
    player.coins -= 10;
    alert("Fire rate upgraded!");
  } else alert("Not enough coins!");
});

// ===== Socket Events =====
socket.on('currentPlayers', players => {
  for(let id in players){
    if(id === socket.id) player = players[id];
    else otherPlayers[id] = players[id];
  }
});

socket.on('currentCrates', serverCrates => { crates = serverCrates; });
socket.on('updateCrates', serverCrates => { crates = serverCrates; });

socket.on('newPlayer', p => { otherPlayers[p.id] = p; });
socket.on('playerMoved', p => { if(otherPlayers[p.id]) otherPlayers[p.id] = p; });
socket.on('playerDisconnected', id => { delete otherPlayers[id]; });
socket.on('playerRespawn', data => { if(otherPlayers[data.id]) { otherPlayers[data.id].x=data.x; otherPlayers[data.id].y=data.y; otherPlayers[data.id].health=100; } });
socket.on('updateCoins', coins => player.coins = coins);
socket.on('newBullet', bullet => bullets.push(bullet));

// ===== Game Loop =====
function gameLoop(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  handleInput();
  updateBullets();
  drawGame();
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// ===== Functions =====
function handleInput(){
  let moved=false;
  if(keys['w']||keys['ArrowUp']){ player.y -=5; moved=true; }
  if(keys['s']||keys['ArrowDown']){ player.y +=5; moved=true; }
  if(keys['a']||keys['ArrowLeft']){ player.x -=5; moved=true; }
  if(keys['d']||keys['ArrowRight']){ player.x +=5; moved=true; }
  
  if(moved) socket.emit('playerMove',{x:player.x, y:player.y});

  // Mouse aiming bullets
  if(keys[' ']){ // spacebar
    let now = Date.now();
    if(now - lastShot > player.fireRate){
      lastShot = now;
      // Shoot bullet straight upwards for now (can change to mouse coordinates)
      let bullet = { x: player.x + player.size/2, y: player.y + player.size/2, vx: 0, vy: -10, ownerId: player.id };
      bullets.push(bullet);
      socket.emit('shootBullet', bullet);
    }
  }
}

canvas.addEventListener('mousedown', e=>{
  let now = Date.now();
  if(now - lastShot > player.fireRate){
    lastShot = now;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - (player.x + player.size/2);
    const dy = my - (player.y + player.size/2);
    const dist = Math.sqrt(dx*dx + dy*dy);
    const vx = dx/dist*10;
    const vy = dy/dist*10;
    const bullet = { x: player.x + player.size/2, y: player.y + player.size/2, vx, vy, ownerId: player.id };
    bullets.push(bullet);
    socket.emit('shootBullet', bullet);
  }
});

function updateBullets(){
  for(let i=bullets.length-1; i>=0; i--){
    let b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    // Remove offscreen bullets
    if(b.x<0||b.x>canvas.width||b.y<0||b.y>canvas.height){ bullets.splice(i,1); continue; }

    // Hit other players
    for(let id in otherPlayers){
      let p = otherPlayers[id];
      if(b.ownerId!==id && b.x>p.x && b.x<p.x+p.size && b.y>p.y && b.y<p.y+p.size){
        socket.emit('playerHit',{victimId:id, damage:10});
        bullets.splice(i,1);
        break;
      }
    }
  }
}

function drawGame(){
  drawPlayer(player,'cyan');
  for(let id in otherPlayers) drawPlayer(otherPlayers[id],'red');
  for(let b of bullets){
    ctx.fillStyle='yellow';
    ctx.fillRect(b.x-3,b.y-3,6,6);
  }
  for(let c of crates){
    ctx.fillStyle='green';
    ctx.fillRect(c.x,c.y,c.size,c.size);
  }
  drawCoins();
  drawHealthBar(player,player.x,player.y-10);
}

function drawPlayer(p,color){
  ctx.fillStyle=color;
  ctx.fillRect(p.x,p.y,p.size,p.size);
  drawHealthBar(p,p.x,p.y-10);
}

function drawHealthBar(p,x,y){
  ctx.fillStyle='red';
  ctx.fillRect(x,y,p.size,5);
  ctx.fillStyle='lime';
  ctx.fillRect(x,y,(p.health/100)*p.size,5);
}

function drawCoins(){
  ctx.fillStyle="gold";
  ctx.font="25px Arial";
  ctx.fillText("Coins: "+player.coins,20,40);
}
