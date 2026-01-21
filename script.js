const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elements
const scoreEl = document.getElementById('score');
const moneyEl = document.getElementById('money');
const waveEl = document.getElementById('wave');
const uiLayer = document.getElementById('ui-layer');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const upgradeMenu = document.getElementById('upgrade-menu');
const costFireRateEl = document.getElementById('cost-firerate');
const costMultiShotEl = document.getElementById('cost-multishot');
const costShotgunEl = document.getElementById('cost-shotgun');
const costLaserEl = document.getElementById('cost-laser');
const barFireRate = document.getElementById('bar-firerate');
const barMultiShot = document.getElementById('bar-multishot');
const finalScoreEl = document.getElementById('final-score');
const playerNameInput = document.getElementById('player-name');
const topScoresList = document.getElementById('top-scores-list');
const audioToggleBtn = document.getElementById('audio-btn');
const pauseBtn = document.getElementById('pause-btn');

// Game State
let gameState = 'START';
let difficulty = 'easy';
let score = 0;
let money = 0;
let frames = 0; // Keeping for cosmetic anims (wobble)
let mouse = { x: 0, y: 0 };
let isAudioMuted = false;
let loopId = 0; // To cancel loops
let lastTime = 0; // Delta time tracking

// Audio System
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const Sound = {
    playTone: (freq, type, duration, vol = 0.1) => {
        if (gameState !== 'PLAYING' && gameState !== 'START') return;
        if (isAudioMuted) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    },
    shoot: () => Sound.playTone(300, 'square', 0.1, 0.1),
    shotgun: () => {
         Sound.playTone(150, 'sawtooth', 0.2, 0.15); // Shorter duration
         Sound.playTone(100, 'square', 0.2, 0.15);
    },
    laser: () => {
        if (isAudioMuted) return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    },
    pop: () => Sound.playTone(500 + Math.random() * 500, 'sine', 0.1, 0.1),
    buy: () => {
         Sound.playTone(600, 'sine', 0.1, 0.2);
         setTimeout(() => Sound.playTone(1200, 'sine', 0.2, 0.2), 100);
    },
    error: () => Sound.playTone(150, 'sawtooth', 0.3, 0.2)
};

// Leaderboard
const LEADERBOARD_KEY = 'popTheBalloons_leaderboard';

// Upgrade Costs & State
const MAX_UPGRADES = 5;
let upgrades = {
    fireRate: { level: 0, cost: 100 },
    multiShot: { level: 0, cost: 500 },
    shotgun: { unlocked: false, cost: 1000 },
    laser: { unlocked: false, cost: 2500 }
};

let currentWeapon = 'standard';

// Wave System
let wave = 1;
let enemiesRemainingToSpawn = 0;
let spawnTimer = 0;    // Now in seconds
let waveCooldown = 0;  // Now in seconds
let activeEnemies = 0;

// Entities
let tank;
let darts = [];
let lasers = [];
let balloons = [];
let particles = [];
let waveText = null; // Store reference to wave text element

class Tank {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.angle = 0;
        this.color = '#00f3ff';
        this.barrelLength = 40;
        this.width = 40;
        
        // Stats
        this.baseFireRate = 0.25; // Seconds per shot (approx 15 frames @ 60fps)
        this.currentFireRate = 0.25;
        this.fireTimer = 0;
        this.shotCount = 1;
        this.spread = 0.2;
        
        this.recoilX = 0;
        this.recoilY = 0;
    }

    update(dt) {
        // Damping recoil (time based)
        this.recoilX *= Math.pow(0.1, dt); // Strong damping
        this.recoilY *= Math.pow(0.1, dt);

        this.x = (canvas.width / 2) + this.recoilX;
        this.y = (canvas.height / 2) + this.recoilY;

        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        this.angle = Math.atan2(dy, dx);

        // Auto Fire
        if (this.fireTimer <= 0) {
            this.shoot();
            // Weapon specific delays
            if (currentWeapon === 'shotgun') this.fireTimer = this.currentFireRate * 2.5;
            else if (currentWeapon === 'laser') this.fireTimer = Math.max(0.3, this.currentFireRate * 2); 
            else this.fireTimer = this.currentFireRate;
        } else {
            this.fireTimer -= dt;
        }
    }

    shoot() {
        const kick = currentWeapon === 'shotgun' ? 10 : (currentWeapon === 'laser' ? 5 : 3);
        this.recoilX = -Math.cos(this.angle) * kick;
        this.recoilY = -Math.sin(this.angle) * kick;

        const tipX = this.x + Math.cos(this.angle) * this.barrelLength;
        const tipY = this.y + Math.sin(this.angle) * this.barrelLength;

        if (currentWeapon === 'laser') {
            Sound.laser();
            let hit = false;
            const laserLen = Math.max(canvas.width, canvas.height);
            const endX = tipX + Math.cos(this.angle) * laserLen;
            const endY = tipY + Math.sin(this.angle) * laserLen;
            
            lasers.push({sx: tipX, sy: tipY, ex: endX, ey: endY, life: 0.2}); // 0.2s life

            for (let i = balloons.length - 1; i >= 0; i--) {
                const b = balloons[i];
                const v1x = endX - tipX, v1y = endY - tipY;
                const v2x = b.x - tipX, v2y = b.y - tipY;
                const lenSq = v1x*v1x + v1y*v1y;
                let u = (v2x * v1x + v2y * v1y) / lenSq;
                u = Math.max(0, Math.min(1, u));
                const cx = tipX + u * v1x;
                const cy = tipY + u * v1y;
                const distSq = (b.x - cx)**2 + (b.y - cy)**2;
                
                if (distSq < (b.radius + 10)**2) { 
                    b.hp -= 5;
                    createHighlight(b.x, b.y, '#00f3ff');
                    if(b.hp <= 0) {
                        popBalloon(b);
                        balloons.splice(i, 1);
                    }
                }
            }
        } else if (currentWeapon === 'shotgun') {
            Sound.shotgun();
            const pellets = 5 + (this.shotCount);
            const spread = 0.5;
            for(let i=0; i<pellets; i++) {
                const angleOffset = (Math.random() - 0.5) * spread;
                // Speed ~720px/s
                darts.push(new Dart(tipX, tipY, this.angle + angleOffset, 720 + Math.random() * 300, 0.5)); 
            }
        } else {
            Sound.shoot();
            let startAngle = this.angle;
            if (this.shotCount > 1) {
                startAngle -= (this.spread * (this.shotCount - 1)) / 2;
            }
            for (let i = 0; i < this.shotCount; i++) {
                const currentAngle = startAngle + (i * this.spread);
                // Speed ~900px/s (15px/frame * 60)
                darts.push(new Dart(tipX, tipY, currentAngle, 900));
            }
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = this.color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.fillRect(0, -6, this.barrelLength, 12);
        ctx.shadowBlur = 0;

        ctx.restore();
    }
    
    recalcStats() {
        // Base 0.25s. Max upgrade (lvl 5) reduces by 0.15s -> 0.1s
        this.currentFireRate = Math.max(0.05, this.baseFireRate - (upgrades.fireRate.level * 0.03));
        this.shotCount = 1 + upgrades.multiShot.level;
    }
}

class Dart {
    constructor(x, y, angle, speed = 900, lifeSeconds = 2) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = speed;
        this.radius = 4;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.life = lifeSeconds;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        ctx.fillStyle = currentWeapon === 'shotgun' ? '#ffaa00' : '#ffff00';
        ctx.shadowBlur = 5;
        ctx.shadowColor = ctx.fillStyle;
        
        ctx.beginPath();
        if (currentWeapon === 'shotgun') ctx.arc(0,0,3,0,Math.PI*2);
        else {
             ctx.moveTo(8, 0);
             ctx.lineTo(-4, 4);
             ctx.lineTo(-4, -4);
        }
        ctx.fill();
        ctx.restore();
    }
}

class Balloon {
    constructor(isSeeker = false) {
        this.isSeeker = isSeeker;
        const edge = Math.floor(Math.random() * 4); 
        const padding = 60; 
        
        if (edge === 0) { this.x = Math.random() * canvas.width; this.y = -padding; }
        else if (edge === 1) { this.x = canvas.width + padding; this.y = Math.random() * canvas.height; }
        else if (edge === 2) { this.x = Math.random() * canvas.width; this.y = canvas.height + padding; }
        else { this.x = -padding; this.y = Math.random() * canvas.height; }

        this.radius = 15 + Math.random() * 15;
        
        // Difficulty scaling
        let speedBase = 1.0 + (wave * 0.1); 
        // 60fps * (0.5 to 2.0) ~ 30 to 120 px/s? No, previously was per frame.
        // Old: 0.5 to 2.0 per frame. @60fps = 30 to 120 px/s.
        // Let's speed it up slightly for exciting gameplay. 60 - 180 px/s
        
        let moveSpeed = (60 + Math.random() * 120) * speedBase;
        
        let hpBase = 1 + Math.floor(wave / 2);

        this.speed = moveSpeed;
        this.hp = hpBase;
        if (isSeeker) {
            this.speed *= 0.7; 
            this.hp = Math.floor(this.hp * 1.5);
            this.color = '#ff0055'; 
        } else {
             const hues = [120, 180, 280, 300]; 
             const hue = hues[Math.floor(Math.random() * hues.length)];
             this.color = `hsl(${hue}, 100%, 50%)`;
        }
    }

    update(dt) {
        let dx, dy;
        if (this.isSeeker) {
            dx = tank.x - this.x;
            dy = tank.y - this.y;
        } else {
            dx = (canvas.width/2) - this.x;
            dy = (canvas.height/2) - this.y;
        }
        
        const dist = Math.hypot(dx, dy);
        this.x += (dx / dist) * this.speed * dt;
        this.y += (dy / dist) * this.speed * dt;

        this.x += Math.sin(frames * 0.05 + this.y) * 30 * dt; // Wobble per second

        if (dist < 30 + this.radius) {
            endGame();
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        if (this.isSeeker) {
            ctx.beginPath();
            ctx.moveTo(this.radius, 0);
            ctx.lineTo(-this.radius, this.radius);
            ctx.lineTo(-this.radius, -this.radius);
            ctx.fill();
        } else {
            ctx.beginPath();
            ctx.ellipse(0, 0, this.radius, this.radius * 1.1, 0, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        
        if (this.hp > 1) {
            ctx.fillStyle = 'white';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(this.hp, 0, 5);
        }
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 60 + Math.random() * 240; // px/s
        this.alpha = 1;
        this.decay = 1.0 + Math.random(); // alpha loss per second
    }
    update(dt) {
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;
        this.alpha -= this.decay * dt;
        this.speed *= Math.pow(0.5, dt); // Drag
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.alpha);
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 5;
        ctx.shadowColor = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 2, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
}

// Input
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); 
    const touch = e.touches[0];
    mouse.x = touch.clientX;
    mouse.y = touch.clientY;
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); 
    const touch = e.touches[0];
    mouse.x = touch.clientX;
    mouse.y = touch.clientY;
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'KeyQ' || e.code === 'Escape') {
        if (gameState === 'PLAYING' || gameState === 'PAUSED') togglePause();
    }
    
    if (gameState === 'PLAYING') {
        if (e.code === 'Digit1') equipWeapon('standard');
        if (e.code === 'Digit2') equipWeapon('shotgun');
        if (e.code === 'Digit3') equipWeapon('laser');
    }
});

document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        difficulty = btn.getAttribute('data-mode');
        if(audioCtx.state === 'suspended') audioCtx.resume();
        startGame();
    });
});

document.getElementById('upgrade-btn').addEventListener('click', togglePause);
document.getElementById('close-menu-btn').addEventListener('click', togglePause);
document.getElementById('pause-btn').addEventListener('click', togglePause);
document.getElementById('buy-firerate').addEventListener('click', () => buyUpgrade('fireRate'));
document.getElementById('buy-multishot').addEventListener('click', () => buyUpgrade('multiShot'));
document.getElementById('buy-shotgun').addEventListener('click', () => unlockWeapon('shotgun'));
document.getElementById('buy-laser').addEventListener('click', () => unlockWeapon('laser'));

const restart = () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    loadLeaderboard();
};
document.getElementById('restart-btn').addEventListener('click', restart);

audioToggleBtn.addEventListener('click', () => {
    isAudioMuted = !isAudioMuted;
    audioToggleBtn.innerText = isAudioMuted ? "🔇" : "🔊";
});

document.getElementById('save-score-btn').addEventListener('click', () => {
    const name = playerNameInput.value || "Anonymous";
    saveScore(name, score);
    restart();
});

function startGame() {
    if (loopId) cancelAnimationFrame(loopId); // Stop old loop if any
    
    gameState = 'PLAYING';
    score = 0;
    money = 0;
    frames = 0;
    wave = 1;
    startWave(1);
    
    upgrades = {
        fireRate: { level: 0, cost: 100 },
        multiShot: { level: 0, cost: 500 },
        shotgun: { unlocked: false, cost: 1000 },
        laser: { unlocked: false, cost: 2500 }
    };
    currentWeapon = 'standard';
    
    tank = new Tank();
    tank.recalcStats();
    darts = [];
    balloons = [];
    particles = [];
    lasers = [];
    
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    upgradeMenu.classList.add('hidden');
    updateScoreUI();
    updateUpgradeUI();

    lastTime = performance.now();
    loopId = requestAnimationFrame(gameLoop);
}

function startWave(n) {
    wave = n;
    enemiesRemainingToSpawn = 10 + (n * 5); 
    spawnTimer = 1.0; 
    waveEl.innerText = wave;
    
    // Anounce
    if (waveText) waveText.remove();
    waveText = document.createElement('div');
    waveText.innerText = `WAVE ${wave}`;
    waveText.style = "position:absolute; top:40%; left:50%; transform:translate(-50%,-50%); font-size:60px; color:var(--neon-green); font-family:var(--font-heading); text-shadow:0 0 20px black; pointer-events:none; animation: fadeUp 2s forwards;";
    document.body.appendChild(waveText);
    setTimeout(() => { if(waveText) waveText.remove(); }, 2000);
    
    Sound.playTone(400, 'sine', 0.5, 0.2);
}

function gameLoop(timestamp) {
    if (gameState !== 'PLAYING') return;

    // Delta Time Calculation
    if (!lastTime) lastTime = timestamp;
    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Clear
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    drawGroundDetail();
    
    tank.update(dt);
    tank.draw();
    
    // Wave Logic
    if (activeEnemies === 0 && enemiesRemainingToSpawn === 0) {
        // Wave Complete
        waveCooldown += dt;

        // Show Pause / Countdown
        ctx.save();
        ctx.fillStyle = "white";
        ctx.font = "20px 'Orbitron'";
        ctx.textAlign = "center";
        ctx.fillText(`NEXT WAVE IN ${(4.0 - waveCooldown).toFixed(1)}`, canvas.width/2, 100);
        ctx.restore();

        if (waveCooldown > 4.0) { // 4 seconds delay
             startWave(wave + 1);
             waveCooldown = 0;
        }
    } else {
        // Spawning
        if (enemiesRemainingToSpawn > 0) {
             spawnTimer -= dt;
             if (spawnTimer <= 0) {
                 const isSeeker = (wave > 2) && (Math.random() > 0.7);
                 balloons.push(new Balloon(isSeeker));
                 enemiesRemainingToSpawn--;
                 activeEnemies++;
                 
                 // Rate calculation
                 let rate = Math.max(0.2, 1.5 - (wave * 0.1));
                 if (difficulty === 'nuclear') rate /= 2;
                 spawnTimer = rate;
             }
        }
    }

    // Weapons
    for (let i = darts.length - 1; i >= 0; i--) {
        const d = darts[i];
        d.update(dt);
        d.draw();

        if (d.life <= 0 || d.x < -100 || d.x > canvas.width + 100 || d.y < -100 || d.y > canvas.height + 100) {
            darts.splice(i, 1);
            continue;
        }

        // Hit Check
        for (let j = balloons.length - 1; j >= 0; j--) {
            const b = balloons[j];
            const dist = Math.hypot(d.x - b.x, d.y - b.y);
            if (dist < b.radius + d.radius) {
                b.hp--;
                Sound.pop();
                createHighlight(d.x, d.y, '#FFF');
                darts.splice(i, 1); 
                
                if (b.hp <= 0) {
                    popBalloon(b);
                    balloons.splice(j, 1);
                }
                break;
            }
        }
    }
    
    // Lasers
    for (let i = lasers.length - 1; i >= 0; i--) {
        const l = lasers[i];
        ctx.strokeStyle = `rgba(0, 243, 255, ${l.life / 0.2})`;
        ctx.lineWidth = 4 + Math.random() * 4;
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00f3ff';
        ctx.beginPath();
        ctx.moveTo(l.sx, l.sy);
        ctx.lineTo(l.ex, l.ey);
        ctx.stroke();
        ctx.shadowBlur = 0;
        l.life -= dt;
        if (l.life <= 0) lasers.splice(i, 1);
    }

    // Balloons
    activeEnemies = balloons.length;
    balloons.forEach(b => {
        b.update(dt);
        b.draw();
    });

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update(dt);
        particles[i].draw();
        if (particles[i].alpha <= 0) particles.splice(i, 1);
    }

    frames++;
    loopId = requestAnimationFrame(gameLoop);
}

function drawGroundDetail() {
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.1)';
    ctx.lineWidth = 1;
    const gridSize = 50;
    const offset = (frames * 1) % gridSize; // Purely cosmetic, frames is ok
    
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = offset - gridSize; y < canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

function createHighlight(x, y, color) {
    for (let i = 0; i < 5; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function popBalloon(b) {
    score += (10 + wave);
    money += (10 + Math.floor(wave/2));
    updateScoreUI();
    updateUpgradeUI(); 
    Sound.pop();
    
    for (let i = 0; i < 15; i++) {
        particles.push(new Particle(b.x, b.y, b.color));
    }
}

function endGame() {
    gameState = 'GAMEOVER';
    finalScoreEl.innerText = score;
    gameOverScreen.classList.remove('hidden');
    Sound.playTPause() {
    if (gameState === 'PLAYING') {
        gameState = 'PAUSED';
        upgradeMenu.classList.remove('hidden');
        pauseBtn.innerText = "▶"; // Change icon to Play
        updateUpgradeUI();
    } else if (gameState === 'PAUSED') {
        gameState = 'PLAYING';
        upgradeMenu.classList.add('hidden');
        pauseBtn.innerText = "⏸"; // Change icon back to Pause
        lastTime = performance.now(); // Essential to prevent huge DT jump
        loopId = requestAnimationFrame(gameLoop);
    }
}

function buyUpgrade(type) {
    const upg = upgrades[type];
    if (upg.level >= MAX_UPGRADES) return;
    // Allow buying in PAUSED state too

function buyUpgrade(type) {
    const upg = upgrades[type];
    if (upg.level >= MAX_UPGRADES) return;
    if (money >= upg.cost) {
        money -= upg.cost;
        upg.level++;
        upg.cost = Math.floor(upg.cost * 1.5);
        Sound.buy();
        tank.recalcStats();
        updateScoreUI();
        updateUpgradeUI();
    } else {
        Sound.error();
    }
}

function unlockWeapon(type) {
    const upg = upgrades[type];
    if (upg.unlocked) { 
        equipWeapon(type);
        return;
    }
    
    if (money >= upg.cost) {
        money -= upg.cost;
        upg.unlocked = true;
        Sound.buy();
        equipWeapon(type);
        updateScoreUI();
        updateUpgradeUI();
    } else {
        Sound.error();
    }
}

function equipWeapon(type) {
    if (type !== 'standard' && !upgrades[type].unlocked) return;
    currentWeapon = type;
    Sound.playTone(600, 'square', 0.1);
    updateUpgradeUI();
}

function updateScoreUI() {
    scoreEl.innerText = score;
    moneyEl.innerText = money;
}

function loadLeaderboard() {
    const list = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    topScoresList.innerHTML = '';
    list.slice(0, 10).forEach((entry, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>#${i+1} ${entry.name}</span> <span>${entry.score}</span>`;
        topScoresList.appendChild(li);
    });
    const currHigh = list.length > 0 ? list[0].score : 0;
    document.getElementById('high-score').innerText = currHigh;
}

function saveScore(name, finalScore) {
    let list = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    list.push({ name, score: finalScore });
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list.slice(0, 10)));
}

function updateUpgradeUI() {
    ['fireRate', 'multiShot'].forEach(key => {
        const upg = upgrades[key];
        const btn = document.getElementById('buy-' + key.toLowerCase());
        const costEl = document.getElementById('cost-' + key.toLowerCase());
        const bar = document.getElementById('bar-' + key.toLowerCase());
        
        if (upg.level >= MAX_UPGRADES) {
            btn.innerText = "MAX";
            btn.disabled = true;
            costEl.innerText = "-";
        } else {
            btn.disabled = money < upg.cost;
            costEl.innerText = upg.cost;
            bar.style.width = (upg.level / MAX_UPGRADES * 100) + "%";
        }
    });

    ['shotgun', 'laser'].forEach(key => {
        const upg = upgrades[key];
        const btn = document.getElementById('buy-' + key);
        const costEl = document.getElementById('cost-' + key);
        
        if (upg.unlocked) {
            btn.innerText = currentWeapon === key ? "EQUIPPED" : "EQUIP";
            btn.disabled = currentWeapon === key;
            costEl.innerText = "Owned";
            btn.style.borderColor = currentWeapon === key ? '#00ff00' : '#00f3ff';
            btn.style.color = currentWeapon === key ? '#00ff00' : '#00f3ff';
        } else {
            btn.innerText = "BUY";
            btn.disabled = money < upg.cost;
            costEl.innerText = upg.cost;
        }
    });
}
