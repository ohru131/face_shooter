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
  enemyType?: "kappa" | "umbrella" | "lantern";
  life?: number; // For particles
  image?: HTMLImageElement;
  rotation?: number;
  scale?: number;
};

// --- Assets ---
const ASSETS = {
  // New Player Assets
  playerCenterClosed: "/images/player_center_closed.png",
  playerCenterOpen: "/images/player_center_open.png",
  playerLeftClosed: "/images/player_left_closed.png",
  playerLeftOpen: "/images/player_left_open.png",
  playerRightClosed: "/images/player_right_closed.png",
  playerRightOpen: "/images/player_right_open.png",
  
  // Legacy/Fallback
  cursor: "/images/player_closed.png",
  cursorOpen: "/images/player_open.png",
  
  missile: "/images/fireball.png",
  enemy1: "/images/enemy_1.png", // Keep old ones as fallback or mix
  enemy2: "/images/enemy_2.png",
  kappa: "/images/yokai_kappa.png",
  umbrella: "/images/yokai_umbrella.png",
  lantern: "/images/yokai_lantern.png",
  powerup: "/images/onigiri.png",
      bg: "/images/background_jp.png",
  heart: "/images/icon_heart.png",
};

  // --- Audio Context ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
const bgmAudio = new Audio("/sounds/bgm_japanese.mp3");
const shootAudio = new Audio("/sounds/shoot.mp3");
const explosionAudio = new Audio("/sounds/explosion.mp3");
bgmAudio.loop = true;
bgmAudio.volume = 0.4;

const playSound = (type: "shoot" | "explosion" | "damage" | "powerup" | "gameover") => {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  if (type === "shoot") {
    shootAudio.currentTime = 0;
    shootAudio.play().catch(e => console.log("Shoot sound failed", e));
    return;
  } else if (type === "explosion") {
    explosionAudio.currentTime = 0;
    explosionAudio.play().catch(e => console.log("Explosion sound failed", e));
    return;
  }

  // Fallback/Other sounds use Oscillator
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === "damage") {
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
};

// --- Constants ---
const MISSILE_SPEED = 15;
const ENEMY_SPEED_BASE = 3;
const SPAWN_RATE = 60; // Frames between spawns
const MOUTH_OPEN_THRESHOLD = 0.05;
const MOUTH_COOLDOWN = 10; // Frames between shots
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
  const [powerLevel, setPowerLevel] = useState(1); // 1: Normal, 2: Double, 3: Triple
  const [windowSize, setWindowSize] = useState({ width: 1280, height: 720 });
  
  // Refs for game loop logic
  const cursorPosRef = useRef<Point>({ x: 0.5, y: 0.5 });
  const prevCursorXRef = useRef(window.innerWidth / 2); // To calculate movement direction
  const leanRef = useRef<"center" | "left" | "right">("center");
  const entitiesRef = useRef<Entity[]>([]);
  const frameCountRef = useRef(0);
  const mouthCooldownRef = useRef(0);
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const faceDetectedRef = useRef(false);
  const damageEffectRef = useRef(0); // Frames to show damage effect

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Init
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load images on mount
  useEffect(() => {
    const loadImg = (src: string) => {
      const img = new Image();
      img.src = src;
      return img;
    };
    
    imagesRef.current = {
      // New Player Assets
      playerCenterClosed: loadImg(ASSETS.playerCenterClosed),
      playerCenterOpen: loadImg(ASSETS.playerCenterOpen),
      playerLeftClosed: loadImg(ASSETS.playerLeftClosed),
      playerLeftOpen: loadImg(ASSETS.playerLeftOpen),
      playerRightClosed: loadImg(ASSETS.playerRightClosed),
      playerRightOpen: loadImg(ASSETS.playerRightOpen),

      cursor: loadImg(ASSETS.cursor),
      cursorOpen: loadImg(ASSETS.cursorOpen),
      missile: loadImg(ASSETS.missile),
      enemy1: loadImg(ASSETS.enemy1),
      enemy2: loadImg(ASSETS.enemy2),
      kappa: loadImg(ASSETS.kappa),
      umbrella: loadImg(ASSETS.umbrella),
      lantern: loadImg(ASSETS.lantern),
      powerup: loadImg("/images/onigiri.png"), // Use onigiri for powerup
      heart: loadImg(ASSETS.heart),
    };
    
    const bg = loadImg(ASSETS.bg);
    bg.onload = () => { bgImageRef.current = bg; };

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
    };
  }, []);

  const sensitivityRef = useRef(sensitivity);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const spawnEnemy = (width: number, height: number, speedMultiplier: number = 1.0) => {
    const rand = Math.random();
    let type: "kappa" | "umbrella" | "lantern" = "kappa";
    let img = imagesRef.current.kappa;
    let speed = ENEMY_SPEED_BASE * speedMultiplier;
    // Responsive size: smaller on mobile
    const isMobile = width < 600;
    let size = isMobile ? 50 : 70;

    if (rand < 0.33) {
      type = "kappa";
      img = imagesRef.current.kappa;
      speed = ENEMY_SPEED_BASE * 1.2; // Fast
    } else if (rand < 0.66) {
      type = "umbrella";
      img = imagesRef.current.umbrella;
      speed = ENEMY_SPEED_BASE * 0.8; // Slow but maybe erratic?
    } else {
      type = "lantern";
      img = imagesRef.current.lantern;
      speed = ENEMY_SPEED_BASE;
    }

    const x = Math.random() * (width - size);
    const y = -size; 
    
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
      life: 1, // Initialize life to 1 so it's not treated as dead
    });
  };

  const spawnPowerup = (width: number, height: number) => {
    const isMobile = width < 600;
    const size = isMobile ? 40 : 50;
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
    const size = isMobile ? 30 : 40;

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

    createMissile(0, 0);
    
    if (powerLevel >= 2) {
      createMissile(-30, -0.1);
      createMissile(30, 0.1);
    }
    if (powerLevel >= 3) {
      createMissile(-60, -0.2);
      createMissile(60, 0.2);
    }
    
    playSound("shoot");
  };

  const spawnExplosion = (x: number, y: number, color: string = "yellow") => {
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
        image: undefined, // Use color
      });
    }
  };

  const takeDamage = () => {
    if (livesRef.current > 0) {
      livesRef.current--;
      setLives(livesRef.current);
      damageEffectRef.current = 10; // Show red flash for 10 frames
      playSound("damage");
      
      if (livesRef.current <= 0) {
        setGameState("gameover");
        playSound("gameover");
      }
    }
  };

  const updateGameLogic = (width: number, height: number) => {
    if (gameStateRef.current !== "playing") return;
    if (!faceDetectedRef.current) return; // Pause logic if face is missing

    frameCountRef.current++;
    if (damageEffectRef.current > 0) damageEffectRef.current--;

    // Difficulty Scaling
    // Increase difficulty every 600 frames (approx 10 seconds)
    const difficultyLevel = Math.floor(frameCountRef.current / 600);
    
    // Spawn Rate: Decrease interval as difficulty increases (min 20 frames)
    const currentSpawnRate = Math.max(20, SPAWN_RATE - (difficultyLevel * 5));
    
    // Enemy Speed Multiplier: Increase speed slightly with difficulty
    const speedMultiplier = 1 + (difficultyLevel * 0.1);

    // Spawn Enemies
    if (frameCountRef.current % currentSpawnRate === 0) {
      spawnEnemy(width, height, speedMultiplier);
    }
    
    // Spawn Powerup (Rare)
    if (frameCountRef.current % (SPAWN_RATE * 10) === 0) {
      spawnPowerup(width, height);
    }

    // Update Entities
    entitiesRef.current.forEach(entity => {
      entity.x += entity.vx;
      entity.y += entity.vy;
      
      if (entity.type === "particle" && entity.life !== undefined) {
        entity.life--;
        entity.vy += 0.2; // Gravity
      }
    });

    // Remove dead entities
    entitiesRef.current = entitiesRef.current.filter(e => {
      if (e.type === "particle") return (e.life || 0) > 0;
      
      // Check bounds
      if (e.y > height + 50) {
        // Enemy passed bottom
        if (e.type === "enemy") {
          takeDamage();
          // Effect for passing bottom (e.g. screen shake or bottom flash - handled by takeDamage visual)
        }
        return false;
      }
      if (e.y < -100 || e.x < -100 || e.x > width + 100) return false;
      
      return true;
    });

    // Collision Detection
    const missiles = entitiesRef.current.filter(e => e.type === "missile");
    const enemies = entitiesRef.current.filter(e => e.type === "enemy");
    const powerups = entitiesRef.current.filter(e => e.type === "powerup");
    
    // Player Hitbox (Cursor)
    const isMobile = width < 600;
    const hitboxSize = isMobile ? 40 : 60;
    const playerHitbox = {
      x: cursorPosRef.current.x - hitboxSize/2,
      y: cursorPosRef.current.y - hitboxSize/2,
      width: hitboxSize,
      height: hitboxSize
    };

    // 1. Missile vs Enemy
    missiles.forEach(m => {
      enemies.forEach(e => {
        if (
          m.x < e.x + e.width &&
          m.x + m.width > e.x &&
          m.y < e.y + e.height &&
          m.y + m.height > e.y
        ) {
          spawnExplosion(e.x + e.width/2, e.y + e.height/2);
          playSound("explosion");
          
          m.y = -999; // Remove missile
          e.y = height + 999; // Remove enemy
          e.life = 0; // Mark as dead explicitly
          e.type = "particle"; // Change type to avoid any further collision checks
          
          scoreRef.current += 100;
          setScore(scoreRef.current);
        }
      });
    });

    // 2. Player vs Enemy (Collision)
    // Re-fetch enemies to ensure we are checking against current state
    // (Though in this synchronous loop, 'enemies' array from line 388 still holds references to objects)
    // The issue might be that we are modifying 'e' in the missile loop (changing type to particle)
    // and then filtering 'enemies' based on type="enemy" at line 388 BEFORE the missile loop runs?
    // Wait, line 388 runs before missile loop. So 'enemies' array contains all enemies that were enemies at start of frame.
    // In missile loop (line 402), we change e.type to "particle".
    // In player loop (line 425), we iterate over the SAME 'enemies' array.
    // So 'e' inside this loop IS the same object.
    // We need to check if e.type is still "enemy".
    
    enemies.forEach(e => {
      // Check if enemy is still valid (might have been killed by missile in this same frame)
      if (e.type !== "enemy") return; 
      if ((e.life ?? 0) <= 0) return; 
      if (e.y > height) return; // Skip out of bounds enemies (handled by removal logic)

      if (
        playerHitbox.x < e.x + e.width &&
        playerHitbox.x + playerHitbox.width > e.x &&
        playerHitbox.y < e.y + e.height &&
        playerHitbox.y + playerHitbox.height > e.y
      ) {
        // Collision detected!
        spawnExplosion(e.x + e.width/2, e.y + e.height/2, "red");
        takeDamage();
        
        // Kill enemy
        e.y = height + 999; 
        e.life = 0; 
        e.type = "particle"; // Prevent double counting
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
        p.y = height + 999; // Remove powerup
        
        // Heal one life
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

    // Clear
    ctx.clearRect(0, 0, width, height);
    
    // Draw Background
    if (bgImageRef.current) {
      // Cover logic for background
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
      
      // Add a slight overlay to make it look more "Japanese paper" style if needed, or just darken for contrast
      ctx.fillStyle = "rgba(255, 250, 240, 0.1)";
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = "#2c3e50"; // Fallback dark blue
      ctx.fillRect(0, 0, width, height);
    }

    // Damage Effect (Red Flash)
    if (damageEffectRef.current > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${damageEffectRef.current / 20})`;
      ctx.fillRect(0, 0, width, height);
    }

    // --- Mirror Video Overlay ---
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.2;
    
    // Draw video to cover canvas
    const video = results.image as unknown as CanvasImageSource; // Cast to CanvasImageSource
    // Note: results.image is GpuBuffer or ImageBitmap. 
    // We can just draw it. But we want to maintain aspect ratio or cover.
    // Webcam is usually 16:9. Canvas matches window.
    // Let's just stretch for now or simple cover.
    ctx.drawImage(results.image, 0, 0, width, height);
    
    ctx.globalAlpha = 1.0;
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      faceDetectedRef.current = true;
      const landmarks = results.multiFaceLandmarks[0];
      drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, { color: '#FFFFFF40', lineWidth: 1 });
      
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
        // Initial start
        restartGame(); // Ensure fresh start
        setGameState("playing");
        setIsFaceMissing(false);
        bgmAudio.play().catch(e => console.log("Audio play failed:", e));
      } else if (isFaceMissingRef.current) {
        // If face was missing (in any state: playing, gameover, start), and now detected:
        // "戻ると最初からゲーム開始" -> Always restart
        restartGame();
        // Force state update immediately after restart
        setTimeout(() => {
            setGameState("playing");
            setIsFaceMissing(false);
        }, 0);
      }
      
      // Shoot (Semi-auto: Only on Close -> Open transition)
      if (isOpen && !wasMouthOpenRef.current && gameStateRef.current === "playing") {
        spawnMissile(visualX, visualY);
        playSound("shoot");
      }
      wasMouthOpenRef.current = isOpen;

    } else {
      faceDetectedRef.current = false;
      
      // Face Missing Logic
      if (gameStateRef.current === "playing") {
        // User said: "顔が外れるとゲーム終了"
        // So we set state to gameover or just reset to start?
        // "戻ると最初からゲーム開始" implies we should go to a state where we wait for face.
        // Let's set isFaceMissing to true, and when face returns, we restart.
        setIsFaceMissing(true);
        // Optionally show "Face Lost" screen which acts as a temporary game over
      } else if (gameStateRef.current === "gameover") {
        // If already gameover, we just mark face as missing so we know when it returns
        setIsFaceMissing(true);
      }
    }
    ctx.restore();

    // --- Game Loop Update ---
    updateGameLogic(width, height);

     // Player Character (Cursor)
    const isMobile = width < 600;
    const baseSize = isMobile ? 80 : 100; // Slightly larger for new character
    
    // Calculate Lean based on movement
    const currentX = cursorPosRef.current.x;
    const prevX = prevCursorXRef.current;
    const diffX = currentX - prevX; // Pixel difference
    
    // Update lean ref (Inverted as requested: "キャラの右移動と左移動 逆にして")
    // If moving RIGHT (diffX > 0), lean RIGHT (previously left)
    // If moving LEFT (diffX < 0), lean LEFT (previously right)
    if (diffX < -2) leanRef.current = "left"; 
    else if (diffX > 2) leanRef.current = "right";
    else leanRef.current = "center";
    
    prevCursorXRef.current = currentX; // Update for next frame

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
    
    // Fallback to old assets if new ones missing
    if (!playerImg) {
         playerImg = isMouthOpenNow ? imagesRef.current.cursorOpen : imagesRef.current.cursor;
    }

    const cursorSize = isMouthOpenNow ? baseSize * 1.2 : baseSize; // Less dramatic size change for full body

    // Draw Aura if mouth is open
    if (isMouthOpenNow) {
        ctx.beginPath();
        ctx.arc(cursorPosRef.current.x, cursorPosRef.current.y, cursorSize/1.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 100, 100, 0.3)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
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
        // Fallback if image not loaded
        ctx.fillStyle = isMouthOpenNow ? "red" : "blue";
        ctx.beginPath();
        ctx.arc(cursorPosRef.current.x, cursorPosRef.current.y, cursorSize/2, 0, Math.PI*2);
        ctx.fill();
    }

    // Entities
    entitiesRef.current.forEach(e => {
      if (e.type === "particle") {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.width/2, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255, 255, 0, ${(e.life || 0) / 20})`;
        ctx.fill();
      } else if (e.image) {
        ctx.save();
        ctx.translate(e.x + e.width/2, e.y + e.height/2);
        if (e.rotation) ctx.rotate(e.rotation);
        ctx.drawImage(e.image, -e.width/2, -e.height/2, e.width, e.height);
        ctx.restore();
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
    entitiesRef.current = [];
    setGameState("start");
  };

  return (
    <div className="relative w-full h-screen bg-pink-50 overflow-hidden flex flex-col items-center justify-center font-display">
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
      
      {/* UI Overlay - Responsive Layout */}
      <div className="absolute top-0 left-0 w-full p-2 md:p-4 z-10 flex flex-col md:flex-row md:items-start md:justify-between pointer-events-none">
        
        {/* Top Left: Title & Score */}
        <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start gap-2 md:gap-4 w-full md:w-auto pointer-events-auto">
          {/* Title - Hide on small mobile during play to save space, or make small */}
          <h1 className="text-xl md:text-4xl text-pink-500 drop-shadow-sm tracking-wider hidden md:block" style={{ textShadow: '2px 2px 0px #fbcfe8' }}>Face Shooter</h1>
          
          {/* Score & Lives Container */}
          <div className="flex items-center gap-2 md:gap-4 bg-white/80 backdrop-blur-sm p-2 rounded-xl border-2 border-pink-200 shadow-sm">
             {/* Score */}
             <div className="flex flex-col md:flex-row items-center gap-1 md:gap-2">
               <span className="text-xs md:text-lg text-yellow-600 font-bold">SCORE</span>
               <span className="text-lg md:text-3xl text-yellow-600 font-pixel tracking-widest">{score.toString().padStart(6, '0')}</span>
             </div>
             
             {/* Divider */}
             <div className="w-px h-8 bg-pink-200 mx-1"></div>

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

          {/* Top Right: Controls (Sensitivity & Status) */}
        <div className="flex flex-row md:flex-col items-center md:items-end gap-2 mt-2 md:mt-0 pointer-events-auto">
          
          {/* Difficulty Level */}
          <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border-2 border-purple-300 shadow-sm">
            <span className="text-xs md:text-sm font-bold text-purple-500 uppercase">LEVEL</span>
            <span className="text-lg md:text-xl font-black text-purple-600">{difficulty}</span>
          </div>

          {/* Sensitivity Slider - Compact on mobile */}
          <div className="flex flex-col items-end gap-1 bg-white/80 backdrop-blur-sm p-2 rounded-xl border-2 border-pink-200 shadow-sm">
            <div className="flex items-center gap-2">
                <span className="text-xs md:text-sm font-bold text-pink-400 uppercase">SENSITIVITY</span>
                <span className="text-xs font-mono text-pink-600">{sensitivity.toFixed(1)}</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="5.0" 
              step="0.1" 
              value={sensitivity} 
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="accent-pink-500 h-2 md:h-3 w-24 md:w-32 bg-pink-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-[10px] text-gray-500">Adjust if mouth not detecting</div>
          </div>

          {/* Mouth Status */}
          <div className={`px-3 py-1 rounded-full text-xs md:text-sm font-bold transition-all duration-200 border-2 ${isMouthOpen ? 'bg-red-400 text-white border-red-500 shadow-md' : 'bg-gray-100 text-gray-400 border-gray-200'}`}>
            {isMouthOpen ? "MOUTH OPEN 👄" : "MOUTH CLOSED 😐"}
          </div>
        </div>

      </div>

      {gameState === "gameover" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-2xl text-center border-4 md:border-8 border-pink-400 animate-bounce-in w-full max-w-sm md:max-w-md relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-4 bg-pink-400"></div>
            <h2 className="text-4xl md:text-6xl text-pink-500 mb-2 drop-shadow-md mt-4">GAME OVER</h2>
            <div className="text-lg md:text-2xl text-gray-400 mb-6 md:mb-8 font-body">
              {lives <= 0 ? "No Lives Left!" : "Face Lost!"}
            </div>
            
            <div className="bg-yellow-100 p-4 md:p-6 rounded-3xl mb-6 md:mb-8 border-4 border-yellow-300 transform rotate-1">
              <div className="text-xs md:text-sm text-yellow-600 font-bold uppercase tracking-wider">Final Score</div>
              <div className="text-4xl md:text-6xl text-yellow-500 font-pixel mt-2 drop-shadow-sm">{score}</div>
            </div>

            <button 
              onClick={restartGame}
              className="w-full py-3 md:py-4 bg-gradient-to-b from-pink-400 to-pink-500 text-white rounded-2xl font-bold text-xl md:text-2xl shadow-[0_6px_0_#be185d] active:shadow-none active:translate-y-[6px] transition-all hover:brightness-110"
            >
              TRY AGAIN
            </button>
          </div>
        </div>
      )}
      
      {/* Face Missing Overlay */}
      {isFaceMissing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl text-center animate-pulse">
            <div className="text-4xl mb-2">👀</div>
            <h2 className="text-2xl font-bold text-pink-500">FACE LOST!</h2>
            <p className="text-gray-500">Show face to RESTART game</p>
          </div>
        </div>
      )}

      {gameState === "start" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/30 backdrop-blur-sm p-4">
           <div className="bg-white/90 p-6 md:p-10 rounded-[2rem] md:rounded-[3rem] shadow-xl border-4 md:border-8 border-blue-300 text-center animate-pulse w-full max-w-sm md:max-w-lg">
             <h2 className="text-3xl md:text-5xl text-blue-500 mb-4 md:mb-6 font-display">Ready?</h2>
             <p className="text-lg md:text-2xl text-gray-600 mb-6 md:mb-8">Show your face to start!</p>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 text-left bg-blue-50 p-4 md:p-6 rounded-2xl border-2 border-blue-100">
               <div className="flex items-center gap-3">
                 <span className="text-2xl">😐</span>
                 <span className="text-sm font-bold text-gray-500">Move head to AIM</span>
               </div>
               <div className="flex items-center gap-3">
                 <span className="text-2xl">👄</span>
                 <span className="text-sm font-bold text-gray-500">Open mouth to SHOOT</span>
               </div>
               <div className="flex items-center gap-3">
                 <img src={ASSETS.kappa} className="w-8 h-8" alt="enemy"/>
                 <span className="text-sm font-bold text-gray-500">Avoid Enemies</span>
               </div>
               <div className="flex items-center gap-3">
                 <img src={ASSETS.powerup} className="w-8 h-8" alt="powerup"/>
                 <span className="text-sm font-bold text-gray-500">Get Powerups!</span>
               </div>
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
