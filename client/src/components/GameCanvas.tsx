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
  type: "missile" | "enemy" | "particle";
  life?: number; // For particles
  image?: HTMLImageElement;
  rotation?: number;
};

// --- Assets ---
const ASSETS = {
  cursor: "/images/player_cursor.png",
  missile: "/images/missile.png",
  enemy1: "/images/enemy_1.png",
  enemy2: "/images/enemy_2.png",
  bg: "/images/game_background.png",
};

// --- Audio Context ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

const playSound = (type: "shoot" | "explosion") => {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  if (type === "shoot") {
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } else if (type === "explosion") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }
};

// --- Constants ---
const MISSILE_SPEED = 15;
const ENEMY_SPEED_BASE = 2;
const SPAWN_RATE = 60; // Frames between spawns
const MOUTH_OPEN_THRESHOLD = 0.05;
const MOUTH_COOLDOWN = 10; // Frames between shots

export default function GameCanvas() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Game State
  const [gameState, setGameState] = useState<GameState>("start");
  const [score, setScore] = useState(0);
  const [sensitivity, setSensitivity] = useState(1.5);
  const [isMouthOpen, setIsMouthOpen] = useState(false);
  
  // Refs for game loop logic (mutable state without re-renders)
  const cursorPosRef = useRef<Point>({ x: 0.5, y: 0.5 });
  const entitiesRef = useRef<Entity[]>([]);
  const frameCountRef = useRef(0);
  const mouthCooldownRef = useRef(0);
  const scoreRef = useRef(0);
  const imagesRef = useRef<Record<string, HTMLImageElement>>({});
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  // Load images on mount
  useEffect(() => {
    const loadImg = (src: string) => {
      const img = new Image();
      img.src = src;
      return img;
    };
    
    imagesRef.current = {
      cursor: loadImg(ASSETS.cursor),
      missile: loadImg(ASSETS.missile),
      enemy1: loadImg(ASSETS.enemy1),
      enemy2: loadImg(ASSETS.enemy2),
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
  }, [sensitivity]); // Re-init if sensitivity changes? No, sensitivity is used in onResults. 
  // Actually onResults is a closure, so it captures 'sensitivity'. 
  // To avoid re-creating FaceMesh, we should use a ref for sensitivity or update the closure.
  // For simplicity, let's use a ref for sensitivity.
  const sensitivityRef = useRef(sensitivity);
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);
  
  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);


  const spawnEnemy = (width: number, height: number) => {
    const isType1 = Math.random() > 0.5;
    const size = 60;
    const x = Math.random() * (width - size);
    const y = -size; // Start above screen
    
    entitiesRef.current.push({
      id: Math.random(),
      x,
      y,
      width: size,
      height: size,
      vx: (Math.random() - 0.5) * 2, // Slight horizontal drift
      vy: ENEMY_SPEED_BASE + Math.random() * 2,
      type: "enemy",
      image: isType1 ? imagesRef.current.enemy1 : imagesRef.current.enemy2,
    });
  };

  const spawnMissile = (x: number, y: number) => {
    entitiesRef.current.push({
      id: Math.random(),
      x: x - 20, // Center missile
      y: y - 40,
      width: 40,
      height: 40,
      vx: 0,
      vy: -MISSILE_SPEED,
      type: "missile",
      image: imagesRef.current.missile,
    });
    
    playSound("shoot");
  };

  const spawnExplosion = (x: number, y: number) => {
    // Create particles
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 5;
      entitiesRef.current.push({
        id: Math.random(),
        x,
        y,
        width: 10,
        height: 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        type: "particle",
        life: 20,
      });
    }
  };

  const updateGameLogic = (width: number, height: number) => {
    if (gameStateRef.current !== "playing") return;

    frameCountRef.current++;

    // Spawn Enemies
    if (frameCountRef.current % SPAWN_RATE === 0) {
      spawnEnemy(width, height);
    }

    // Update Entities
    entitiesRef.current.forEach(entity => {
      entity.x += entity.vx;
      entity.y += entity.vy;
      
      if (entity.type === "particle" && entity.life !== undefined) {
        entity.life--;
      }
    });

    // Remove dead entities
    entitiesRef.current = entitiesRef.current.filter(e => {
      if (e.type === "particle") return (e.life || 0) > 0;
      // Out of bounds
      if (e.y > height + 100 || e.y < -100 || e.x < -100 || e.x > width + 100) {
        // If enemy passes bottom, maybe lose life? For now just remove.
        return false;
      }
      return true;
    });

    // Collision Detection
    const missiles = entitiesRef.current.filter(e => e.type === "missile");
    const enemies = entitiesRef.current.filter(e => e.type === "enemy");

    missiles.forEach(m => {
      enemies.forEach(e => {
        if (
          m.x < e.x + e.width &&
          m.x + m.width > e.x &&
          m.y < e.y + e.height &&
          m.y + m.height > e.y
        ) {
          // Hit!
          spawnExplosion(e.x + e.width/2, e.y + e.height/2);
          playSound("explosion");
          
          // Mark for removal (hacky way: move off screen)
          m.y = -999;
          e.y = height + 999;
          
          scoreRef.current += 100;
          setScore(scoreRef.current);
        }
      });
    });
  };

  const onResults = (results: Results) => {
    if (!canvasRef.current || !webcamRef.current?.video) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear and Draw Background
    ctx.clearRect(0, 0, width, height);
    
    // Draw Background Image (if loaded)
    if (bgImageRef.current) {
      ctx.drawImage(bgImageRef.current, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#fce7f3"; // Fallback pink
      ctx.fillRect(0, 0, width, height);
    }

    // --- Mirror Video Overlay ---
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.2; // Faint overlay
    ctx.drawImage(results.image, 0, 0, width, height);
    ctx.globalAlpha = 1.0;
    
    // Draw Face Mesh (Subtle)
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      const landmarks = results.multiFaceLandmarks[0];
      drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, { color: '#FFFFFF40', lineWidth: 1 });
      
      // --- Control Logic ---
      // 1. Cursor Position (Nose Tip)
      const nose = landmarks[1];
      const centerX = 0.5;
      const centerY = 0.5;
      
      // Calculate movement delta
      const diffX = (nose.x - centerX) * sensitivityRef.current;
      const diffY = (nose.y - centerY) * sensitivityRef.current;
      
      let newX = centerX + diffX;
      let newY = centerY + diffY;
      
      // Clamp
      newX = Math.max(0, Math.min(1, newX));
      newY = Math.max(0, Math.min(1, newY));
      
      // Update Cursor Ref (Mirrored X for logic)
      // Visual X on screen (0=left, 1=right) is 1-newX because of mirror transform
      // But wait, we are drawing GAME elements on a non-mirrored context (restored context).
      // So if I move my head left (image right), I want cursor on left.
      // MediaPipe X: 0=left(my right), 1=right(my left).
      // If I move left, X increases.
      // So visual X should be 1 - newX.
      const visualX = (1 - newX) * width;
      const visualY = newY * height;
      
      cursorPosRef.current = { x: visualX, y: visualY };

      // 2. Mouth Open (Shooting)
      const upperLip = landmarks[13];
      const lowerLip = landmarks[14];
      const topHead = landmarks[10];
      const chin = landmarks[152];
      
      const mouthDist = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
      const faceHeight = Math.hypot(topHead.x - chin.x, topHead.y - chin.y);
      const ratio = mouthDist / faceHeight;
      
      const isOpen = ratio > MOUTH_OPEN_THRESHOLD;
      setIsMouthOpen(isOpen);

      if (gameStateRef.current === "start") {
        setGameState("playing");
      }
      
      // Shoot logic
      if (isOpen && mouthCooldownRef.current <= 0 && gameStateRef.current === "playing") {
        spawnMissile(visualX, visualY);
        mouthCooldownRef.current = MOUTH_COOLDOWN;
      }
      
      if (mouthCooldownRef.current > 0) {
        mouthCooldownRef.current--;
      }

    } else {
      // Face Lost
      if (gameStateRef.current === "playing") {
        setGameState("gameover");
      }
    }
    ctx.restore(); // End Mirror Transform

    // --- Game Loop Update ---
    updateGameLogic(width, height);

    // --- Draw Game Entities (Non-mirrored coordinates) ---
    // Cursor
    const cursorSize = 60;
    if (imagesRef.current.cursor) {
      ctx.drawImage(
        imagesRef.current.cursor, 
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
        ctx.drawImage(e.image, e.x, e.y, e.width, e.height);
      }
    });
  };

  // Helper for drawing connectors
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
        width={1280}
        height={720}
      />
      
      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 p-6 rounded-[2rem] shadow-[0_8px_0_rgba(0,0,0,0.1)] border-4 border-pink-300 backdrop-blur-sm w-72 transform transition-all hover:scale-105">
        <h1 className="text-4xl text-pink-500 mb-4 drop-shadow-sm text-center tracking-wider" style={{ textShadow: '2px 2px 0px #fbcfe8' }}>Face Shooter</h1>
        
        <div className="flex items-center justify-between mb-4 bg-yellow-100 p-3 rounded-xl border-2 border-yellow-300">
           <span className="text-xl text-yellow-600 font-bold">SCORE</span>
           <span className="text-3xl text-yellow-600 font-pixel tracking-widest">{score.toString().padStart(6, '0')}</span>
        </div>

        <div className="flex flex-col gap-2 bg-pink-50 p-4 rounded-xl border-2 border-pink-100">
          <label className="text-sm font-bold text-pink-400 flex justify-between uppercase tracking-wide">
            <span>Sensitivity</span>
            <span className="bg-pink-200 px-2 rounded text-pink-600">{sensitivity.toFixed(1)}</span>
          </label>
          <input 
            type="range" 
            min="1" 
            max="3" 
            step="0.1" 
            value={sensitivity} 
            onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            className="accent-pink-500 h-3 bg-pink-200 rounded-lg appearance-none cursor-pointer hover:bg-pink-300 transition-colors"
          />
        </div>
        
        <div className="mt-4 flex items-center justify-between text-sm text-gray-500 font-bold bg-gray-50 p-3 rounded-xl border-2 border-gray-100">
          <span className="uppercase tracking-wide text-gray-400">Mouth Status</span>
          <span className={`px-3 py-1 rounded-full transition-all duration-200 transform ${isMouthOpen ? 'bg-red-400 text-white scale-110 shadow-md' : 'bg-gray-200 text-gray-500'}`}>
            {isMouthOpen ? "OPEN 👄" : "CLOSED 😐"}
          </span>
        </div>
      </div>

      {gameState === "gameover" && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl text-center border-8 border-pink-400 animate-bounce-in max-w-md w-full">
            <h2 className="text-6xl text-pink-500 mb-2 drop-shadow-md">GAME OVER</h2>
            <div className="text-2xl text-gray-400 mb-8 font-body">Face Lost!</div>
            
            <div className="bg-yellow-100 p-4 rounded-2xl mb-8 border-2 border-yellow-300">
              <div className="text-sm text-yellow-600 font-bold uppercase tracking-wider">Final Score</div>
              <div className="text-5xl text-yellow-500 font-pixel mt-1">{score}</div>
            </div>

            <button 
              onClick={restartGame}
              className="w-full py-4 bg-gradient-to-b from-pink-400 to-pink-500 text-white rounded-2xl font-bold text-2xl shadow-[0_6px_0_#be185d] active:shadow-none active:translate-y-[6px] transition-all hover:brightness-110"
            >
              TRY AGAIN
            </button>
          </div>
        </div>
      )}
      
      {gameState === "start" && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-white/30 backdrop-blur-sm">
           <div className="bg-white/90 p-8 rounded-[2rem] shadow-xl border-4 border-blue-300 text-center animate-pulse">
             <h2 className="text-4xl text-blue-500 mb-4">Ready?</h2>
             <p className="text-xl text-gray-600">Show your face to start!</p>
             <div className="mt-4 text-sm text-gray-400">
               Move head to aim • Open mouth to shoot
             </div>
           </div>
        </div>
      )}
    </div>
  );
}
