const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Elements
const scoreEl = document.getElementById('score');
const moneyEl = document.getElementById('money');
const uiLayer = document.getElementById('ui-layer');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const upgradeMenu = document.getElementById('upgrade-menu');
const costFireRateEl = document.getElementById('cost-firerate');
const costMultiShotEl = document.getElementById('cost-multishot');
const barFireRate = document.getElementById('bar-firerate');
const barMultiShot = document.getElementById('bar-multishot');
const finalScoreEl = document.getElementById('final-score');
const playerNameInput = document.getElementById('player-name');
const topScoresList = document.getElementById('top-scores-list');

// Game State
let gameState = 'START'; // START, PLAYING, GAMEOVER
let difficulty = 'easy';
let score = 0;
let money = 0;
let frames = 0;
let spawnRate = 90;
let lastTime = 0;
let mouse = { x: 0, y: 0 };

// Leaderboard
const LEADERBOARD_KEY = 'popTheBalloons_leaderboard';

// Upgrade Costs & Levels
const MAX_UPGRADES = 5;
let upgrades = {
    fireRate: { level: 0, cost: 100 },
    multiShot: { level: 0, cost: 500 }
};

// Entities
let tank;
let darts = [];
let balloons = [];
let particles = [];
let overlays = []; // Text overlays for +Score

class Tank {
    constructor() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.angle = 0;
        this.color = '#555';
        this.barrelLength = 40;
        this.width = 40;
        
        // Stats
        this.baseFireRate = 12; // Frames per shot
        this.currentFireRate = 12;
        this.fireTimer = 0;
        this.shotCount = 1;
        this.spread = 0.2; // Radians spread for multi-shot
    }

    update() {
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;

        // Rotate towards mouse
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        this.angle = Math.atan2(dy, dx);

        // Auto Fire
        if (this.fireTimer <= 0) {
            this.shoot();
            this.fireTimer = this.currentFireRate;
        } else {
            this.fireTimer--;
        }
    }

    shoot() {
        // Calculate spread
        let startAngle = this.angle;
        if (this.shotCount > 1) {
            startAngle -= (this.spread * (this.shotCount - 1)) / 2;
        }

        for (let i = 0; i < this.shotCount; i++) {
            const currentAngle = startAngle + (i * this.spread);
            // Spawn at tip of barrel
            const tipX = this.x + Math.cos(this.angle) * this.barrelLength;
            const tipY = this.y + Math.sin(this.angle) * this.barrelLength;
            
            darts.push(new Dart(tipX, tipY, currentAngle));
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Tank Body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Barrel
        ctx.fillStyle = '#333';
        ctx.fillRect(0, -10, this.barrelLength, 20);
        ctx.strokeStyle = '#111';
        ctx.strokeRect(0, -10, this.barrelLength, 20);

        // Flash effect
        if (this.fireTimer > this.currentFireRate - 3) {
            ctx.fillStyle = '#FFaa00';
            ctx.beginPath();
            ctx.arc(this.barrelLength + 5, 0, 8, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }
    
    recalcStats() {
        // FireRate: Faster base (12), upgrades reduce delay by 2
        this.currentFireRate = Math.max(3, this.baseFireRate - (upgrades.fireRate.level * 2));
        
        // MultiShot: Level 0 = 1, Level 1 = 2...
        this.shotCount = 1 + upgrades.multiShot.level;
    }
}

class Dart {
    constructor(x, y, angle) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 15;
        this.radius = 5;
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        ctx.fillStyle = '#FFFF00';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(-5, 5);
        ctx.lineTo(-5, -5);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
}

class Balloon {
    constructor() {
        // Spawn on random edge
        const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
        const padding = 50; 
        
        if (edge === 0) { // Top
            this.x = Math.random() * canvas.width;
            this.y = -padding;
        } else if (edge === 1) { // Right
            this.x = canvas.width + padding;
            this.y = Math.random() * canvas.height;
        } else if (edge === 2) { // Bottom
            this.x = Math.random() * canvas.width;
            this.y = canvas.height + padding;
        } else { // Left
            this.x = -padding;
            this.y = Math.random() * canvas.height;
        }

        this.radius = 20 + Math.random() * 10;
        
        // Stats based on difficulty
        const speedMult = difficulty === 'nuclear' ? 2.5 : (difficulty === 'medium' ? 1.5 : 1);
        const hpMult = difficulty === 'nuclear' ? 3 : (difficulty === 'medium' ? 2 : 1);
        
        this.speed = (0.5 + Math.random() * 1.5) * speedMult;
        this.hp = Math.ceil((0.5 + Math.random()) * hpMult); // Lower base HP
        
        // Color
        if (difficulty === 'nuclear') {
            this.color = `hsl(${80 + Math.random()*40}, 100%, 50%)`; // Toxic Green
        } else {
            this.color = `hsl(${Math.random()*360}, 70%, 50%)`;
        }
    }

    update() {
        // Move towards tank
        const dx = tank.x - this.x;
        const dy = tank.y - this.y;
        const dist = Math.hypot(dx, dy);
        
        this.x += (dx / dist) * this.speed;
        this.y += (dy / dist) * this.speed;

        // Collision with tank
        if (dist < 40 + this.radius) {
            endGame();
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Balloon Body
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, -5, this.radius, this.radius * 1.2, 0, 0, Math.PI*2);
        ctx.fill();

        // Shine
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.ellipse(-this.radius*0.3, -this.radius*0.5, this.radius*0.2, this.radius*0.4, -0.2, 0, Math.PI*2);
        ctx.fill();

        // String
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.radius * 1.1);
        ctx.quadraticCurveTo(5, this.radius * 2, 0, this.radius * 3);
        ctx.stroke();

        // HP if > 1
        if (this.hp > 1) {
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
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
        this.speed = Math.random() * 3;
        this.alpha = 1;
        this.decay = 0.02 + Math.random() * 0.03;
    }
    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.alpha -= this.decay;
    }
    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }
}

// Input Handling
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// Mouse Movement
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

// Touch Movement (Mobile Support)
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent scrolling
    const touch = e.touches[0];
    mouse.x = touch.clientX;
    mouse.y = touch.clientY;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault(); // Prevent scrolling
    const touch = e.touches[0];
    mouse.x = touch.clientX;
    mouse.y = touch.clientY;
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (gameState === 'PLAYING' && (e.code === 'Space' || e.code === 'KeyQ')) {
        toggleUpgradeMenu();
    }
});

// UI Buttons
document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        difficulty = btn.getAttribute('data-mode');
        startGame();
    });
});

document.getElementById('upgrade-btn').addEventListener('click', toggleUpgradeMenu);

document.getElementById('buy-firerate').addEventListener('click', () => buyUpgrade('fireRate'));
document.getElementById('buy-multishot').addEventListener('click', () => buyUpgrade('multiShot'));
document.getElementById('restart-btn').addEventListener('click', () => {
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    loadLeaderboard();
});

document.getElementById('save-score-btn').addEventListener('click', () => {
    const name = playerNameInput.value || "Anonymous";
    saveScore(name, score);
    gameOverScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    loadLeaderboard();
});

// Game Functions
function startGame() {
    gameState = 'PLAYING';
    score = 0;
    money = 0;
    frames = 0;
    upgrades = {
        fireRate: { level: 0, cost: 100 },
        multiShot: { level: 0, cost: 500 }
    };
    
    // Reset Entities
    tank = new Tank();
    tank.recalcStats();
    darts = [];
    balloons = [];
    particles = [];
    
    // UI Reets
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    upgradeMenu.classList.add('hidden');
    updateScoreUI();
    updateUpgradeUI();

    // Loop
    requestAnimationFrame(gameLoop);
}

function gameLoop() {
    if (gameState !== 'PLAYING') return;

    // Clear
    ctx.fillStyle = difficulty === 'nuclear' ? '#0f220f' : '#2ecc71'; // Background color
    if (difficulty === 'nuclear') ctx.fillStyle = '#051105'; // Darker nuclear
    if (difficulty === 'easy' || difficulty === 'medium') ctx.fillStyle = '#4caf50'; // Green grass

    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid details for ground (optional inspiration from screenshot)
    drawGroundDetail();

    tank.update();
    tank.draw();

    // Spawning Balloons
    // Spawn rate increases as game goes on
    let currentSpawnRate = Math.max(20, spawnRate - Math.floor(frames / 300)); 
    if (difficulty === 'nuclear') currentSpawnRate /= 2;
    
    if (frames % currentSpawnRate === 0) {
        balloons.push(new Balloon());
    }

    // Update Darts
    for (let i = darts.length - 1; i >= 0; i--) {
        const d = darts[i];
        d.update();
        d.draw();

        // Cleanup offscreen
        if (d.x < -100 || d.x > canvas.width + 100 || d.y < -100 || d.y > canvas.height + 100) {
            darts.splice(i, 1);
            continue;
        }

        // Collision
        for (let j = balloons.length - 1; j >= 0; j--) {
            const b = balloons[j];
            const dist = Math.hypot(d.x - b.x, d.y - b.y);
            if (dist < b.radius + d.radius) {
                // POP
                b.hp--;
                darts.splice(i, 1); // Remove dart
                
                // Spawn particles
                for(let p=0; p<3; p++) particles.push(new Particle(d.x, d.y, '#FFF'));

                if (b.hp <= 0) {
                    balloons.splice(j, 1);
                    popBalloon(b);
                }
                break; // Dart done
            }
        }
    }

    // Update Balloons
    balloons.forEach(b => {
        b.update();
        b.draw();
    });

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].update();
        particles[i].draw();
        if (particles[i].alpha <= 0) particles.splice(i, 1);
    }

    frames++;
    requestAnimationFrame(gameLoop);
}

function drawGroundDetail() {
    ctx.strokeStyle = 'rgba(0,0,0,0.05)';
    ctx.lineWidth = 2;
    const gridSize = 100;
    // Simple grid
    for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

function popBalloon(b) {
    score += 10;
    money += 10;
    updateScoreUI();
    updateUpgradeUI(); // Refresh buttons based on new money
    
    // Pop effect
    for (let i = 0; i < 10; i++) {
        particles.push(new Particle(b.x, b.y, b.color));
    }
}

function endGame() {
    gameState = 'GAMEOVER';
    finalScoreEl.innerText = score;
    gameOverScreen.classList.remove('hidden');
}

// Upgrade System
function toggleUpgradeMenu() {
    if (gameState !== 'PLAYING') return;
    upgradeMenu.classList.toggle('hidden');
    updateUpgradeUI();
}

function buyUpgrade(type) {
    const upg = upgrades[type];
    if (upg.level >= MAX_UPGRADES) return;
    if (money >= upg.cost) {
        money -= upg.cost;
        upg.level++;
        upg.cost = Math.floor(upg.cost * 1.5);
        
        tank.recalcStats();
        updateScoreUI();
        updateUpgradeUI();
    }
}

function updateScoreUI() {
    scoreEl.innerText = score;
    moneyEl.innerText = money;
}

// Leaderboard Storage
function loadLeaderboard() {
    const stored = localStorage.getItem(LEADERBOARD_KEY);
    const list = stored ? JSON.parse(stored) : [];
    
    // Render
    topScoresList.innerHTML = '';
    list.slice(0, 10).forEach((entry, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>#${i+1} ${entry.name}</span> <span>${entry.score}</span>`;
        topScoresList.appendChild(li);
    });
    
    const highScore = list.length > 0 ? list[0].score : 0;
    document.getElementById('high-score').innerText = highScore;
}

function saveScore(name, finalScore) {
    const stored = localStorage.getItem(LEADERBOARD_KEY);
    let list = stored ? JSON.parse(stored) : [];
    list.push({ name, score: finalScore }); // Use TOTAL score passed in
    list.sort((a, b) => b.score - a.score);
    list = list.slice(0, 10);
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list));
}

function updateUpgradeUI() {
    // FireRate
    if(upgrades.fireRate.level >= MAX_UPGRADES) {
        document.getElementById('buy-firerate').innerText = "Maxed";
        document.getElementById('buy-firerate').disabled = true;
        costFireRateEl.innerText = "-";
    } else {
        document.getElementById('buy-firerate').disabled = money < upgrades.fireRate.cost;
        costFireRateEl.innerText = upgrades.fireRate.cost;
        barFireRate.style.width = (upgrades.fireRate.level / MAX_UPGRADES * 100) + "%";
    }

    // MultiShot
    if(upgrades.multiShot.level >= MAX_UPGRADES) {
        document.getElementById('buy-multishot').innerText = "Maxed";
        document.getElementById('buy-multishot').disabled = true;
        costMultiShotEl.innerText = "-";
    } else {
        document.getElementById('buy-multishot').disabled = money < upgrades.multiShot.cost;
        costMultiShotEl.innerText = upgrades.multiShot.cost;
        barMultiShot.style.width = (upgrades.multiShot.level / MAX_UPGRADES * 100) + "%";
    }
}

// Init
loadLeaderboard();
