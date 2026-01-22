import { Camera } from "@mediapipe/camera_utils";
import { FaceMesh, FACEMESH_TESSELATION, Results } from "@mediapipe/face_mesh";
import { useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";

// --- Types ---
type Point = { x: number; y: number };

type ButtonConfig = {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  hoverColor: string;
  activeColor: string;
};

type ButtonAnimation = {
  id: string;
  startTime: number;
  duration: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

type StatusDisplay = {
  label: string;
  color: string;
} | null;

// --- Constants ---
const MOUTH_OPEN_THRESHOLD = 0.05;
const BUTTON_COOLDOWN = 30; // Frames between button presses
const ANIMATION_DURATION = 500; // ms

// --- Factory-style Button Configuration ---
const BUTTONS: ButtonConfig[] = [
  { id: "start", label: "開始", x: 100, y: 150, width: 200, height: 120, color: "#22c55e", hoverColor: "#16a34a", activeColor: "#15803d" },
  { id: "stop", label: "停止", x: 350, y: 150, width: 200, height: 120, color: "#ef4444", hoverColor: "#dc2626", activeColor: "#b91c1c" },
  { id: "pause", label: "一時停止", x: 600, y: 150, width: 200, height: 120, color: "#f59e0b", hoverColor: "#d97706", activeColor: "#b45309" },
  { id: "reset", label: "リセット", x: 850, y: 150, width: 200, height: 120, color: "#3b82f6", hoverColor: "#2563eb", activeColor: "#1d4ed8" },
  { id: "menu1", label: "メニュー1", x: 100, y: 320, width: 200, height: 120, color: "#8b5cf6", hoverColor: "#7c3aed", activeColor: "#6d28d9" },
  { id: "menu2", label: "メニュー2", x: 350, y: 320, width: 200, height: 120, color: "#ec4899", hoverColor: "#db2777", activeColor: "#be185d" },
  { id: "menu3", label: "メニュー3", x: 600, y: 320, width: 200, height: 120, color: "#06b6d4", hoverColor: "#0891b2", activeColor: "#0e7490" },
  { id: "confirm", label: "確認", x: 850, y: 320, width: 200, height: 120, color: "#10b981", hoverColor: "#059669", activeColor: "#047857" },
  { id: "up", label: "▲", x: 350, y: 490, width: 150, height: 100, color: "#64748b", hoverColor: "#475569", activeColor: "#334155" },
  { id: "down", label: "▼", x: 350, y: 610, width: 150, height: 100, color: "#64748b", hoverColor: "#475569", activeColor: "#334155" },
  { id: "left", label: "◀", x: 180, y: 550, width: 150, height: 100, color: "#64748b", hoverColor: "#475569", activeColor: "#334155" },
  { id: "right", label: "▶", x: 520, y: 550, width: 150, height: 100, color: "#64748b", hoverColor: "#475569", activeColor: "#334155" },
  { id: "emergency", label: "緊急停止", x: 750, y: 520, width: 300, height: 180, color: "#dc2626", hoverColor: "#b91c1c", activeColor: "#991b1b" },
];

// --- Audio Context ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

const playSound = (type: "click" | "hover") => {
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === "click") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.1);
    gainNode.gain.setValueAtTime(0.2, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc.start();
    osc.stop(now + 0.15);
  } else if (type === "hover") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(600, now);
    gainNode.gain.setValueAtTime(0.05, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.start();
    osc.stop(now + 0.05);
  }
};

export default function ButtonDemoCanvas() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State
  const [sensitivity, setSensitivity] = useState(1.5);
  const [isMouthOpen, setIsMouthOpen] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [lastPressedButton, setLastPressedButton] = useState<string | null>(null);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [statusDisplay, setStatusDisplay] = useState<StatusDisplay>(null);
  
  // Refs
  const cursorPosRef = useRef<Point>({ x: 640, y: 360 });
  const buttonCooldownRef = useRef(0);
  const prevHoveredRef = useRef<string | null>(null);
  const sensitivityRef = useRef(sensitivity);
  const animationsRef = useRef<ButtonAnimation[]>([]);
  const isMouthOpenRef = useRef(false);
  
  useEffect(() => { sensitivityRef.current = sensitivity; }, [sensitivity]);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString('ja-JP');
    setActionLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 9)]);
  }, []);

  const addAnimation = useCallback((btn: ButtonConfig) => {
    animationsRef.current.push({
      id: btn.id + Date.now(),
      startTime: Date.now(),
      duration: ANIMATION_DURATION,
      x: btn.x,
      y: btn.y,
      width: btn.width,
      height: btn.height,
      color: btn.color,
    });
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

  const checkButtonHover = (x: number, y: number): ButtonConfig | null => {
    for (const btn of BUTTONS) {
      if (x >= btn.x && x <= btn.x + btn.width && y >= btn.y && y <= btn.y + btn.height) {
        return btn;
      }
    }
    return null;
  };

  const drawAnimations = (ctx: CanvasRenderingContext2D) => {
    const now = Date.now();
    
    // Filter out expired animations
    animationsRef.current = animationsRef.current.filter(anim => {
      const elapsed = now - anim.startTime;
      return elapsed < anim.duration;
    });
    
    // Draw active animations
    animationsRef.current.forEach(anim => {
      const elapsed = now - anim.startTime;
      const progress = elapsed / anim.duration;
      
      // Expanding ring animation
      const maxExpand = 50;
      const expand = progress * maxExpand;
      const alpha = 1 - progress;
      
      ctx.save();
      ctx.strokeStyle = anim.color;
      ctx.lineWidth = 6 * (1 - progress);
      ctx.globalAlpha = alpha;
      
      // Draw expanding rectangle
      ctx.strokeRect(
        anim.x - expand,
        anim.y - expand,
        anim.width + expand * 2,
        anim.height + expand * 2
      );
      
      // Draw inner flash
      if (progress < 0.3) {
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = (0.3 - progress) * 2;
        ctx.fillRect(anim.x, anim.y, anim.width, anim.height);
      }
      
      ctx.restore();
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
    
    // Background - Industrial/Factory style
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, width, height);
    
    // Grid pattern for industrial look
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Local variable for mouth state in this frame
    let currentMouthOpen = false;

    // --- Mirror Video Overlay ---
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.globalAlpha = 0.15;
    ctx.drawImage(results.image, 0, 0, width, height);
    ctx.globalAlpha = 1.0;
    
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
      setFaceDetected(true);
      const landmarks = results.multiFaceLandmarks[0];
      
      // Draw face mesh (lighter)
      drawConnectors(ctx, landmarks, FACEMESH_TESSELATION, { color: '#ffffff20', lineWidth: 0.5 });
      
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
      
      currentMouthOpen = ratio > MOUTH_OPEN_THRESHOLD;
      isMouthOpenRef.current = currentMouthOpen;
      setIsMouthOpen(currentMouthOpen);

    } else {
      setFaceDetected(false);
    }
    ctx.restore();

    // Cooldown
    if (buttonCooldownRef.current > 0) {
      buttonCooldownRef.current--;
    }

    // --- Draw Buttons ---
    const hoveredBtn = checkButtonHover(cursorPosRef.current.x, cursorPosRef.current.y);
    
    // Handle hover sound
    if (hoveredBtn && hoveredBtn.id !== prevHoveredRef.current) {
      playSound("hover");
      prevHoveredRef.current = hoveredBtn.id;
    } else if (!hoveredBtn) {
      prevHoveredRef.current = null;
    }
    
    setHoveredButton(hoveredBtn?.id || null);

    BUTTONS.forEach(btn => {
      const isHovered = hoveredBtn?.id === btn.id;
      // Use ref for immediate mouth state
      const isActive = isHovered && isMouthOpenRef.current;
      
      // Button shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(btn.x + 4, btn.y + 4, btn.width, btn.height);
      
      // Button body
      ctx.fillStyle = isActive ? btn.activeColor : (isHovered ? btn.hoverColor : btn.color);
      ctx.fillRect(btn.x, btn.y, btn.width, btn.height);
      
      // Button border
      ctx.strokeStyle = isHovered ? "#ffffff" : "#ffffff60";
      ctx.lineWidth = isHovered ? 4 : 2;
      ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);
      
      // Hover glow effect
      if (isHovered) {
        ctx.shadowColor = btn.color;
        ctx.shadowBlur = 20;
        ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);
        ctx.shadowBlur = 0;
      }
      
      // Button label
      ctx.fillStyle = "#ffffff";
      ctx.font = btn.id === "emergency" ? "bold 36px sans-serif" : "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(btn.label, btn.x + btn.width / 2, btn.y + btn.height / 2);
      
      // Handle button press - use ref for immediate state
      if (isActive && buttonCooldownRef.current <= 0) {
        playSound("click");
        setLastPressedButton(btn.id);
        addLog(`ボタン「${btn.label}」が押されました`);
        buttonCooldownRef.current = BUTTON_COOLDOWN;
        
        // Add animation
        addAnimation(btn);
        
        // Update status display
        if (btn.id === "reset") {
          // Reset button clears status
          setStatusDisplay(null);
        } else {
          // Set status to pressed button
          setStatusDisplay({
            label: btn.label,
            color: btn.color,
          });
        }
      }
    });

    // --- Draw Animations ---
    drawAnimations(ctx);

    // --- Draw Laser Pointer ---
    const pointerX = cursorPosRef.current.x;
    const pointerY = cursorPosRef.current.y;
    
    // Outer glow
    const gradient = ctx.createRadialGradient(pointerX, pointerY, 0, pointerX, pointerY, 40);
    gradient.addColorStop(0, "rgba(255, 0, 0, 0.8)");
    gradient.addColorStop(0.3, "rgba(255, 0, 0, 0.4)");
    gradient.addColorStop(0.6, "rgba(255, 0, 0, 0.1)");
    gradient.addColorStop(1, "rgba(255, 0, 0, 0)");
    
    ctx.beginPath();
    ctx.arc(pointerX, pointerY, 40, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Inner bright dot
    ctx.beginPath();
    ctx.arc(pointerX, pointerY, 8, 0, Math.PI * 2);
    ctx.fillStyle = "#ff0000";
    ctx.fill();
    
    // Center white dot
    ctx.beginPath();
    ctx.arc(pointerX, pointerY, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    
    // Crosshair lines
    ctx.strokeStyle = "rgba(255, 0, 0, 0.6)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    
    // Horizontal line
    ctx.beginPath();
    ctx.moveTo(pointerX - 30, pointerY);
    ctx.lineTo(pointerX - 12, pointerY);
    ctx.moveTo(pointerX + 12, pointerY);
    ctx.lineTo(pointerX + 30, pointerY);
    ctx.stroke();
    
    // Vertical line
    ctx.beginPath();
    ctx.moveTo(pointerX, pointerY - 30);
    ctx.lineTo(pointerX, pointerY - 12);
    ctx.moveTo(pointerX, pointerY + 12);
    ctx.lineTo(pointerX, pointerY + 30);
    ctx.stroke();
    
    ctx.setLineDash([]);

    // --- Header ---
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(0, 0, width, 60);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("タッチレス操作パネル デモ", 20, 40);
    
    ctx.font = "16px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText("工場・現場向けハンズフリー操作システム", width - 20, 40);
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

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden flex flex-col items-center justify-center">
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
      
      {/* Status Display - Top Center (above buttons) */}
      <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-slate-800/95 px-6 py-3 rounded-xl shadow-xl border border-slate-600 min-w-[200px]">
          <div className="flex items-center gap-4">
            <span className="text-white font-bold text-lg">ステータス:</span>
            {statusDisplay ? (
              <div 
                className="px-6 py-2 rounded-lg text-center transition-all duration-300 animate-pulse"
                style={{ backgroundColor: statusDisplay.color }}
              >
                <span className="text-white font-bold text-xl drop-shadow-lg">
                  {statusDisplay.label}
                </span>
              </div>
            ) : (
              <div className="px-6 py-2 rounded-lg bg-slate-700 text-center">
                <span className="text-slate-400 text-xl">-</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="absolute top-20 right-4 z-10 bg-slate-800/95 p-4 rounded-xl shadow-xl border border-slate-600 w-72">
        <h2 className="text-lg font-bold text-white mb-4 border-b border-slate-600 pb-2">操作設定</h2>
        
        {/* Face Detection Status */}
        <div className="flex items-center justify-between mb-4 bg-slate-700 p-3 rounded-lg">
          <span className="text-sm text-slate-300">顔検出</span>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${faceDetected ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
            {faceDetected ? "検出中" : "未検出"}
          </span>
        </div>

        {/* Mouth Status */}
        <div className="flex items-center justify-between mb-4 bg-slate-700 p-3 rounded-lg">
          <span className="text-sm text-slate-300">口の状態</span>
          <span className={`px-3 py-1 rounded-full text-sm font-bold transition-all ${isMouthOpen ? 'bg-red-500 text-white scale-110' : 'bg-slate-500 text-slate-200'}`}>
            {isMouthOpen ? "開いている" : "閉じている"}
          </span>
        </div>

        {/* Sensitivity */}
        <div className="mb-4 bg-slate-700 p-3 rounded-lg">
          <label className="text-sm text-slate-300 flex justify-between mb-2">
            <span>感度</span>
            <span className="bg-slate-600 px-2 rounded text-white">{sensitivity.toFixed(1)}</span>
          </label>
          <input 
            type="range" 
            min="0.5" 
            max="3" 
            step="0.1" 
            value={sensitivity} 
            onChange={(e) => setSensitivity(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Hovered Button */}
        <div className="flex items-center justify-between mb-4 bg-slate-700 p-3 rounded-lg">
          <span className="text-sm text-slate-300">ホバー中</span>
          <span className="text-white font-bold">
            {hoveredButton ? BUTTONS.find(b => b.id === hoveredButton)?.label : "-"}
          </span>
        </div>

        {/* Last Pressed */}
        <div className="flex items-center justify-between bg-slate-700 p-3 rounded-lg">
          <span className="text-sm text-slate-300">最後に押した</span>
          <span className="text-green-400 font-bold">
            {lastPressedButton ? BUTTONS.find(b => b.id === lastPressedButton)?.label : "-"}
          </span>
        </div>
      </div>

      {/* Action Log */}
      <div className="absolute bottom-4 right-4 z-10 bg-slate-800/95 p-4 rounded-xl shadow-xl border border-slate-600 w-72 max-h-60 overflow-hidden">
        <h2 className="text-lg font-bold text-white mb-2 border-b border-slate-600 pb-2">操作ログ</h2>
        <div className="space-y-1 text-sm overflow-y-auto max-h-40">
          {actionLog.length === 0 ? (
            <p className="text-slate-400">操作履歴がありません</p>
          ) : (
            actionLog.map((log, i) => (
              <p key={i} className="text-slate-300 text-xs">{log}</p>
            ))
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-800/95 p-4 rounded-xl shadow-xl border border-slate-600 w-80">
        <h2 className="text-lg font-bold text-white mb-3 border-b border-slate-600 pb-2">操作方法</h2>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3 text-slate-300">
            <span className="text-2xl">👃</span>
            <span>顔を動かしてポインタを移動</span>
          </div>
          <div className="flex items-center gap-3 text-slate-300">
            <span className="text-2xl">👄</span>
            <span>口を開けてボタンを押す</span>
          </div>
          <div className="flex items-center gap-3 text-slate-300">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span>赤いレーザーポインタで照準</span>
          </div>
        </div>
      </div>

      {/* Face Not Detected Warning */}
      {!faceDetected && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border-4 border-yellow-500 text-center max-w-md">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-3xl text-yellow-500 font-bold mb-4">顔が検出されません</h2>
            <p className="text-slate-300 text-lg">カメラに顔を向けてください</p>
          </div>
        </div>
      )}
    </div>
  );
}
