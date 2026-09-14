/* ==========================================================================
   bhavyyyya — 3D Virtual CRT TV Box & Playable Terminal Games
   - Built with Three.js (3D retro TV chassis, knobs, curved CRT, antenna)
   - 2D Canvas Terminal Texture (Scanlines, CRT phosphor, 60fps)
   - Playable games: SNAKE.EXE, PONG.EXE, DEFENDER.EXE, MATRIX.EXE
   - Mouse orbit/tilt, raycaster knob clicks, keyboard & on-screen D-pad
   - Strictly zero purple gradients, amber phosphor / monochrome CRT theme
   ========================================================================== */

(function initVirtualCRT() {
  const container = document.getElementById('tv-stage');
  if (!container) return;

  // ---------------------------------------------------------------------------
  // 1. CRT SCREEN 2D CANVAS & TERMINAL ENGINE
  // ---------------------------------------------------------------------------
  const SCREEN_WIDTH = 640;
  const SCREEN_HEIGHT = 480;
  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = SCREEN_WIDTH;
  screenCanvas.height = SCREEN_HEIGHT;
  const ctx = screenCanvas.getContext('2d');

  // Palette settings
  const PALETTES = {
    amber: {
      bg: '#0C0D10',
      primary: '#E8A33D',
      dim: '#7A521D',
      bright: '#FFF2D6',
      scanline: 'rgba(0, 0, 0, 0.28)'
    },
    green: {
      bg: '#0A0E0A',
      primary: '#38D668',
      dim: '#185C2C',
      bright: '#E0FFE8',
      scanline: 'rgba(0, 0, 0, 0.28)'
    },
    white: {
      bg: '#0E0E10',
      primary: '#E8E8E8',
      dim: '#66666A',
      bright: '#FFFFFF',
      scanline: 'rgba(0, 0, 0, 0.28)'
    }
  };

  let currentPaletteKey = 'amber';
  let colors = PALETTES[currentPaletteKey];

  // TV State: 'BOOT', 'MENU', 'SNAKE', 'PONG', 'DEFENDER', 'MATRIX', 'OFF'
  let tvState = 'MENU';
  let isPoweredOn = true;
  let powerAnimationProgress = 1.0; // 0 = fully collapsed, 1 = fully open
  let powerTransitioning = false;

  // Global game tick counters
  let tick = 0;
  let blinkState = true;

  // ---------------------------------------------------------------------------
  // 1.5. RETRO ARCADE SOUND SYNTHESIZER (ZERO-DEPENDENCY WEB AUDIO API)
  // ---------------------------------------------------------------------------
  let audioCtx = null;
  let masterGain = null;

  function getAudioContext() {
    try {
      if (!audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          audioCtx = new AudioCtx();
          masterGain = audioCtx.createGain();
          masterGain.gain.setValueAtTime(0.35, audioCtx.currentTime);
          masterGain.connect(audioCtx.destination);
        }
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    } catch (_) {}
    return audioCtx;
  }

  const sfx = {
    playTone(freq, duration = 0.08, type = 'sine', startGain = 0.12, endGain = 0.0001, delay = 0) {
      try {
        const ctx = getAudioContext();
        if (!ctx || !masterGain) return;
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(startGain, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(endGain, 0.00001), now + duration);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + duration);

        setTimeout(() => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch (_) {}
        }, (delay + duration + 0.05) * 1000);
      } catch (_) {}
    },

    playSweep(startFreq, endFreq, duration = 0.08, type = 'sine', startGain = 0.12, delay = 0) {
      try {
        const ctx = getAudioContext();
        if (!ctx || !masterGain) return;
        const now = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), now + duration);

        gain.gain.setValueAtTime(startGain, now);
        gain.gain.exponentialRampToValueAtTime(0.00001, now + duration);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + duration);

        setTimeout(() => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch (_) {}
        }, (delay + duration + 0.05) * 1000);
      } catch (_) {}
    },

    // Mechanical toggle switch clunk + CRT power warm up/down
    toggleSwitch(powered) {
      try {
        const ctx = getAudioContext();
        if (!ctx || !masterGain) return;
        const now = ctx.currentTime;

        // Mechanical switch snap
        this.playTone(180, 0.025, 'triangle', 0.2, 0.001);
        this.playTone(95, 0.04, 'sine', 0.16, 0.001, 0.012);

        if (powered) {
          // Sweet gentle CRT warm-up hum & ascending harmonic
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(140, now + 0.03);
          osc.frequency.exponentialRampToValueAtTime(360, now + 0.28);
          gain.gain.setValueAtTime(0.001, now + 0.03);
          gain.gain.linearRampToValueAtTime(0.09, now + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.00001, now + 0.32);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(now + 0.03);
          osc.stop(now + 0.34);
        } else {
          // CRT power-down soft collapse sweep
          this.playSweep(300, 45, 0.24, 'sine', 0.10);
        }
      } catch (_) {}
    },

    // Menu game selection chime (cheerful ascending 3-note arpeggio)
    menuSelect() {
      this.playTone(523.25, 0.05, 'triangle', 0.12, 0.001, 0.00); // C5
      this.playTone(659.25, 0.05, 'triangle', 0.13, 0.001, 0.045); // E5
      this.playTone(783.99, 0.08, 'triangle', 0.14, 0.001, 0.09); // G5
    },

    // Menu exit / back
    menuBack() {
      this.playTone(587.33, 0.04, 'sine', 0.11, 0.001, 0.00); // D5
      this.playTone(440.00, 0.06, 'sine', 0.11, 0.001, 0.035); // A4
    },

    // Snake direction steering micro-tick
    snakeTurn() {
      this.playTone(680, 0.015, 'sine', 0.05, 0.001);
    },

    // Snake pellet eat (sweet coin chime)
    snakeEat() {
      this.playTone(880.00, 0.05, 'triangle', 0.14, 0.001, 0.00); // A5
      this.playTone(1318.51, 0.10, 'sine', 0.16, 0.001, 0.04); // E6
    },

    // Soft retro game over cue
    gameOver() {
      this.playTone(392.00, 0.07, 'triangle', 0.12, 0.001, 0.00); // G4
      this.playTone(349.23, 0.07, 'triangle', 0.12, 0.001, 0.07); // F4
      this.playTone(293.66, 0.14, 'sine', 0.12, 0.001, 0.14); // D4
    },

    // Pong paddle bounce
    pongPaddle() {
      this.playTone(520, 0.035, 'triangle', 0.13);
    },

    // Pong wall bounce
    pongWall() {
      this.playTone(340, 0.025, 'sine', 0.08);
    },

    // Pong point scored
    pongScore(isPlayer) {
      if (isPlayer) {
        this.playTone(659.25, 0.06, 'triangle', 0.13, 0.001, 0.00);
        this.playTone(880.00, 0.11, 'triangle', 0.15, 0.001, 0.05);
      } else {
        this.playTone(220, 0.08, 'triangle', 0.11);
      }
    },

    // Defender laser pew
    defenderLaser() {
      this.playSweep(920, 240, 0.05, 'triangle', 0.11);
    },

    // Defender alien pop
    defenderExplosion() {
      this.playSweep(260, 60, 0.08, 'sawtooth', 0.12);
      this.playTone(160, 0.06, 'triangle', 0.10, 0.001, 0.02);
    },

    // Sector victory fanfare
    defenderVictory() {
      this.playTone(523.25, 0.06, 'triangle', 0.13, 0.001, 0.00);
      this.playTone(659.25, 0.06, 'triangle', 0.13, 0.001, 0.05);
      this.playTone(783.99, 0.06, 'triangle', 0.13, 0.001, 0.10);
      this.playTone(1046.50, 0.14, 'triangle', 0.15, 0.001, 0.15);
    },

    // Palette change
    paletteChange() {
      this.playTone(1046.50, 0.03, 'sine', 0.09);
    }
  };

  // ---------------------------------------------------------------------------
  // 2. GAME LOGIC IMPLEMENTATIONS
  // ---------------------------------------------------------------------------

  // --- A. SNAKE.EXE ---
  const snakeGame = {
    gridW: 24,
    gridH: 18,
    cellW: 22,
    cellH: 20,
    offsetX: 56,
    offsetY: 65,
    snake: [],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    food: { x: 12, y: 9 },
    score: 0,
    highScore: parseInt(localStorage.getItem('tv_snake_highscore') || '0', 10),
    gameOver: false,
    moveInterval: 10, // Relaxed, easy-going speed
    tickCounter: 0,

    reset() {
      this.snake = [
        { x: 8, y: 9 },
        { x: 7, y: 9 }
      ];
      this.direction = { x: 1, y: 0 };
      this.nextDirection = { x: 1, y: 0 };
      this.score = 0;
      this.gameOver = false;
      this.tickCounter = 0;
      this.spawnFood();
    },

    spawnFood() {
      let valid = false;
      while (!valid) {
        this.food = {
          x: Math.floor(Math.random() * this.gridW),
          y: Math.floor(Math.random() * this.gridH)
        };
        valid = !this.snake.some(s => s.x === this.food.x && s.y === this.food.y);
      }
    },

    handleInput(key) {
      if (this.gameOver) {
        if (key === ' ' || key === 'Enter' || key === '1') {
          sfx.menuSelect();
          this.reset();
        }
        return;
      }
      const prevX = this.nextDirection.x;
      const prevY = this.nextDirection.y;
      if ((key === 'ArrowUp' || key === 'w' || key === 'W') && this.direction.y === 0) {
        this.nextDirection = { x: 0, y: -1 };
      } else if ((key === 'ArrowDown' || key === 's' || key === 'S') && this.direction.y === 0) {
        this.nextDirection = { x: 0, y: 1 };
      } else if ((key === 'ArrowLeft' || key === 'a' || key === 'A') && this.direction.x === 0) {
        this.nextDirection = { x: -1, y: 0 };
      } else if ((key === 'ArrowRight' || key === 'd' || key === 'D') && this.direction.x === 0) {
        this.nextDirection = { x: 1, y: 0 };
      }
      if (prevX !== this.nextDirection.x || prevY !== this.nextDirection.y) {
        sfx.snakeTurn();
      }
    },

    update() {
      if (this.gameOver) return;
      this.tickCounter++;
      if (this.tickCounter < this.moveInterval) return;
      this.tickCounter = 0;

      this.direction = this.nextDirection;
      const head = {
        x: this.snake[0].x + this.direction.x,
        y: this.snake[0].y + this.direction.y
      };

      // Edge wrap-around: pass through edge and appear on opposite side
      if (head.x < 0) head.x = this.gridW - 1;
      else if (head.x >= this.gridW) head.x = 0;
      if (head.y < 0) head.y = this.gridH - 1;
      else if (head.y >= this.gridH) head.y = 0;

      // Self collision
      if (this.snake.some(s => s.x === head.x && s.y === head.y)) {
        this.gameOver = true;
        sfx.gameOver();
        if (this.score > this.highScore) {
          this.highScore = this.score;
          localStorage.setItem('tv_snake_highscore', this.highScore.toString());
        }
        return;
      }

      this.snake.unshift(head);

      // Check food
      if (head.x === this.food.x && head.y === this.food.y) {
        this.score += 10;
        sfx.snakeEat();
        this.spawnFood();
      } else {
        this.snake.pop();
      }
    },

    draw() {
      // Header
      ctx.fillStyle = colors.dim;
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.fillText(`SCORE: ${this.score.toString().padStart(4, '0')}    HIGH: ${this.highScore.toString().padStart(4, '0')}    [ESC] MENU`, 56, 42);

      // Grid boundary (dashed to indicate wrap-around edges)
      ctx.strokeStyle = colors.dim;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(this.offsetX - 2, this.offsetY - 2, this.gridW * this.cellW + 4, this.gridH * this.cellH + 4);
      ctx.setLineDash([]);

      // Food
      ctx.fillStyle = colors.bright;
      ctx.font = '16px "JetBrains Mono", monospace';
      ctx.fillText('@', this.offsetX + this.food.x * this.cellW + 4, this.offsetY + this.food.y * this.cellH + 15);

      // Snake body
      this.snake.forEach((seg, i) => {
        if (i === 0) {
          ctx.fillStyle = colors.bright;
          ctx.fillRect(this.offsetX + seg.x * this.cellW + 2, this.offsetY + seg.y * this.cellH + 2, this.cellW - 4, this.cellH - 4);
        } else {
          ctx.fillStyle = colors.primary;
          ctx.fillRect(this.offsetX + seg.x * this.cellW + 3, this.offsetY + seg.y * this.cellH + 3, this.cellW - 6, this.cellH - 6);
        }
      });

      // Game Over overlay
      if (this.gameOver) {
        ctx.fillStyle = 'rgba(12, 13, 16, 0.88)';
        ctx.fillRect(this.offsetX + 40, this.offsetY + 90, this.gridW * this.cellW - 80, 160);
        ctx.strokeStyle = colors.primary;
        ctx.strokeRect(this.offsetX + 40, this.offsetY + 90, this.gridW * this.cellW - 80, 160);

        ctx.fillStyle = colors.bright;
        ctx.font = 'bold 20px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CRASH DETECTED', SCREEN_WIDTH / 2, this.offsetY + 140);

        ctx.fillStyle = colors.primary;
        ctx.font = '14px "JetBrains Mono", monospace';
        ctx.fillText(`FINAL SCORE: ${this.score}`, SCREEN_WIDTH / 2, this.offsetY + 175);
        ctx.fillText('PRESS [SPACE] TO RETRY  |  [ESC] MENU', SCREEN_WIDTH / 2, this.offsetY + 215);
        ctx.textAlign = 'left';
      }
    }
  };

  // --- B. PONG.EXE ---
  const pongGame = {
    paddleW: 10,
    playerPaddleH: 90, // Big, forgiving player paddle
    cpuPaddleH: 55,
    playerY: 195,
    cpuY: 210,
    ballX: 320,
    ballY: 240,
    ballSpeedX: 3.2,
    ballSpeedY: 2.0,
    playerScore: 0,
    cpuScore: 0,
    maxScore: 3, // Quick 3-point victory
    gameOver: false,
    winner: '',

    reset() {
      this.playerY = 195;
      this.cpuY = 210;
      this.playerScore = 0;
      this.cpuScore = 0;
      this.gameOver = false;
      this.resetBall(1);
    },

    resetBall(dir = 1) {
      this.ballX = 320;
      this.ballY = 240;
      this.ballSpeedX = (3.0 + Math.random() * 0.8) * dir;
      this.ballSpeedY = (Math.random() * 3 - 1.5);
    },

    handleInput(key) {
      if (this.gameOver) {
        if (key === ' ' || key === 'Enter' || key === '2') {
          sfx.menuSelect();
          this.reset();
        }
        return;
      }
      const speed = 28;
      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        this.playerY = Math.max(60, this.playerY - speed);
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        this.playerY = Math.min(420 - this.playerPaddleH, this.playerY + speed);
      }
    },

    update() {
      if (this.gameOver) return;

      // Ball motion
      this.ballX += this.ballSpeedX;
      this.ballY += this.ballSpeedY;

      // Top & bottom bounce
      if (this.ballY <= 60 || this.ballY >= 420) {
        this.ballSpeedY *= -1;
        sfx.pongWall();
      }

      // CPU AI tracking (easy: slow and imperfect)
      const cpuCenter = this.cpuY + this.cpuPaddleH / 2;
      if (cpuCenter < this.ballY - 14) {
        this.cpuY = Math.min(420 - this.cpuPaddleH, this.cpuY + 1.8);
      } else if (cpuCenter > this.ballY + 14) {
        this.cpuY = Math.max(60, this.cpuY - 1.8);
      }

      // Player paddle collision
      if (
        this.ballX <= 75 + this.paddleW &&
        this.ballX >= 70 &&
        this.ballY >= this.playerY &&
        this.ballY <= this.playerY + this.playerPaddleH
      ) {
        this.ballSpeedX = Math.abs(this.ballSpeedX) * 1.02;
        const delta = (this.ballY - (this.playerY + this.playerPaddleH / 2)) / (this.playerPaddleH / 2);
        this.ballSpeedY = delta * 4;
        sfx.pongPaddle();
      }

      // CPU paddle collision
      if (
        this.ballX >= 565 - this.paddleW &&
        this.ballX <= 570 &&
        this.ballY >= this.cpuY &&
        this.ballY <= this.cpuY + this.cpuPaddleH
      ) {
        this.ballSpeedX = -Math.abs(this.ballSpeedX) * 1.02;
        const delta = (this.ballY - (this.cpuY + this.cpuPaddleH / 2)) / (this.cpuPaddleH / 2);
        this.ballSpeedY = delta * 4;
        sfx.pongPaddle();
      }

      // Score checking
      if (this.ballX < 40) {
        this.cpuScore++;
        if (this.cpuScore >= this.maxScore) {
          this.gameOver = true;
          this.winner = 'CPU WINS';
          sfx.gameOver();
        } else {
          sfx.pongScore(false);
          this.resetBall(1);
        }
      } else if (this.ballX > 600) {
        this.playerScore++;
        if (this.playerScore >= this.maxScore) {
          this.gameOver = true;
          this.winner = 'PLAYER WINS!';
          sfx.defenderVictory();
        } else {
          sfx.pongScore(true);
          this.resetBall(-1);
        }
      }
    },

    draw() {
      // Header & Score
      ctx.fillStyle = colors.dim;
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.fillText('[ESC] MENU    FIRST TO 3 POINTS', 56, 42);

      ctx.fillStyle = colors.bright;
      ctx.font = 'bold 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${this.playerScore}   :   ${this.cpuScore}`, 320, 42);
      ctx.textAlign = 'left';

      // Arena borders
      ctx.strokeStyle = colors.dim;
      ctx.lineWidth = 1;
      ctx.strokeRect(56, 55, 528, 370);

      // Center dashed line
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(320, 55);
      ctx.lineTo(320, 425);
      ctx.stroke();
      ctx.setLineDash([]);

      // Paddles
      ctx.fillStyle = colors.primary;
      ctx.fillRect(65, this.playerY, this.paddleW, this.playerPaddleH);
      ctx.fillRect(565, this.cpuY, this.paddleW, this.cpuPaddleH);

      // Ball
      ctx.fillStyle = colors.bright;
      ctx.fillRect(this.ballX - 4, this.ballY - 4, 8, 8);

      // Game Over dialog
      if (this.gameOver) {
        ctx.fillStyle = 'rgba(12, 13, 16, 0.9)';
        ctx.fillRect(160, 160, 320, 140);
        ctx.strokeStyle = colors.primary;
        ctx.strokeRect(160, 160, 320, 140);

        ctx.fillStyle = colors.bright;
        ctx.font = 'bold 20px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.winner, 320, 215);

        ctx.fillStyle = colors.primary;
        ctx.font = '14px "JetBrains Mono", monospace';
        ctx.fillText('PRESS [SPACE] TO REPLAY  |  [ESC] MENU', 320, 260);
        ctx.textAlign = 'left';
      }
    }
  };

  // --- C. DEFENDER.EXE (Space Invaders / Arcade Shooter) ---
  const defenderGame = {
    playerX: 320,
    playerY: 400,
    bullets: [],
    aliens: [],
    alienBullets: [],
    alienDir: 1,
    alienSpeed: 1,
    score: 0,
    gameOver: false,
    victory: false,

    reset() {
      this.playerX = 320;
      this.bullets = [];
      this.alienBullets = [];
      this.aliens = [];
      this.alienDir = 1;
      this.alienSpeed = 0.6; // Relaxed alien speed
      this.score = 0;
      this.gameOver = false;
      this.victory = false;

      // Spawn 3 rows of 6 aliens (roomy layout)
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 6; c++) {
          this.aliens.push({
            x: 130 + c * 64,
            y: 90 + r * 38,
            alive: true
          });
        }
      }
    },

    handleInput(key) {
      if (this.gameOver || this.victory) {
        if (key === ' ' || key === 'Enter' || key === '3') {
          sfx.menuSelect();
          this.reset();
        }
        return;
      }
      const speed = 24;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        this.playerX = Math.max(80, this.playerX - speed);
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        this.playerX = Math.min(560, this.playerX + speed);
      } else if (key === ' ' || key === 'ArrowUp' || key === 'w' || key === 'W') {
        if (this.bullets.length < 4) {
          this.bullets.push({ x: this.playerX, y: this.playerY - 14 });
          sfx.defenderLaser();
        }
      }
    },

    update() {
      if (this.gameOver || this.victory) return;

      // Update player bullets (fast and responsive)
      this.bullets.forEach(b => b.y -= 10);
      this.bullets = this.bullets.filter(b => b.y > 60);

      // Move aliens horizontally (slow and steady)
      let changeDir = false;
      this.aliens.forEach(a => {
        if (!a.alive) return;
        a.x += this.alienDir * this.alienSpeed;
        if (a.x < 70 || a.x > 570) {
          changeDir = true;
        }
      });

      if (changeDir) {
        this.alienDir *= -1;
        this.aliens.forEach(a => {
          if (a.alive) {
            a.y += 6; // Very slow descend
            if (a.y >= this.playerY - 15) {
              if (!this.gameOver) {
                this.gameOver = true;
                sfx.gameOver();
              }
            }
          }
        });
      }

      // Check bullet vs alien collision (generous hitbox)
      this.bullets.forEach(b => {
        this.aliens.forEach(a => {
          if (a.alive && Math.abs(b.x - a.x) < 26 && Math.abs(b.y - a.y) < 18) {
            a.alive = false;
            b.y = -999;
            this.score += 20;
            sfx.defenderExplosion();
          }
        });
      });

      // Aliens shooting (very rare, easy to avoid)
      if (Math.random() < 0.007) {
        const liveAliens = this.aliens.filter(a => a.alive);
        if (liveAliens.length > 0) {
          const shooter = liveAliens[Math.floor(Math.random() * liveAliens.length)];
          this.alienBullets.push({ x: shooter.x, y: shooter.y + 10 });
        }
      }

      // Update alien bullets (slow pace)
      this.alienBullets.forEach(ab => {
        ab.y += 2.0;
        if (Math.abs(ab.x - this.playerX) < 16 && Math.abs(ab.y - this.playerY) < 12) {
          if (!this.gameOver) {
            this.gameOver = true;
            sfx.gameOver();
          }
        }
      });
      this.alienBullets = this.alienBullets.filter(ab => ab.y < 420);

      // Check victory
      if (this.aliens.every(a => !a.alive) && !this.victory) {
        this.victory = true;
        sfx.defenderVictory();
      }
    },

    draw() {
      // Header
      ctx.fillStyle = colors.dim;
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.fillText(`SCORE: ${this.score.toString().padStart(4, '0')}    [ESC] MENU    [SPACE] SHOOT`, 56, 42);

      // Arena boundary
      ctx.strokeStyle = colors.dim;
      ctx.lineWidth = 1;
      ctx.strokeRect(56, 55, 528, 370);

      // Aliens
      this.aliens.forEach(a => {
        if (!a.alive) return;
        ctx.fillStyle = colors.primary;
        ctx.font = 'bold 16px "JetBrains Mono", monospace';
        ctx.fillText('[#]', a.x - 12, a.y);
      });

      // Alien Bullets
      ctx.fillStyle = colors.bright;
      this.alienBullets.forEach(ab => {
        ctx.fillRect(ab.x - 1, ab.y, 3, 6);
      });

      // Player Ship
      ctx.fillStyle = colors.bright;
      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.fillText('<^>', this.playerX - 14, this.playerY);

      // Player Bullets
      ctx.fillStyle = colors.primary;
      this.bullets.forEach(b => {
        ctx.fillRect(b.x - 1, b.y, 2, 8);
      });

      // Game Over / Victory dialog
      if (this.gameOver || this.victory) {
        ctx.fillStyle = 'rgba(12, 13, 16, 0.9)';
        ctx.fillRect(160, 160, 320, 140);
        ctx.strokeStyle = colors.primary;
        ctx.strokeRect(160, 160, 320, 140);

        ctx.fillStyle = colors.bright;
        ctx.font = 'bold 20px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(this.victory ? 'SECTOR DEFENDED!' : 'DEFENSE FAILED', 320, 215);

        ctx.fillStyle = colors.primary;
        ctx.font = '14px "JetBrains Mono", monospace';
        ctx.fillText(`SCORE: ${this.score}  |  PRESS [SPACE] RETRY`, 320, 255);
        ctx.textAlign = 'left';
      }
    }
  };

  // --- D. MATRIX.EXE (Phosphor Digital Rain) ---
  const matrixGame = {
    cols: 38,
    drops: [],
    chars: '0123456789ABCDEF<>*#$+=%@&{}[]:;~',

    init() {
      this.drops = [];
      for (let i = 0; i < this.cols; i++) {
        this.drops[i] = Math.floor(Math.random() * -30);
      }
    },

    handleInput(key) {
      // Matrix stream just cycles, any key returns to menu if Esc
    },

    update() {
      for (let i = 0; i < this.cols; i++) {
        this.drops[i]++;
        if (this.drops[i] * 16 > SCREEN_HEIGHT - 60 && Math.random() > 0.97) {
          this.drops[i] = 0;
        }
      }
    },

    draw() {
      ctx.fillStyle = 'rgba(12, 13, 16, 0.2)';
      ctx.fillRect(56, 55, 528, 370);

      // Arena boundary
      ctx.strokeStyle = colors.dim;
      ctx.lineWidth = 1;
      ctx.strokeRect(56, 55, 528, 370);

      ctx.fillStyle = colors.dim;
      ctx.font = '14px "JetBrains Mono", monospace';
      ctx.fillText('[ESC] EXIT STREAM    SIGNAL: 9600 BAUD DUMP', 56, 42);

      ctx.font = '14px "JetBrains Mono", monospace';
      for (let i = 0; i < this.cols; i++) {
        const char = this.chars[Math.floor(Math.random() * this.chars.length)];
        const x = 65 + i * 14;
        const y = 75 + this.drops[i] * 16;

        if (y >= 65 && y <= 420) {
          ctx.fillStyle = colors.bright;
          ctx.fillText(char, x, y);
          ctx.fillStyle = colors.primary;
          ctx.fillText(this.chars[Math.floor(Math.random() * this.chars.length)], x, y - 16);
        }
      }
    }
  };

  // --- E. OS MENU ---
  function drawMenu() {
    ctx.fillStyle = colors.primary;
    ctx.font = '12px "JetBrains Mono", monospace';

    // Banner box
    ctx.strokeStyle = colors.primary;
    ctx.lineWidth = 1;
    ctx.strokeRect(56, 45, 528, 64);

    ctx.fillStyle = colors.bright;
    ctx.font = 'bold 15px "JetBrains Mono", monospace';
    ctx.fillText('VT-400 TERMINAL OS // RETRO ARCADE', 76, 72);

    ctx.fillStyle = colors.dim;
    ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText('STANDALONE RETRO GAME CONSOLE - PRESS [1-4] TO RUN', 76, 94);

    // Channel list
    const items = [
      { num: '1', name: 'SNAKE.EXE', desc: 'Classic grid serpent & pellet tracker' },
      { num: '2', name: 'PONG.EXE', desc: 'Player vs heuristic CPU paddle duel' },
      { num: '3', name: 'DEFENDER.EXE', desc: 'Retro vector space interceptor' },
      { num: '4', name: 'MATRIX.EXE', desc: 'Realtime phosphor stream generator' }
    ];

    items.forEach((item, index) => {
      const y = 145 + index * 54;

      ctx.fillStyle = colors.dim;
      ctx.fillRect(76, y - 2, 488, 42);
      ctx.strokeStyle = colors.dim;
      ctx.strokeRect(76, y - 2, 488, 42);

      ctx.fillStyle = colors.bright;
      ctx.font = 'bold 14px "JetBrains Mono", monospace';
      ctx.fillText(`[${item.num}] ${item.name}`, 92, y + 24);

      ctx.fillStyle = colors.primary;
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillText(`— ${item.desc}`, 260, y + 24);
    });

    // Prompt line at bottom
    ctx.fillStyle = colors.primary;
    ctx.font = '13px "JetBrains Mono", monospace';
    ctx.fillText('guest@arcade-tv:~$ run_game --select [1-4]', 76, 395);
    if (blinkState) {
      ctx.fillRect(416, 382, 8, 16);
    }

    ctx.fillStyle = colors.dim;
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText('CONTROLS: ARROWS/WASD TO MOVE | SPACE FOR ACTION | ESC FOR MENU', 76, 425);
  }

  // --- F. TV Power / CRT Off State ---
  function drawPoweredOff() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Collapse line animation
    if (powerTransitioning && powerAnimationProgress > 0) {
      ctx.fillStyle = '#FFFFFF';
      const h = Math.max(2, 480 * powerAnimationProgress * 0.1);
      const w = 640 * powerAnimationProgress;
      ctx.fillRect((640 - w) / 2, (480 - h) / 2, w, h);
    }
  }

  // Master Render onto 2D Canvas
  function renderScreen() {
    tick++;
    if (tick % 30 === 0) blinkState = !blinkState;

    if (!isPoweredOn) {
      drawPoweredOff();
      return;
    }

    // Clear background
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    // Render active state
    if (tvState === 'MENU') {
      drawMenu();
    } else if (tvState === 'SNAKE') {
      snakeGame.update();
      snakeGame.draw();
    } else if (tvState === 'PONG') {
      pongGame.update();
      pongGame.draw();
    } else if (tvState === 'DEFENDER') {
      defenderGame.update();
      defenderGame.draw();
    } else if (tvState === 'MATRIX') {
      matrixGame.update();
      matrixGame.draw();
    }

    // CRT Scanlines overlay
    ctx.fillStyle = colors.scanline;
    for (let y = 0; y < SCREEN_HEIGHT; y += 3) {
      ctx.fillRect(0, y, SCREEN_WIDTH, 1);
    }

    // CRT Bezel vignette shadow
    const grad = ctx.createRadialGradient(
      SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_WIDTH * 0.35,
      SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SCREEN_WIDTH * 0.55
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  }

  // ---------------------------------------------------------------------------
  // 3. THREE.JS RETRO CRT TV (MATCHING USER REFERENCE IMAGE)
  // ---------------------------------------------------------------------------
  let scene, camera, renderer, tvGroup;
  let screenMesh, screenTexture, screenGlow, ledLight;
  let powerLedMesh;
  let isUsingThree = true;
  let raycaster, mouseVec;
  if (typeof THREE !== 'undefined') {
    raycaster = new THREE.Raycaster();
    mouseVec = new THREE.Vector2();
  }

  // 3D Animated Toggle Switch State (Single ON/OFF switch)
  const toggleState = {
    currentRotX: 0.35, // UP (ON)
    targetRotX: 0.35,
    leverMesh: null
  };
  let hoveredObject = null;
  const interactiveObjects = [];

  function getStageDimensions() {
    const w = container.clientWidth || 960;
    const h = container.clientHeight || 680;
    return { w, h };
  }

  function fitCameraToTV() {
    if (!camera || !renderer || !container) return;
    const { w, h } = getStageDimensions();
    const aspect = w / h;
    camera.aspect = aspect;

    // Compact square box TV model bounding dimensions (chin removed):
    // 3.26 width x 2.70 height (with feet and shadow)
    // Centered at Y = -0.04
    const targetHeight = 3.3;
    const targetWidth = 3.8;

    const vFovRad = (camera.fov / 2) * (Math.PI / 180);
    const distForHeight = (targetHeight / 2) / Math.tan(vFovRad);
    const distForWidth = (targetWidth / 2) / (Math.tan(vFovRad) * aspect);

    // Camera distance to guarantee 100% full uncropped visibility
    const targetDist = Math.max(distForHeight, distForWidth, 5.2);

    camera.position.set(0, -0.04, targetDist);
    camera.lookAt(0, -0.04, 0);
    camera.updateProjectionMatrix();

    renderer.setSize(w, h);
  }

  function initThreeScene() {
    if (typeof THREE === 'undefined') {
      isUsingThree = false;
      screenCanvas.style.width = '100%';
      screenCanvas.style.height = 'auto';
      screenCanvas.style.maxHeight = '460px';
      screenCanvas.style.display = 'block';
      screenCanvas.style.objectFit = 'contain';
      container.appendChild(screenCanvas);
      return;
    }

    const { w, h } = getStageDimensions();

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    fitCameraToTV();

    // Dynamic Canvas Texture for TV Screen
    screenTexture = new THREE.CanvasTexture(screenCanvas);
    screenTexture.minFilter = THREE.LinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;

    // Master TV group
    tvGroup = new THREE.Group();
    scene.add(tvGroup);

    // -------------------------------------------------------------------------
    // MATERIALS PALETTE (Accurately matching reference image)
    // -------------------------------------------------------------------------
    const tvCaseMat = new THREE.MeshStandardMaterial({
      color: 0x1E2025,
      roughness: 0.65,
      metalness: 0.15
    });

    const tvDarkTrimMat = new THREE.MeshStandardMaterial({
      color: 0x121316,
      roughness: 0.8,
      metalness: 0.1
    });

    const tvBezelMat = new THREE.MeshStandardMaterial({
      color: 0x0E0F12,
      roughness: 0.85,
      metalness: 0.08
    });

    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xD0D4DC,
      roughness: 0.22,
      metalness: 0.92
    });

    // 1. COMPACT CRT MONITOR CABINET (Screen-focused housing without bottom chin)
    const cabinetWidth = 3.2;
    const cabinetHeight = 2.56;
    const cabinetDepth = 1.3;

    // Main box body
    const mainBody = new THREE.Mesh(
      new THREE.BoxGeometry(cabinetWidth, cabinetHeight, cabinetDepth),
      tvCaseMat
    );
    mainBody.position.set(0, 0, 0);
    tvGroup.add(mainBody);

    // Front square beveled rim
    const rimOuter = new THREE.Mesh(
      new THREE.BoxGeometry(cabinetWidth + 0.06, cabinetHeight + 0.06, 0.12),
      tvDarkTrimMat
    );
    rimOuter.position.set(0, 0, cabinetDepth / 2 + 0.01);
    tvGroup.add(rimOuter);

    // Top cooling vent slats
    const ventMat = new THREE.MeshBasicMaterial({ color: 0x0A0B0E });
    for (let i = 0; i < 5; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.025, 0.09), ventMat);
      slat.position.set(0, cabinetHeight / 2 + 0.012, -0.32 + i * 0.16);
      tvGroup.add(slat);
    }

    // 2. INNER RECESSED BEZEL FRAMING THE CRT SCREEN
    const innerBezel = new THREE.Mesh(
      new THREE.BoxGeometry(2.92, 2.06, 0.1),
      tvBezelMat
    );
    innerBezel.position.set(0, 0.12, cabinetDepth / 2 + 0.03);
    tvGroup.add(innerBezel);

    // 3. CURVED CRT GLASS SCREEN (Centered in upper display area)
    const screenW = 2.7;
    const screenH = 1.88;
    const screenGeo = new THREE.PlaneGeometry(screenW, screenH, 20, 20);
    const pos = screenGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const r2 = (x / (screenW / 2)) ** 2 + (y / (screenH / 2)) ** 2;
      pos.setZ(i, Math.max(0, (1 - r2 * 0.36) * 0.14));
    }
    screenGeo.computeVertexNormals();

    const screenMat = new THREE.MeshBasicMaterial({
      map: screenTexture,
      toneMapped: false
    });
    screenMesh = new THREE.Mesh(screenGeo, screenMat);
    screenMesh.position.set(0, 0.12, cabinetDepth / 2 + 0.07);
    screenMesh.userData = { action: 'screen', name: 'CRT Display' };
    tvGroup.add(screenMesh);
    interactiveObjects.push(screenMesh);

    // Glass reflection sheen overlay
    const sheenMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending
    });
    const sheenMesh = new THREE.Mesh(screenGeo, sheenMat);
    sheenMesh.position.set(0, 0.12, cabinetDepth / 2 + 0.09);
    tvGroup.add(sheenMesh);

    // -------------------------------------------------------------------------
    // 4. SLIM LOWER BEZEL (Single ON/OFF Toggle Switch & Power LED)
    // -------------------------------------------------------------------------
    const switchY = -1.10;
    const switchZ = cabinetDepth / 2 + 0.03;

    // Left side of bottom bezel: Minimalist model stamp
    const stampCanvas = document.createElement('canvas');
    stampCanvas.width = 256;
    stampCanvas.height = 64;
    const stCtx = stampCanvas.getContext('2d');
    stCtx.fillStyle = '#5A5D68';
    stCtx.font = 'bold 22px "JetBrains Mono", monospace';
    stCtx.fillText('VT-400 MONITOR', 12, 40);
    const stampTex = new THREE.CanvasTexture(stampCanvas);
    const stampMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 0.16),
      new THREE.MeshBasicMaterial({ map: stampTex, transparent: true })
    );
    stampMesh.position.set(-0.85, switchY, switchZ + 0.01);
    tvGroup.add(stampMesh);

    // Right side of bottom bezel: Single Physical ON / OFF Toggle Switch
    const toggleGroup = new THREE.Group();
    const toggleX = 0.88;
    toggleGroup.position.set(toggleX, switchY, switchZ + 0.01);

    // Chrome switch base collar
    const collarMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.085, 0.095, 0.035, 16),
      chromeMat
    );
    collarMesh.rotation.x = Math.PI / 2;
    collarMesh.position.set(0, 0, 0.02);
    toggleGroup.add(collarMesh);

    // Pivoting toggle bat handle
    const leverGroup = new THREE.Group();
    leverGroup.position.set(0, 0, 0.035);

    // Pivot ball
    const pivotBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.042, 16, 16),
      chromeMat
    );
    leverGroup.add(pivotBall);

    // Bat handle
    const batGeo = new THREE.CylinderGeometry(0.022, 0.038, 0.16, 16);
    batGeo.translate(0, 0.08, 0);
    const batMesh = new THREE.Mesh(batGeo, chromeMat);
    leverGroup.add(batMesh);

    // Bat rounded cap
    const tipMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.024, 12, 12),
      chromeMat
    );
    tipMesh.position.set(0, 0.16, 0);
    leverGroup.add(tipMesh);

    // Initial toggle angle: UP (0.35 rad) = ON
    leverGroup.rotation.x = 0.35;
    toggleState.leverMesh = leverGroup;
    toggleGroup.add(leverGroup);

    // Hitbox for clicking the toggle switch
    const toggleHitbox = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.36, 0.25),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    toggleHitbox.position.set(0, 0, 0.08);
    toggleHitbox.userData = { action: 'power', name: 'Power Toggle Switch' };
    toggleGroup.add(toggleHitbox);
    interactiveObjects.push(toggleHitbox);

    tvGroup.add(toggleGroup);

    // Switch Label Plate (ON ▲ / ▼ OFF)
    const switchLabelCanvas = document.createElement('canvas');
    switchLabelCanvas.width = 128;
    switchLabelCanvas.height = 256;
    const slCtx = switchLabelCanvas.getContext('2d');
    slCtx.fillStyle = '#E8A33D';
    slCtx.font = 'bold 28px "JetBrains Mono", monospace';
    slCtx.textAlign = 'center';
    slCtx.fillText('ON', 64, 42);
    slCtx.fillStyle = '#7A808C';
    slCtx.fillText('▲', 64, 78);
    slCtx.fillText('▼', 64, 192);
    slCtx.fillStyle = '#6E727C';
    slCtx.fillText('OFF', 64, 234);

    const switchLabelTex = new THREE.CanvasTexture(switchLabelCanvas);
    const switchLabelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.24, 0.38),
      new THREE.MeshBasicMaterial({ map: switchLabelTex, transparent: true })
    );
    switchLabelMesh.position.set(toggleX + 0.22, switchY, switchZ + 0.015);
    tvGroup.add(switchLabelMesh);

    // Power Indicator LED Jewel
    const ledGeo = new THREE.SphereGeometry(0.034, 16, 16);
    const ledMat = new THREE.MeshStandardMaterial({
      color: 0x38D668,
      emissive: 0x38D668,
      emissiveIntensity: 1.2,
      roughness: 0.2
    });
    powerLedMesh = new THREE.Mesh(ledGeo, ledMat);
    powerLedMesh.position.set(toggleX - 0.22, switchY, switchZ + 0.015);
    tvGroup.add(powerLedMesh);

    ledLight = new THREE.PointLight(0x38D668, 0.35, 0.6);
    ledLight.position.set(toggleX - 0.22, switchY, switchZ + 0.06);
    tvGroup.add(ledLight);

    // -------------------------------------------------------------------------
    // 5. BASE RUBBER FEET & GROUND CONTACT SHADOW
    // -------------------------------------------------------------------------
    const footMat = new THREE.MeshStandardMaterial({ color: 0x0E0F12, roughness: 0.95 });
    const footPositions = [
      [-1.25, -1.33, 0.42],
      [1.25, -1.33, 0.42],
      [-1.25, -1.33, -0.42],
      [1.25, -1.33, -0.42]
    ];
    footPositions.forEach(([fx, fy, fz]) => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.3), footMat);
      foot.position.set(fx, fy, fz);
      tvGroup.add(foot);
    });

    // Soft Ground Ambient Occlusion Shadow
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    const sGrad = sCtx.createRadialGradient(64, 64, 12, 64, 64, 60);
    sGrad.addColorStop(0, 'rgba(0, 0, 0, 0.76)');
    sGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.38)');
    sGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 128, 128);

    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const groundShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4.2, 2.4),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.85 })
    );
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.set(0, -1.39, 0);
    tvGroup.add(groundShadow);

    // -------------------------------------------------------------------------
    // 6. STUDIO LIGHTING RIG
    // -------------------------------------------------------------------------
    const ambientLight = new THREE.AmbientLight(0xE0DDD8, 0.75);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xFFF4E5, 0.95);
    keyLight.position.set(4, 6, 6);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9EABC0, 0.55);
    rimLight.position.set(-5, 4, -4);
    scene.add(rimLight);

    // Dynamic phosphor screen glow onto bezel
    screenGlow = new THREE.PointLight(0xE8A33D, 0.55, 3.8);
    screenGlow.position.set(0, 0.12, 1.2);
    scene.add(screenGlow);

    // Window Resize Handler & ResizeObserver
    window.addEventListener('resize', fitCameraToTV);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        fitCameraToTV();
      });
      ro.observe(container);
    }
  }

  // ---------------------------------------------------------------------------
  // 4. MOUSE TILT, RAYCASTER HOVER & PHYSICAL PUSH BUTTONS
  // ---------------------------------------------------------------------------
  let targetRotY = 0;
  let targetRotX = 0;

  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    targetRotY = nx * 0.12;
    targetRotX = -ny * 0.08;

    if (isUsingThree && raycaster && camera) {
      mouseVec.set(nx, ny);
      raycaster.setFromCamera(mouseVec, camera);
      const intersects = raycaster.intersectObjects(interactiveObjects);

      if (intersects.length > 0) {
        const hitObj = intersects[0].object;
        if (hoveredObject !== hitObj) {
          if (hoveredObject && hoveredObject.material && hoveredObject.material.emissive) {
            hoveredObject.material.emissive.setHex(0x000000);
          }
          hoveredObject = hitObj;
          if (hoveredObject.material && hoveredObject.material.emissive && hoveredObject !== powerLedMesh) {
            hoveredObject.material.emissive.setHex(0x222222);
          }
          const cursor = document.querySelector('.terminal-cursor');
          if (cursor) cursor.classList.add('is-hover');
        }
      } else {
        if (hoveredObject) {
          if (hoveredObject.material && hoveredObject.material.emissive && hoveredObject !== powerLedMesh) {
            hoveredObject.material.emissive.setHex(0x000000);
          }
          hoveredObject = null;
          const cursor = document.querySelector('.terminal-cursor');
          if (cursor) cursor.classList.remove('is-hover');
        }
      }
    }
  });

  container.addEventListener('mouseleave', () => {
    targetRotY = 0;
    targetRotX = 0;
    if (hoveredObject) {
      if (hoveredObject.material && hoveredObject.material.emissive && hoveredObject !== powerLedMesh) {
        hoveredObject.material.emissive.setHex(0x000000);
      }
      hoveredObject = null;
    }
    const cursor = document.querySelector('.terminal-cursor');
    if (cursor) cursor.classList.remove('is-hover');
  });

  // Physical tactile button click dispatcher
  container.addEventListener('click', (e) => {
    getAudioContext();

    if (!isUsingThree) {
      if (tvState === 'MENU') launchGame('SNAKE');
      return;
    }

    const rect = container.getBoundingClientRect();
    mouseVec.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseVec.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

    raycaster.setFromCamera(mouseVec, camera);
    const intersects = raycaster.intersectObjects(interactiveObjects);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      const action = hit.userData ? hit.userData.action : null;

      if (action === 'power') {
        togglePower();
      } else if (action === 'screen') {
        if (!isPoweredOn) {
          togglePower();
          return;
        }

        if (tvState === 'MENU') {
          if (intersects[0].uv) {
            const uvY = (1 - intersects[0].uv.y) * SCREEN_HEIGHT;
            if (uvY >= 140 && uvY <= 190) launchGame('SNAKE');
            else if (uvY >= 195 && uvY <= 245) launchGame('PONG');
            else if (uvY >= 250 && uvY <= 300) launchGame('DEFENDER');
            else if (uvY >= 305 && uvY <= 355) launchGame('MATRIX');
            else launchGame('SNAKE');
          } else {
            launchGame('SNAKE');
          }
        } else if (tvState === 'DEFENDER') {
          defenderGame.handleInput(' ');
        }
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 5. INPUT DISPATCHER & CONTROL SCHEMES
  // ---------------------------------------------------------------------------
  function launchGame(name) {
    if (!isPoweredOn) togglePower();
    tvState = name;
    sfx.menuSelect();
    if (name === 'SNAKE') snakeGame.reset();
    if (name === 'PONG') pongGame.reset();
    if (name === 'DEFENDER') defenderGame.reset();
    if (name === 'MATRIX') matrixGame.init();
  }

  const GAME_LIST = ['SNAKE', 'PONG', 'DEFENDER', 'MATRIX'];
  function cycleGame(step) {
    if (!isPoweredOn) togglePower();
    const currIdx = GAME_LIST.indexOf(tvState);
    let nextIdx = (currIdx + step) % GAME_LIST.length;
    if (nextIdx < 0) nextIdx = GAME_LIST.length - 1;
    launchGame(GAME_LIST[nextIdx]);
  }

  function togglePower() {
    isPoweredOn = !isPoweredOn;
    sfx.toggleSwitch(isPoweredOn);
    toggleState.targetRotX = isPoweredOn ? 0.35 : -0.35;

    if (powerLedMesh) {
      powerLedMesh.material.color.setHex(isPoweredOn ? 0x38D668 : 0x220505);
      powerLedMesh.material.emissive.setHex(isPoweredOn ? 0x38D668 : 0x000000);
      powerLedMesh.material.emissiveIntensity = isPoweredOn ? 1.2 : 0;
    }
    if (ledLight) {
      ledLight.intensity = isPoweredOn ? 0.4 : 0;
    }
    if (screenGlow) {
      screenGlow.intensity = isPoweredOn ? 0.55 : 0;
    }
  }

  function togglePalette() {
    sfx.paletteChange();
    const keys = Object.keys(PALETTES);
    const nextIdx = (keys.indexOf(currentPaletteKey) + 1) % keys.length;
    currentPaletteKey = keys[nextIdx];
    colors = PALETTES[currentPaletteKey];

    if (screenGlow) {
      if (currentPaletteKey === 'green') screenGlow.color.setHex(0x38D668);
      else if (currentPaletteKey === 'white') screenGlow.color.setHex(0xFFFFFF);
      else screenGlow.color.setHex(0xE8A33D);
    }
  }

  // Keyboard Event Listener (Game inputs)
  window.addEventListener('keydown', (e) => {
    const rect = container.getBoundingClientRect();
    const isInView = rect.top < window.innerHeight && rect.bottom > 0;
    const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', '1', '2', '3', '4', 'Escape', 'p', 'c', 'P', 'C'];

    if (isInView && gameKeys.includes(e.key)) {
      getAudioContext();

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'Escape') {
        if (tvState !== 'MENU') {
          tvState = 'MENU';
          sfx.menuBack();
        }
        return;
      }
      if (e.key === 'p' || e.key === 'P') {
        togglePower();
        return;
      }
      if (e.key === 'c' || e.key === 'C') {
        togglePalette();
        return;
      }

      if (tvState === 'MENU') {
        if (e.key === '1') launchGame('SNAKE');
        else if (e.key === '2') launchGame('PONG');
        else if (e.key === '3') launchGame('DEFENDER');
        else if (e.key === '4') launchGame('MATRIX');
      } else if (tvState === 'SNAKE') {
        snakeGame.handleInput(e.key);
      } else if (tvState === 'PONG') {
        pongGame.handleInput(e.key);
      } else if (tvState === 'DEFENDER') {
        defenderGame.handleInput(e.key);
      } else if (tvState === 'MATRIX') {
        matrixGame.handleInput(e.key);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 6. ANIMATION & RENDER LOOP WITH PHYSICAL TOGGLE SWITCH DYNAMICS
  // ---------------------------------------------------------------------------
  function animate() {
    requestAnimationFrame(animate);

    // Render 2D terminal canvas
    renderScreen();

    if (isUsingThree && renderer && scene && camera) {
      // Update dynamic screen texture
      if (screenTexture) {
        screenTexture.needsUpdate = true;
      }

      // Smooth TV tilt physics towards mouse target
      if (tvGroup) {
        tvGroup.rotation.y += (targetRotY - tvGroup.rotation.y) * 0.08;
        tvGroup.rotation.x += (targetRotX - tvGroup.rotation.x) * 0.08;
      }

      // Physical toggle switch lever animation
      if (toggleState.leverMesh) {
        toggleState.currentRotX += (toggleState.targetRotX - toggleState.currentRotX) * 0.3;
        toggleState.leverMesh.rotation.x = toggleState.currentRotX;
      }

      // CRT Phosphor subtle living glow pulsation
      if (screenGlow && isPoweredOn) {
        screenGlow.intensity = 0.54 + Math.sin(Date.now() * 0.007) * 0.04;
      }

      renderer.render(scene, camera);
    }
  }

  // Boot
  initThreeScene();
  matrixGame.init();
  animate();
})();
