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
  cursor: "/images/player_closed.png",
  cursorOpen: "/images/player_open.png",
  missile: "/images/projectile_voice.png",
  enemy1: "/images/enemy_1.png", // Keep old ones as fallback or mix
  enemy2: "/images/enemy_2.png",
  kappa: "/images/yokai_kappa.png",
  umbrella: "/images/yokai_umbrella.png",
  lantern: "/images/yokai_lantern.png",
  powerup: "/images/item_powerup.png",
  bg: "/images/game_background.png",
  heart: "/images/icon_heart.png",
};

// --- Audio Context ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

const playSound = (type: "shoot" | "explosion" | "damage" | "powerup" | "gameover") => {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === "shoot") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
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
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [sensitivity, setSensitivity] = useState(1.5);
  const [isMouthOpen, setIsMouthOpen] = useState(false);
  const [powerLevel, setPowerLevel] = useState(1); // 1: Normal, 2: Double, 3: Triple
  const [windowSize, setWindowSize] = useState({ width: 1280, height: 720 });
  
  // Refs for game loop logic
  const cursorPosRef = useRef<Point>({ x: 0.5, y: 0.5 });
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
      cursor: loadImg(ASSETS.cursor),
      cursorOpen: loadImg(ASSETS.cursorOpen),
      missile: loadImg(ASSETS.missile),
      enemy1: loadImg(ASSETS.enemy1),
      enemy2: loadImg(ASSETS.enemy2),
      kappa: loadImg(ASSETS.kappa),
      umbrella: loadImg(ASSETS.umbrella),
      lantern: loadImg(ASSETS.lantern),
      powerup: loadImg(ASSETS.powerup),
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

  const spawnEnemy = (width: number, height: number) => {
    const rand = Math.random();
    let type: "kappa" | "umbrella" | "lantern" = "kappa";
    let img = imagesRef.current.kappa;
    let speed = ENEMY_SPEED_BASE;
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

    frameCountRef.current++;
    if (damageEffectRef.current > 0) damageEffectRef.current--;

    // Spawn Enemies
    if (frameCountRef.current % SPAWN_RATE === 0) {
      spawnEnemy(width, height);
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
          
          scoreRef.current += 100;
          setScore(scoreRef.current);
        }
      });
    });

    // 2. Player vs Enemy (Collision)
    enemies.forEach(e => {
      if (
        playerHitbox.x < e.x + e.width &&
        playerHitbox.x + playerHitbox.width > e.x &&
        playerHitbox.y < e.y + e.height &&
        playerHitbox.y + playerHitbox.height > e.y
      ) {
        spawnExplosion(e.x + e.width/2, e.y + e.height/2, "red");
        takeDamage();
        e.y = height + 999; // Remove enemy
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
    } else {
      ctx.fillStyle = "#fce7f3";
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

      // Auto Start
      if (gameStateRef.current === "start") {
        setGameState("playing");
      }
      
      // Shoot
      if (isOpen && mouthCooldownRef.current <= 0 && gameStateRef.current === "playing") {
        spawnMissile(visualX, visualY);
        mouthCooldownRef.current = MOUTH_COOLDOWN;
      }
      
      if (mouthCooldownRef.current > 0) {
        mouthCooldownRef.current--;
      }

    } else {
      faceDetectedRef.current = false;
    }
    ctx.restore();

    // --- Game Loop Update ---
    updateGameLogic(width, height);

    // --- Draw Game Entities ---
    
    // Player Character (Cursor)
    const isMobile = width < 600;
    const cursorSize = isMobile ? 60 : 80;
    const playerImg = isMouthOpen ? imagesRef.current.cursorOpen : imagesRef.current.cursor;
    
    if (playerImg) {
      ctx.drawImage(
        playerImg, 
        cursorPosRef.current.x - cursorSize/2, 
        cursorPosRef.current.y - cursorSize/2, 
        cursorSize, 
        cursorSize
      );
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
          
          {/* Sensitivity Slider - Compact on mobile */}
          <div className="flex items-center gap-2 bg-white/80 backdrop-blur-sm p-2 rounded-xl border-2 border-pink-200 shadow-sm">
            <span className="text-xs md:text-sm font-bold text-pink-400 uppercase">SENS</span>
            <input 
              type="range" 
              min="1" 
              max="3" 
              step="0.1" 
              value={sensitivity} 
              onChange={(e) => setSensitivity(parseFloat(e.target.value))}
              className="accent-pink-500 h-2 md:h-3 w-20 md:w-32 bg-pink-200 rounded-lg appearance-none cursor-pointer"
            />
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
