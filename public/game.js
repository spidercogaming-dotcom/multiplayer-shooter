const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 1200; // view size
canvas.height = 800;

const mapWidth = 2000;
const mapHeight = 1500;

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
shopBtn.textContent = "Shop (10 coins)";
shopBtn.addEventListener('click', () => {
  if(player.coins >= 10){
    player.coins -= 10;
    player.fireRate = Math.max(100, player.fireRate - 50);
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
}

// ===== Mouse Shooting =====
canvas.addEventListener('mousedown', e => {
    const now = Date.now();
    if(now - lastShot > player.fireRate){
        lastShot = now;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Convert mouse to world coordinates
        const camX = player.x - canvas.width/2 + player.size/2;
        const camY = player.y - canvas.height/2 + player.size/2;
        const targetX = mouseX + camX;
        const targetY = mouseY + camY;

        const dx = targetX - (player.x + player.size/2);
        const dy = targetY - (player.y + player.size/2);
        const dist = Math.sqrt(dx*dx + dy*dy);
        const vx = dx/dist * 10;
        const vy = dy/dist * 10;

        const bullet = { x: player.x + player.size/2, y: player.y + player.size/2, vx, vy, ownerId: player.id };
        bullets.push(bullet);
        socket.emit('shootBullet', bullet);
    }
});

// ===== Bullets =====
function updateBullets(){
  for(let i=bullets.length-1; i>=0; i--){
    let b = bullets[i];
    b.x += b.vx;
    b.y += b.vy;
    if(b.x<0||b.x>mapWidth||b.y<0||b.y>mapHeight){ bullets.splice(i,1); continue; }

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

// ===== Draw Game =====
function drawGame(){
  const camX = player.x - canvas.width/2 + player.size/2;
  const camY = player.y - canvas.height/2 + player.size/2;

  // Draw players
  drawPlayer(player,'cyan',camX,camY);
  for(let id in otherPlayers) drawPlayer(otherPlayers[id],'red',camX,camY);

  // Bullets
  for(let b of bullets){
    ctx.fillStyle='yellow';
    ctx.fillRect(b.x - camX - 3, b.y - camY -3, 6,6);
  }

  // Crates
  for(let c of crates){
    ctx.fillStyle='green';
    ctx.fillRect(c.x - camX, c.y - camY, c.size, c.size);
  }

  // Coins & health
  drawCoins();
  drawHealthBar(player, canvas.width/2 - player.size/2, canvas.height/2 - 10);

  // Mini-map
  drawMinimap();
}

function drawPlayer(p,color,camX,camY){
  ctx.fillStyle=color;
  ctx.fillRect(p.x - camX, p.y - camY, p.size, p.size);
  drawHealthBar(p,p.x - camX,p.y - camY -10);
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

// ===== Mini-map =====
function drawMinimap(){
  const scale = 0.1;
  const mmWidth = mapWidth*scale;
  const mmHeight = mapHeight*scale;
  ctx.fillStyle='rgba(0,0,0,0.5)';
  ctx.fillRect(10,10, mmWidth, mmHeight);

  // player
  ctx.fillStyle='cyan';
  ctx.fillRect(10 + player.x*scale -2,10 + player.y*scale -2,4,4);

  // other players
  for(let id in otherPlayers){
    const p = otherPlayers[id];
    ctx.fillStyle='red';
    ctx.fillRect(10 + p.x*scale -2,10 + p.y*scale -2,4,4);
  }
}

