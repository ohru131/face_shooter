import { Camera } from "@mediapipe/camera_utils";
import { FaceMesh, FACEMESH_TESSELATION, Results } from "@mediapipe/face_mesh";
import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";

// --- Types ---
type Point = { x: number; y: number };
type GameState = "start" | "playing" | "gameover";

type Entity = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  type: "missile" | "enemy" | "particle" | "powerup";
  isBoss?: boolean;
  isProjectile?: boolean;
  maxLife?: number;
  enemyType?: "vampire" | "werewolf" | "mummy" | "frankenstein" | "gashadokuro" | "kappa" | "lantern" | "ootengu" | "umbrella" | "reaper" | "demon";
  life?: number;
  image?: HTMLImageElement;
  rotation?: number;
  scale?: number;
};

// --- Base URL for assets (handles GitHub Pages subpath) ---
const BASE_URL = import.meta.env.BASE_URL || '/';

// Helper function to resolve asset paths
const assetPath = (path: string) => `${BASE_URL}${path}`.replace(/\/\//g, '/');

// --- Assets (Halloween Theme) ---
const ASSETS = {
  // Player Assets (Witch)
  playerCenterClosed: assetPath("images/player_center_closed.png"),
  playerCenterOpen: assetPath("images/player_center_open.png"),
  playerLeftClosed: assetPath("images/player_left_closed.png"),
  playerLeftOpen: assetPath("images/player_left_open.png"),
  playerRightClosed: assetPath("images/player_right_closed.png"),
  playerRightOpen: assetPath("images/player_right_open.png"),
  
  // Legacy/Fallback
  cursor: assetPath("images/player_closed.png"),
  cursorOpen: assetPath("images/player_open.png"),
  
  // Projectile (Magic Star)
  missile: assetPath("images/projectile_voice.png"),
  enemyFireball: assetPath("images/enemy_fireball.png"),
  
  // Enemies (Halloween Monsters)
  vampire: assetPath("images/yokai_vampire.png"),
  werewolf: assetPath("images/yokai_werewolf.png"),
  mummy: assetPath("images/yokai_mummy.png"),
  frankenstein: assetPath("images/yokai_frankenstein.png"),
  gashadokuro: assetPath("images/yokai_gashadokuro.png"),
  kappa: assetPath("images/yokai_kappa.png"),
  lantern: assetPath("images/yokai_lantern.png"),
  ootengu: assetPath("images/yokai_ootengu.png"),
  umbrella: assetPath("images/yokai_umbrella.png"),
  // Boss enemies
  reaper: assetPath("images/yokai_gashadokuro.png"), // Gashadokuro as boss
  demon: assetPath("images/yokai_ootengu.png"), // Ootengu as boss
  
  // Powerup (Pumpkin)
  powerup: assetPath("images/item_powerup.png"),
  
  // Background (Halloween Night)
  bg: assetPath("images/game_background.png"),
  
  // UI
  heart: assetPath("images/icon_heart_halloween.png"),
};

// --- Audio Files ---
const AUDIO_FILES = {
  bgm: assetPath("audio/bgm_halloween.wav"),
  shoot: assetPath("audio/sfx_shoot.wav"),
  explosion: assetPath("audio/sfx_explosion.wav"),
  damage: assetPath("audio/sfx_damage.wav"),
  powerup: assetPath("audio/sfx_powerup.wav"),
  gameover: assetPath("audio/sfx_gameover.wav"),
};

// --- Audio Context ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
const audioBuffers: Record<string, AudioBuffer> = {};
let bgmSource: AudioBufferSourceNode | null = null;
let bgmGainNode: GainNode | null = null;

// Load audio files
const loadAudioFile = async (name: string, url: string) => {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    audioBuffers[name] = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    console.warn(`Failed to load audio: ${name}`, e);
  }
};

// Initialize audio
const initAudio = async () => {
  await loadAudioFile("shoot", AUDIO_FILES.shoot);
  await loadAudioFile("explosion", AUDIO_FILES.explosion);
  await loadAudioFile("damage", AUDIO_FILES.damage);
  await loadAudioFile("powerup", AUDIO_FILES.powerup);
  await loadAudioFile("gameover", AUDIO_FILES.gameover);
  await loadAudioFile("bgm", AUDIO_FILES.bgm);
};

const playSound = (type: "shoot" | "explosion" | "damage" | "powerup" | "gameover") => {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  
  const buffer = audioBuffers[type];
  if (buffer) {
    const source = audioCtx.createBufferSource();
    const gainNode = audioCtx.createGain();
    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    gainNode.gain.value = type === "gameover" ? 0.5 : 0.3;
    source.start();
  } else {
    // Fallback to oscillator if audio not loaded
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === "shoot") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start();
      osc.stop(now + 0.1);
    } else if (type === "explosion") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start();
      osc.stop(now + 0.3);
    } else if (type === "damage") {
      osc.type = "square";
      osc.frequency.setValueAtTime(150, now);
      osc.frequency.linearRampToValueAtTime(100, now + 0.1);
      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.linearRampToValueAtTime(0.01, now + 0.2);
      osc.start();
      osc.stop(now + 0.2);
    } else if (type === "powerup") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
      gainNode.gain.setValueAtTime(0.1, now);
      gainNode.gain.linearRampToValueAtTime(0.01, now + 0.4);
      osc.start();
      osc.stop(now + 0.4);
    } else if (type === "gameover") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(50, now + 1.0);
      gainNode.gain.setValueAtTime(0.3, now);
      gainNode.gain.linearRampToValueAtTime(0.01, now + 1.0);
      osc.start();
      osc.stop(now + 1.0);
    }
  }
};

const startBGM = () => {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  
  if (bgmSource) {
    bgmSource.stop();
  }
  
  const buffer = audioBuffers["bgm"];
  if (buffer) {
    bgmSource = audioCtx.createBufferSource();
    bgmGainNode = audioCtx.createGain();
    bgmSource.buffer = buffer;
    bgmSource.loop = true;
    bgmSource.connect(bgmGainNode);
    bgmGainNode.connect(audioCtx.destination);
    bgmGainNode.gain.value = 0.15;
    bgmSource.start();
  }
};

const stopBGM = () => {
  if (bgmSource) {
    bgmSource.stop();
    bgmSource = null;
  }
};

// --- Constants ---
const MISSILE_SPEED = 15;
const ENEMY_SPEED_BASE = 3;
const SPAWN_RATE = 60;
const MOUTH_OPEN_THRESHOLD = 0.05;
const MOUTH_COOLDOWN = 10;
const MAX_LIVES = 5;

export default function GameCanvas() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Game State
  const [gameState, setGameState] = useState<GameState>("start");
  const [isFaceMissing, setIsFaceMissing] = useState(false);
  const isFaceMissingRef = useRef(false);
  useEffect(() => { isFaceMissingRef.current = isFaceMissing; }, [isFaceMissing]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [sensitivity, setSensitivity] = useState(1.5);
  const [isMouthOpen, setIsMouthOpen] = useState(false);
  const isMouthOpenRef = useRef(false);
  const wasMouthOpenRef = useRef(false);
  useEffect(() => { isMouthOpenRef.current = isMouthOpen; }, [isMouthOpen]);
  const [difficulty, setDifficulty] = useState(1);
  const difficultyRef = useRef(1);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [showBossWarning, setShowBossWarning] = useState(false);
  const bossActiveRef = useRef(false);
  const bossSpawnedForLevelRef = useRef(0);
  const [powerLevel, setPowerLevel] = useState(1);
  const [windowSize, setWindowSize] = useState({ width: 1280, height: 720 });
  
  // Refs for game loop logic
  const cursorPosRef = useRef<Point>({ x: 0.5, y: 0.5 });
  const prevCursorXRef = useRef(window.innerWidth / 2);
  const leanRef = useRef<"center" | "left" | "right">("center");
  const entitiesRef = useRef<Entity[]>([]);
  const frameCountRef = useRef(0);
  const mouthCooldownRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const faceDetectedRef = useRef(false);
  const damageEffectRef = useRef(0);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Take Damage Helper
  const takeDamage = () => {
    playSound("damage");
    livesRef.current--;
    setLives(livesRef.current);
    damageEffectRef.current = 20;
    
    if (livesRef.current <= 0) {
      playSound("gameover");
      stopBGM();
      setGameState("gameover");
    }
  };

  // Load images and audio on mount
  useEffect(() => {
    const loadImg = (src: string) => {
      const img = new Image();
      img.src = src;
      return img;
    };
    
    imagesRef.current = {
      // Player Assets (Witch)
      playerCenterClosed: loadImg(ASSETS.playerCenterClosed),
      playerCenterOpen: loadImg(ASSETS.playerCenterOpen),
      playerLeftClosed: loadImg(ASSETS.playerLeftClosed),
      playerLeftOpen: loadImg(ASSETS.playerLeftOpen),
      playerRightClosed: loadImg(ASSETS.playerRightClosed),
      playerRightOpen: loadImg(ASSETS.playerRightOpen),

      cursor: loadImg(ASSETS.cursor),
      cursorOpen: loadImg(ASSETS.cursorOpen),
      missile: loadImg(ASSETS.missile),
      enemyFireball: loadImg(ASSETS.enemyFireball),
      
      // Halloween Enemies
      vampire: loadImg(ASSETS.vampire),
      werewolf: loadImg(ASSETS.werewolf),
      mummy: loadImg(ASSETS.mummy),
      frankenstein: loadImg(ASSETS.frankenstein),
      gashadokuro: loadImg(ASSETS.gashadokuro),
      kappa: loadImg(ASSETS.kappa),
      lantern: loadImg(ASSETS.lantern),
      ootengu: loadImg(ASSETS.ootengu),
      umbrella: loadImg(ASSETS.umbrella),
      reaper: loadImg(ASSETS.reaper),
      demon: loadImg(ASSETS.demon),
      
      powerup: loadImg(ASSETS.powerup),
      heart: loadImg(ASSETS.heart),
    };
    
    const bg = loadImg(ASSETS.bg);
    bg.onload = () => { bgImageRef.current = bg; };

    // Initialize audio
    initAudio();

  }, []);

  // MediaPipe Setup
  useEffect(() => {
    const faceMesh = new FaceMesh({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });

    faceMesh.setOptions({
      maxNumFaces: 1,
      refineLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

    faceMesh.onResults(onResults);

    if (webcamRef.current && webcamRef.current.video) {
      const camera = new Camera(webcamRef.current.video, {
        onFrame: async () => {
          if (webcamRef.current?.video) {
            await faceMesh.send({ image: webcamRef.current.video });
          }
        },
        width: 1280,
        height: 720,
      });
      camera.start();
    }

    return () => {
      faceMesh.close();
      stopBGM();
    };
  }, []);

  const sensitivityRef = useRef(sensitivity);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const spawnEnemy = (width: number, height: number, speedMultiplier: number = 1.0, forceBoss: boolean = false) => {
    const rand = Math.random();
    let type: "vampire" | "werewolf" | "mummy" | "frankenstein" | "gashadokuro" | "kappa" | "lantern" | "ootengu" | "umbrella" | "reaper" | "demon" = "vampire";
    let img = imagesRef.current.vampire;
    let speed = ENEMY_SPEED_BASE * speedMultiplier;
    const isMobile = width < 600;
    let size = isMobile ? 100 : 210;
    let isBoss = false;
    let life = 3;

    // Boss Spawn Logic
    if (forceBoss) {
      isBoss = true;
      size = isMobile ? 200 : 420;
      life = 6;
      speed = ENEMY_SPEED_BASE * 0.8;
      
      // Randomize Boss (Halloween theme)
      const bossRand = Math.random();
      if (bossRand < 0.5) {
        type = "reaper";
        img = imagesRef.current.reaper;
      } else {
        type = "demon";
        img = imagesRef.current.demon;
      }
    } else {
      // Normal Enemy Spawn Logic - 9 enemy types
      const enemyRand = Math.floor(rand * 9);
      switch (enemyRand) {
        case 0:
          type = "vampire";
          img = imagesRef.current.vampire;
          speed = ENEMY_SPEED_BASE * 1.2; // Fast
          break;
        case 1:
          type = "werewolf";
          img = imagesRef.current.werewolf;
          speed = ENEMY_SPEED_BASE * 1.1; // Fast
          break;
        case 2:
          type = "mummy";
          img = imagesRef.current.mummy;
          speed = ENEMY_SPEED_BASE * 0.8; // Slow
          break;
        case 3:
          type = "frankenstein";
          img = imagesRef.current.frankenstein;
          speed = ENEMY_SPEED_BASE * 0.9; // Medium
          break;
        case 4:
          type = "gashadokuro";
          img = imagesRef.current.gashadokuro;
          speed = ENEMY_SPEED_BASE * 0.7; // Very slow but tough
          life = 4;
          break;
        case 5:
          type = "kappa";
          img = imagesRef.current.kappa;
          speed = ENEMY_SPEED_BASE * 1.0; // Medium
          break;
        case 6:
          type = "lantern";
          img = imagesRef.current.lantern;
          speed = ENEMY_SPEED_BASE * 1.3; // Very fast
          life = 2;
          break;
        case 7:
          type = "ootengu";
          img = imagesRef.current.ootengu;
          speed = ENEMY_SPEED_BASE * 1.15; // Fast
          break;
        case 8:
        default:
          type = "umbrella";
          img = imagesRef.current.umbrella;
          speed = ENEMY_SPEED_BASE * 0.95; // Medium
          break;
      }
    }

    const x = Math.random() * (width - size);
    const y = isBoss ? -size * 0.5 : -size;
    
    entitiesRef.current.push({
      id: Math.random(),
      x,
      y,
      width: size,
      height: size,
      vx: (Math.random() - 0.5) * 2, 
      vy: speed + Math.random(),
      type: "enemy",
      enemyType: type,
      image: img,
      life: life,
      maxLife: life,
      isBoss: isBoss,
    });
  };

  const spawnPowerup = (width: number, height: number) => {
    const isMobile = width < 600;
    const size = isMobile ? 80 : 150;
    const x = Math.random() * (width - size);
    const y = -size;
    
    entitiesRef.current.push({
      id: Math.random(),
      x,
      y,
      width: size,
      height: size,
      vx: 0,
      vy: ENEMY_SPEED_BASE * 1.5,
      type: "powerup",
      image: imagesRef.current.powerup,
    });
  };

  const spawnMissile = (x: number, y: number) => {
    const isMobile = windowSize.width < 600;
    const size = isMobile ? 60 : 80;

    const createMissile = (offsetX: number, angle: number) => {
      entitiesRef.current.push({
        id: Math.random(),
        x: x - (size/2) + offsetX,
        y: y - size,
        width: size,
        height: size,
        vx: Math.sin(angle) * 5,
        vy: -MISSILE_SPEED,
        type: "missile",
        image: imagesRef.current.missile,
        rotation: angle,
      });
    };

    // Single shot only
    createMissile(0, 0);
    
    playSound("shoot");
  };

  const spawnExplosion = (x: number, y: number, color: string = "purple") => {
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const speed = 5 + Math.random() * 5;
      entitiesRef.current.push({
        id: Math.random(),
        x,
        y,
        width: 15,
        height: 15,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        type: "particle",
        life: 30,
        image: undefined,
      });
    }
  };

  const updateGameLogic = (width: number, height: number) => {
    if (gameStateRef.current !== "playing") return;

    frameCountRef.current++;
    if (damageEffectRef.current > 0) damageEffectRef.current--;

    // --- Leveling System ---
    // Boss spawns when score reaches threshold for next level
    // After boss is defeated, normal enemies continue until next boss threshold
    const scoreForNextBoss = difficultyRef.current * 500; // Boss at 500, 1000, 1500, etc.
    
    // Spawn boss only when:
    // 1. Score reaches the threshold for current difficulty level
    // 2. No boss is currently active
    // 3. Boss hasn't been spawned for this level yet
    if (scoreRef.current >= scoreForNextBoss && !bossActiveRef.current && bossSpawnedForLevelRef.current < difficultyRef.current) {
      spawnEnemy(width, height, 1.0, true);
      bossActiveRef.current = true;
      bossSpawnedForLevelRef.current = difficultyRef.current;
      setShowBossWarning(true);
      setTimeout(() => setShowBossWarning(false), 3000);
      playSound("gameover");
    }

    // Difficulty increases spawn rate and enemy speed
    const currentSpawnRate = Math.max(20, SPAWN_RATE - (difficultyRef.current * 5));
    const speedMultiplier = 1 + (difficultyRef.current * 0.15);

    // Spawn normal enemies when boss is NOT active
    if (!bossActiveRef.current && frameCountRef.current % currentSpawnRate === 0) {
      spawnEnemy(width, height, speedMultiplier, false);
    }
    
    // Boss Attack Logic
    if (bossActiveRef.current && frameCountRef.current % 120 === 0) {
      const boss = entitiesRef.current.find(e => e.isBoss);
      if (boss) {
        const dx = cursorPosRef.current.x - (boss.x + boss.width/2);
        const dy = cursorPosRef.current.y - (boss.y + boss.height/2);
        const dist = Math.hypot(dx, dy);
        const speed = 10;
        
        entitiesRef.current.push({
          id: Math.random(),
          x: boss.x + boss.width/2 - 40,
          y: boss.y + boss.height/2,
          width: 80,
          height: 80,
          vx: (dx / dist) * speed,
          vy: (dy / dist) * speed,
          type: "enemy",
          isProjectile: true,
          image: imagesRef.current.enemyFireball,
          life: 1,
          maxLife: 1
        });
      }
    }
    
    // Check if boss is still active
    if (bossActiveRef.current) {
      const bossExists = entitiesRef.current.some(e => e.isBoss);
      if (!bossExists) {
        bossActiveRef.current = false;
      }
    }
    
    // Spawn powerups occasionally
    const spawnRateAdjusted = Math.max(20, SPAWN_RATE - (difficultyRef.current - 1) * 5);
    if (frameCountRef.current % (spawnRateAdjusted * 5) === 0 && Math.random() < 0.3) {
      spawnPowerup(width, height);
    }

    // Update Entities
    entitiesRef.current.forEach(entity => {
      entity.x += entity.vx;
      entity.y += entity.vy;
      
      if (entity.type === "particle" && entity.life !== undefined) {
        entity.life--;
        entity.vy += 0.2;
      }

      // Add sparkle effect to Powerups
      if (entity.type === "powerup" && frameCountRef.current % 5 === 0) {
        entitiesRef.current.push({
          id: Math.random(),
          x: entity.x + Math.random() * entity.width,
          y: entity.y + Math.random() * entity.height,
          width: 5,
          height: 5,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          type: "particle",
          life: 20,
          image: undefined,
        });
      }
    });

    // Remove dead entities
    entitiesRef.current = entitiesRef.current.filter(e => {
      if (e.type === "particle") return (e.life || 0) > 0;
      
      if (e.y > height + 50) {
        if (e.type === "enemy") {
          takeDamage();
          
          if (e.isBoss) {
            bossActiveRef.current = false;
            // Allow boss to respawn if it escaped
            bossSpawnedForLevelRef.current = difficultyRef.current - 1;
          }
        }
        return false;
      }
      
      const topLimit = -600;
      if (e.y < topLimit || e.x < -100 || e.x > width + 100) return false;
      
      return true;
    });

    // Collision Detection
    const missiles = entitiesRef.current.filter(e => e.type === "missile");
    const enemies = entitiesRef.current.filter(e => e.type === "enemy");
    const powerups = entitiesRef.current.filter(e => e.type === "powerup");
    
    const isMobile = width < 600;
    const hitboxSize = isMobile ? 100 : 250;
    const playerHitbox = {
      x: cursorPosRef.current.x - hitboxSize/2,
      y: cursorPosRef.current.y - hitboxSize/2,
      width: hitboxSize,
      height: hitboxSize
    };

    // 1. Missile vs Enemy
    missiles.forEach(m => {
      enemies.forEach(e => {
        if (e.isProjectile) return;

        if (
          m.x < e.x + e.width &&
          m.x + m.width > e.x &&
          m.y < e.y + e.height &&
          m.y + m.height > e.y
        ) {
          m.y = -999;
          
          if (e.life) e.life--;
          
          if (e.life && e.life > 0) {
            spawnExplosion(e.x + e.width/2, e.y + e.height/2, "white");
            playSound("damage");
          } else {
            spawnExplosion(e.x + e.width/2, e.y + e.height/2);
            playSound("explosion");
            
            e.y = height + 999;
            e.life = 0;
            e.type = "particle";
            
            scoreRef.current += e.isBoss ? 1000 : 100;
            setScore(scoreRef.current);
            
            if (e.isBoss) {
              // Boss defeated - level up and return to normal enemies
              bossActiveRef.current = false;
              const newLevel = difficultyRef.current + 1;
              setDifficulty(newLevel);
              difficultyRef.current = newLevel;
              setShowLevelUp(true);
              setTimeout(() => setShowLevelUp(false), 3000);
              playSound("powerup");
              // Set bossSpawnedForLevelRef to current level so next boss spawns at newLevel * 500
              bossSpawnedForLevelRef.current = difficultyRef.current;
            }
          }
        }
      });
    });

    // 2. Player vs Enemy
    enemies.forEach(e => {
      if (e.type !== "enemy") return;
      if ((e.life ?? 0) <= 0) return;
      if (e.y > height) return;

      if (
        playerHitbox.x < e.x + e.width &&
        playerHitbox.x + playerHitbox.width > e.x &&
        playerHitbox.y < e.y + e.height &&
        playerHitbox.y + playerHitbox.height > e.y
      ) {
        spawnExplosion(e.x + e.width/2, e.y + e.height/2, "red");
        takeDamage();
        
        e.y = height + 999;
        e.life = 0;
        e.type = "particle";
      }
    });

    // 3. Player vs Powerup
    powerups.forEach(p => {
      if (
        playerHitbox.x < p.x + p.width &&
        playerHitbox.x + playerHitbox.width > p.x &&
        playerHitbox.y < p.y + p.height &&
        playerHitbox.y + playerHitbox.height > p.y
      ) {
        playSound("powerup");
        setPowerLevel(prev => Math.min(prev + 1, 3));
        p.y = height + 999;
        
        if (livesRef.current < MAX_LIVES) {
          livesRef.current++;
          setLives(livesRef.current);
        }
      }
    });
  };

  const onResults = (results: Results) => {
    if (!canvasRef.current || !webcamRef.current?.video) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    
    // Draw Background
    if (bgImageRef.current) {
      const bgRatio = bgImageRef.current.width / bgImageRef.current.height;
      const canvasRatio = width / height;
      let drawW, drawH, startX, startY;

      if (canvasRatio > bgRatio) {
        drawW = width;
        drawH = width / bgRatio;
        startX = 0;
        startY = (height - drawH) / 2;
      } else {
        drawH = height;
        drawW = height * bgRatio;
        startX = (width - drawW) / 2;
        startY = 0;
      }
      ctx.drawImage(bgImageRef.current, startX, startY, drawW, drawH);
      // Add light overlay to make background brighter
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.fillRect(0, 0, width, height);
    } else {
      // Halloween gradient fallback (lighter version)
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#5a3d7a");
      gradient.addColorStop(0.5, "#8b5aab");
      gradient.addColorStop(1, "#ffb380");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    // Damage Effect (Purple Flash for Halloween)
    if (damageEffectRef.current > 0) {
      ctx.fillStyle = `rgba(128, 0, 128, ${damageEffectRef.current / 20})`;
      ctx.fillRect(0, 0, width, height);
    }

    // --- Mirror Video Overlay ---
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.15;
    ctx.drawImage(results.image, 0, 0, width, height);
    ctx.globalAlpha = 1.0;
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      faceDetectedRef.current = true;
      const landmarks = results.multiFaceLandmarks[0];
      drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, { color: '#9333ea40', lineWidth: 1 });
      
      // --- Control Logic ---
      const nose = landmarks[1];
      const centerX = 0.5;
      const centerY = 0.5;
      
      const diffX = (nose.x - centerX) * sensitivityRef.current;
      const diffY = (nose.y - centerY) * sensitivityRef.current;
      
      let newX = centerX + diffX;
      let newY = centerY + diffY;
      
      newX = Math.max(0, Math.min(1, newX));
      newY = Math.max(0, Math.min(1, newY));
      
      const visualX = (1 - newX) * width;
      const visualY = newY * height;
      
      cursorPosRef.current = { x: visualX, y: visualY };

      // Mouth Logic
      const upperLip = landmarks[13];
      const lowerLip = landmarks[14];
      const topHead = landmarks[10];
      const chin = landmarks[152];
      
      const mouthDist = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
      const faceHeight = Math.hypot(topHead.x - chin.x, topHead.y - chin.y);
      const ratio = mouthDist / faceHeight;
      
      const isOpen = ratio > MOUTH_OPEN_THRESHOLD;
      setIsMouthOpen(isOpen);

      // Auto Start & Resume Logic
      if (gameStateRef.current === "start") {
        restartGame();
        setGameState("playing");
        setIsFaceMissing(false);
        startBGM();
      } else if (isFaceMissingRef.current) {
        restartGame();
        setTimeout(() => {
            setGameState("playing");
            setIsFaceMissing(false);
            startBGM();
        }, 0);
      }
      
      // Shoot (Semi-auto: Only on Close -> Open transition)
      if (isOpen && !wasMouthOpenRef.current && gameStateRef.current === "playing") {
        spawnMissile(visualX, visualY);
      }
      wasMouthOpenRef.current = isOpen;

    } else {
      faceDetectedRef.current = false;
      
      if (gameStateRef.current === "playing") {
        setIsFaceMissing(true);
        stopBGM();
      } else if (gameStateRef.current === "gameover") {
        setIsFaceMissing(true);
      }
    }
    ctx.restore();

    // --- Game Loop Update ---
    updateGameLogic(width, height);

    // Player Character (Witch)
    const isMobile = width < 600;
    const baseSize = isMobile ? 120 : 250;
    
    // Calculate Lean based on movement
    const currentX = cursorPosRef.current.x;
    const prevX = prevCursorXRef.current;
    const moveDiffX = currentX - prevX;
    
    // Inverted lean direction
    if (moveDiffX < -2) leanRef.current = "right";
    else if (moveDiffX > 2) leanRef.current = "left";
    else leanRef.current = "center";
    
    prevCursorXRef.current = currentX;

    // Select Image based on Lean and Mouth
    const isMouthOpenNow = isMouthOpenRef.current;
    const lean = leanRef.current;
    
    let playerImg;
    if (lean === "left") {
        playerImg = isMouthOpenNow ? imagesRef.current.playerLeftOpen : imagesRef.current.playerLeftClosed;
    } else if (lean === "right") {
        playerImg = isMouthOpenNow ? imagesRef.current.playerRightOpen : imagesRef.current.playerRightClosed;
    } else {
        playerImg = isMouthOpenNow ? imagesRef.current.playerCenterOpen : imagesRef.current.playerCenterClosed;
    }
    
    if (!playerImg) {
         playerImg = isMouthOpenNow ? imagesRef.current.cursorOpen : imagesRef.current.cursor;
    }

    const cursorSize = isMouthOpenNow ? baseSize * 1.2 : baseSize;

    // Draw Magic Aura if mouth is open (Purple for Halloween)
    if (isMouthOpenNow) {
        ctx.beginPath();
        ctx.arc(cursorPosRef.current.x, cursorPosRef.current.y, cursorSize/1.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(147, 51, 234, 0.3)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 200, 100, 0.8)";
        ctx.lineWidth = 4;
        ctx.stroke();
    }

    if (playerImg) {
      ctx.drawImage(
        playerImg, 
        cursorPosRef.current.x - cursorSize/2, 
        cursorPosRef.current.y - cursorSize/2, 
        cursorSize, 
        cursorSize
      );
    } else {
        ctx.fillStyle = isMouthOpenNow ? "#9333ea" : "#6b21a8";
        ctx.beginPath();
        ctx.arc(cursorPosRef.current.x, cursorPosRef.current.y, cursorSize/2, 0, Math.PI*2);
        ctx.fill();
    }

    // Entities
    entitiesRef.current.forEach(e => {
      if (e.type === "particle") {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.width/2, 0, Math.PI*2);
        // Purple/orange particles for Halloween
        const hue = Math.random() > 0.5 ? 280 : 30;
        ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${(e.life || 0) / 20})`;
        ctx.fill();
      } else if (e.image) {
        ctx.save();
        ctx.translate(e.x + e.width/2, e.y + e.height/2);
        if (e.rotation) ctx.rotate(e.rotation);
        ctx.drawImage(e.image, -e.width/2, -e.height/2, e.width, e.height);
        ctx.restore();
        
        // Draw HP bar for enemies with life > 1
        if (e.type === "enemy" && e.maxLife && e.maxLife > 1 && e.life && e.life > 0) {
          const barWidth = e.width * 0.8;
          const barHeight = 8;
          const barX = e.x + (e.width - barWidth) / 2;
          const barY = e.y - 15;
          
          // Background
          ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
          ctx.fillRect(barX, barY, barWidth, barHeight);
          
          // HP
          const hpPercent = e.life / e.maxLife;
          ctx.fillStyle = e.isBoss ? "#ff6b35" : "#9333ea";
          ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);
          
          // Border
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
      }
    });
  };

  const drawConnectors = (ctx: CanvasRenderingContext2D, landmarks: any[], connections: any[], style: any) => {
    ctx.save();
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth;
    for (const connection of connections) {
      const start = landmarks[connection[0]];
      const end = landmarks[connection[1]];
      if (start && end) {
        ctx.beginPath();
        ctx.moveTo(start.x * ctx.canvas.width, start.y * ctx.canvas.height);
        ctx.lineTo(end.x * ctx.canvas.width, end.y * ctx.canvas.height);
        ctx.stroke();
      }
    }
    ctx.restore();
  };

  const restartGame = () => {
    setScore(0);
    scoreRef.current = 0;
    setLives(MAX_LIVES);
    livesRef.current = MAX_LIVES;
    setPowerLevel(1);
    setDifficulty(1);
    difficultyRef.current = 1;
    entitiesRef.current = [];
    setGameState("start");
    bossActiveRef.current = false;
    bossSpawnedForLevelRef.current = 0;
  };

  return (
    <div className="relative w-full h-screen bg-purple-950 overflow-hidden flex flex-col items-center justify-center font-display">
      <Webcam
        ref={webcamRef}
        className="absolute opacity-0"
        mirrored={true}
        width={1280}
        height={720}
      />
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full object-cover"
        width={windowSize.width}
        height={windowSize.height}
      />
      
      {/* UI Overlay - Halloween Theme */}
      <div className="absolute top-0 left-0 w-full p-2 md:p-4 z-10 flex flex-col md:flex-row md:items-start md:justify-between pointer-events-none">
        
        {/* Top Left: Title & Score */}
        <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start gap-2 md:gap-4 w-full md:w-auto pointer-events-auto">
          <h1 className="text-xl md:text-4xl text-purple-400 drop-shadow-sm tracking-wider hidden md:block" style={{ textShadow: '2px 2px 0px #1a0a2e, 0 0 10px #9333ea' }}>Witch Shooter</h1>
          
          {/* Score & Lives Container */}
          <div className="flex items-center gap-2 md:gap-4 bg-purple-900/80 backdrop-blur-sm p-2 rounded-xl border-2 border-purple-500 shadow-lg">
             {/* Score */}
             <div className="flex flex-col md:flex-row items-center gap-1 md:gap-2">
               <span className="text-xs md:text-lg text-orange-400 font-bold">SCORE</span>
               <span className="text-lg md:text-3xl text-orange-300 font-pixel tracking-widest">{score.toString().padStart(6, '0')}</span>
             </div>
             
             {/* Divider */}
             <div className="w-px h-8 bg-purple-500 mx-1"></div>

             {/* Lives */}
             <div className="flex items-center gap-1">
               {Array.from({ length: MAX_LIVES }).map((_, i) => (
                 <img 
                   key={i} 
                   src={ASSETS.heart} 
                   className={`w-5 h-5 md:w-8 md:h-8 transition-all ${i < lives ? 'opacity-100 scale-100' : 'opacity-20 scale-75 grayscale'}`} 
                   alt="heart"
                 />
               ))}
             </div>
          </div>
        </div>

        {/* Top Right: Controls */}
        <div className="flex flex-row md:flex-col items-center md:items-end gap-2 mt-2 md:mt-0 pointer-events-auto">
          
          {/* Difficulty Level */}
          <div className="flex items-center gap-2 bg-purple-900/80 backdrop-blur-sm px-3 py-1 rounded-full border-2 border-orange-400 shadow-lg">
            <span className="text-xs md:text-sm font-bold text-orange-400 uppercase">LEVEL</span>
            <span className="text-lg md:text-xl font-black text-orange-300">{difficulty}</span>
          </div>

          {/* Sensitivity Slider */}
          <div className="flex flex-col items-end gap-1 bg-purple-900/80 backdrop-blur-sm p-2 rounded-xl border-2 border-purple-500 shadow-lg">
            <div className="flex items-center gap-2">
                <span className="text-xs md:text-sm font-bold text-purple-300 uppercase">SENSITIVITY</span>
                <span className="text-xs font-mono text-purple-200">{sensitivity.toFixed(1)}</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="5.0" 
              step="0.1" 
              value={sensitivity} 
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="accent-purple-500 h-2 md:h-3 w-24 md:w-32 bg-purple-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-[10px] text-purple-400">Adjust if mouth not detecting</div>
          </div>

          {/* Mouth Status */}
          <div className={`px-3 py-1 rounded-full text-xs md:text-sm font-bold transition-all duration-200 border-2 ${isMouthOpen ? 'bg-orange-500 text-white border-orange-400 shadow-lg shadow-orange-500/50' : 'bg-purple-800 text-purple-400 border-purple-600'}`}>
            {isMouthOpen ? "CASTING SPELL ✨" : "READY 🧙‍♀️"}
          </div>
        </div>

      </div>

      {showLevelUp && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="text-6xl md:text-9xl font-black text-orange-400 drop-shadow-[0_5px_5px_rgba(0,0,0,0.5)] animate-bounce font-pixel" style={{ textShadow: '0 0 30px #f97316' }}>
                LEVEL UP!
            </div>
        </div>
      )}

      {showBossWarning && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="text-5xl md:text-8xl font-black text-red-600 drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)] animate-pulse font-pixel bg-black/50 p-4 rounded-xl">
                WARNING!
                <div className="text-2xl md:text-4xl text-white mt-2">BOSS APPROACHING</div>
            </div>
        </div>
      )}

      {gameState === "gameover" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-gradient-to-b from-purple-900 to-purple-950 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-2xl text-center border-4 md:border-8 border-orange-500 animate-bounce w-full max-w-sm md:max-w-md relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500"></div>
            <h2 className="text-4xl md:text-6xl text-orange-400 mb-2 drop-shadow-md mt-4" style={{ textShadow: '0 0 20px #f97316' }}>GAME OVER</h2>
            <div className="text-lg md:text-2xl text-purple-300 mb-6 md:mb-8 font-body">
              {lives <= 0 ? "The monsters got you!" : "You vanished!"}
            </div>
            
            <div className="bg-purple-800/50 p-4 md:p-6 rounded-3xl mb-6 md:mb-8 border-4 border-orange-400 transform rotate-1">
              <div className="text-xs md:text-sm text-orange-300 font-bold uppercase tracking-wider">Final Score</div>
              <div className="text-4xl md:text-6xl text-orange-400 font-pixel mt-2 drop-shadow-sm" style={{ textShadow: '0 0 10px #f97316' }}>{score}</div>
            </div>

            <button 
              onClick={restartGame}
              className="w-full py-3 md:py-4 bg-gradient-to-b from-orange-500 to-orange-600 text-white rounded-2xl font-bold text-xl md:text-2xl shadow-[0_6px_0_#c2410c] active:shadow-none active:translate-y-[6px] transition-all hover:brightness-110"
            >
              TRY AGAIN 🎃
            </button>
          </div>
        </div>
      )}
      
      {/* Face Missing Overlay */}
      {isFaceMissing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-purple-900 p-6 rounded-2xl shadow-xl text-center animate-pulse border-4 border-purple-500">
            <div className="text-4xl mb-2">🧙‍♀️</div>
            <h2 className="text-2xl font-bold text-purple-300">WITCH VANISHED!</h2>
            <p className="text-purple-400">Show face to RESTART game</p>
          </div>
        </div>
      )}

      {gameState === "start" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <div className="bg-gradient-to-b from-purple-900 to-purple-950 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl border-4 md:border-8 border-purple-500 text-center animate-pulse w-full max-w-sm md:max-w-lg">
             <h2 className="text-3xl md:text-5xl text-purple-300 mb-4 md:mb-6 font-display" style={{ textShadow: '0 0 20px #9333ea' }}>Ready, Witch?</h2>
             <p className="text-lg md:text-2xl text-purple-400 mb-6 md:mb-8">Show your face to start!</p>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-left bg-purple-800/50 p-4 md:p-6 rounded-2xl border-2 border-purple-600">
               <div className="flex items-center gap-3">
                 <span className="text-2xl">🧙‍♀️</span>
                 <span className="text-sm font-bold text-purple-300">Move head to AIM</span>
               </div>
               <div className="flex items-center gap-3">
                 <span className="text-2xl">✨</span>
                 <span className="text-sm font-bold text-purple-300">Open mouth to CAST</span>
               </div>
               <div className="flex items-center gap-3">
                 <img src={ASSETS.vampire} className="w-8 h-8" alt="enemy"/>
                 <span className="text-sm font-bold text-purple-300">Defeat Monsters</span>
               </div>
               <div className="flex items-center gap-3">
                 <img src={ASSETS.powerup} className="w-8 h-8" alt="powerup"/>
                 <span className="text-sm font-bold text-purple-300">Get Pumpkins!</span>
               </div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
