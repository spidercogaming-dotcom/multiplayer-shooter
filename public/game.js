let lightning = 0; // 0 = no flash, >0 = flash duration

function drawBackground() {
    // Stormy gradient
    const grad = ctx.createLinearGradient(0, 0, 0, MAP_HEIGHT);
    grad.addColorStop(0, "#111"); // top
    grad.addColorStop(1, "#222"); // bottom
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

    // Grid overlay
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    const gridSize = 100;
    for (let x = 0; x <= MAP_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, MAP_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= MAP_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(MAP_WIDTH, y);
        ctx.stroke();
    }

    // Lightning effect
    if (Math.random() < 0.002 && lightning === 0) lightning = 5; // random flash
    if (lightning > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
        lightning--;
    }
}

