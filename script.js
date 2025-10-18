// --- Morse dictionary
const MORSE = {
    '.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I','.---':'J',
    '-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R','...':'S','-':'T',
    '..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z',
    '.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7','---..':'8','----.':'9','-----':'0'
};

// UI elements
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const decodedEl = document.getElementById('decoded');
const modeLabel = document.getElementById('modeLabel');
const blinkDot = document.getElementById('blinkDot');

// Buttons
const eyeModeBtn = document.getElementById('eyeMode');
const lightModeBtn = document.getElementById('lightMode');
const clearBtn = document.getElementById('clearBtn');
const spaceBtn = document.getElementById('spaceBtn');

// Timing inputs
const dotInput = document.getElementById('dotInput');
const dashInput = document.getElementById('dashInput');
const symbolGapInput = document.getElementById('symbolGap');
const letterGapInput = document.getElementById('letterGap');
const wordGapInput = document.getElementById('wordGap');

// State
let mode = 'eyes';
let selecting = false; let roi = null; // {x,y,w,h}
let startX=0, startY=0;

// Morse decoding state
let isBlinking = false;
let blinkStart = null;
let lastBlinkEnd = null;
let currentMorse = '';
let decodedText = '';
let letterTimeout = null;
let wordTimeout = null;

// Detection smoothing
const detectBuffer = [];
const detectBufLen = 5;

// Canvas sizing helper
function resizeOverlay(){
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
}

// ROI mouse handlers
overlay.addEventListener('mousedown', (e)=>{
    selecting = true; startX = e.offsetX; startY = e.offsetY; roi = {x:startX,y:startY,w:0,h:0};
});
overlay.addEventListener('mousemove', (e)=>{
    if(selecting && roi){ roi.w = e.offsetX - startX; roi.h = e.offsetY - startY; drawOverlay(); }
});
overlay.addEventListener('mouseup', (e)=>{ selecting=false; if(roi){ if(roi.w<0){roi.x+=roi.w; roi.w=Math.abs(roi.w);} if(roi.h<0){roi.y+=roi.h; roi.h=Math.abs(roi.h);} } drawOverlay(); });
overlay.addEventListener('dblclick', ()=>{ roi=null; drawOverlay(); });

// Mode buttons
eyeModeBtn.addEventListener('click', ()=>{ mode='eyes'; modeLabel.textContent='Eye Blink'; eyeModeBtn.classList.add('active'); lightModeBtn.classList.remove('active'); });
lightModeBtn.addEventListener('click', ()=>{ mode='light'; modeLabel.textContent='Light Detection'; lightModeBtn.classList.add('active'); eyeModeBtn.classList.remove('active'); });
clearBtn.addEventListener('click', ()=>{ decodedText=''; currentMorse=''; updateDecoded(); });
spaceBtn.addEventListener('click', ()=>{ decodedText += ' '; updateDecoded(); });

function updateDecoded(){ decodedEl.textContent = decodedText; }

// Utility distance
function dist(a,b){const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy);}

// EAR (eye aspect ratio) calculation using MediaPipe landmark indices
const LEFT = [33,160,158,133,153,144];
const RIGHT = [362,385,387,263,373,380];

function computeEAR(landmarks, eyeIdx){
    const p1 = landmarks[eyeIdx[0]]; const p2 = landmarks[eyeIdx[1]]; const p3 = landmarks[eyeIdx[2]];
    const p4 = landmarks[eyeIdx[3]]; const p5 = landmarks[eyeIdx[4]]; const p6 = landmarks[eyeIdx[5]];
    // convert normalized to pixel coords
    const toPx = (p)=>({x:p.x*overlay.width, y:p.y*overlay.height});
    const P1=toPx(p1),P2=toPx(p2),P3=toPx(p3),P4=toPx(p4),P5=toPx(p5),P6=toPx(p6);
    const A = dist(P2,P6); const B = dist(P3,P5); const C = dist(P1,P4);
    if(C===0) return 1.0; return (A+B)/(2.0*C);
}

// Process detection result (true=blink/LED-on)
function processDetection(detected){
    const now = performance.now();
    detectBuffer.push(detected); if(detectBuffer.length>detectBufLen) detectBuffer.shift();
    const smoothed = detectBuffer.filter(x=>x).length > Math.floor(detectBuffer.length/2);

    if(smoothed && !isBlinking){
    // Blink started
    blinkStart = now; 
    isBlinking = true;
    
    // Clear any pending timeouts since we're adding more to the letter
    if(letterTimeout) {
        clearTimeout(letterTimeout);
        letterTimeout = null;
    }
    if(wordTimeout) {
        clearTimeout(wordTimeout);
        wordTimeout = null;
    }
    
    } else if(!smoothed && isBlinking){
    // Blink ended
    const blinkDuration = now - blinkStart;
    lastBlinkEnd = now; 
    isBlinking = false;
    
    // Determine if it's a dot or dash based on duration
    if(blinkDuration < Number(dotInput.value)){
        currentMorse += '.';
    } else if(blinkDuration < Number(dashInput.value)){
        currentMorse += '-';
    } else {
        // Very long blink, treat as dash
        currentMorse += '-';
    }
    
    // Set timeouts for letter and word completion
    letterTimeout = setTimeout(() => {
        decodeCurrent();
    }, Number(letterGapInput.value));
    
    wordTimeout = setTimeout(() => {
        if(currentMorse) decodeCurrent();
        decodedText += ' ';
        updateDecoded();
    }, Number(wordGapInput.value));
    }

    // update indicator
    if(isBlinking){ blinkDot.style.background='red'; } else { blinkDot.style.background='transparent'; }
}

function decodeCurrent(){ 
    if(currentMorse && MORSE[currentMorse]){ 
    decodedText += MORSE[currentMorse]; 
    updateDecoded();
    } else if(currentMorse) {
    // Show unrecognized pattern
    decodedText += '[' + currentMorse + '?]';
    updateDecoded();
    }
    currentMorse = ''; 
}

// Light detection: compute max brightness of ROI or frame
function detectLight(frame){
    // frame is ImageData from canvas
    const data = frame.data; let maxB=0; for(let i=0;i<data.length;i+=4){ // use luminance
    const r=data[i], g=data[i+1], b=data[i+2]; const lum = 0.2126*r + 0.7152*g + 0.0722*b; if(lum>maxB) maxB=lum; }
    return maxB > 200; // threshold similar to python
}

// Draw overlay (face mesh + ROI + text)
function drawOverlay(meshLandmarks){
    ctx.clearRect(0,0,overlay.width,overlay.height);
    // draw ROI
    if(roi){ ctx.save(); ctx.strokeStyle='rgba(0,255,120,0.8)'; ctx.lineWidth=2; ctx.setLineDash([6,4]); ctx.strokeRect(roi.x,roi.y,roi.w,roi.h); ctx.restore(); }
    // draw landmarks small
    if(meshLandmarks){ ctx.fillStyle='rgba(255,255,255,0.5)'; meshLandmarks.forEach(p=>{ ctx.beginPath(); ctx.arc(p.x*overlay.width, p.y*overlay.height, 1.4,0,Math.PI*2); ctx.fill(); }); }
    // show current morse
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(8, overlay.height-78, overlay.width-16, 64);
    ctx.fillStyle='#bff6ff'; ctx.font='20px monospace'; ctx.fillText('Current: ' + currentMorse, 16, overlay.height-46);
    ctx.fillStyle='#dff6fb'; ctx.font='18px sans-serif'; ctx.fillText(decodedText.slice(-60), 16, overlay.height-20);
}

// --- MediaPipe FaceMesh setup ---
const faceMesh = new FaceMesh({locateFile: (file)=>{
    return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
}});
faceMesh.setOptions({maxNumFaces:1, refineLandmarks:true, minDetectionConfidence:0.5, minTrackingConfidence:0.5});

faceMesh.onResults((results)=>{
    if(!video.videoWidth) return;
    resizeOverlay();
    let landmarks = null;
    if(results.multiFaceLandmarks && results.multiFaceLandmarks.length>0){
    landmarks = results.multiFaceLandmarks[0];
    }
    // in eye mode compute EAR
    if(mode==='eyes'){
    if(landmarks){
        const leftEAR = computeEAR(landmarks, LEFT);
        const rightEAR = computeEAR(landmarks, RIGHT);
        const ear = (leftEAR + rightEAR)/2.0;
        // threshold ~0.20 for closed eyes (tweakable)
        const closed = ear < 0.21;
        processDetection(closed);
    } else {
        // if no face detected treat as open
        processDetection(false);
    }
    } else {
    // light mode: capture ROI from video to temp canvas
    const tmp = document.createElement('canvas'); tmp.width = video.videoWidth; tmp.height = video.videoHeight; const tctx = tmp.getContext('2d');
    tctx.drawImage(video, 0, 0, tmp.width, tmp.height);
    let imgData;
    if(roi){ // scale ROI to video coordinates
        const r = {x: Math.max(0,roi.x), y: Math.max(0,roi.y), w: Math.max(1,roi.w), h: Math.max(1,roi.h)};
        imgData = tctx.getImageData(r.x, r.y, r.w, r.h);
    } else {
        imgData = tctx.getImageData(0,0,tmp.width,tmp.height);
    }
    const lightOn = detectLight(imgData);
    processDetection(lightOn);
    }

    drawOverlay(landmarks);
});

// --- Camera utils ---
let camera = null;
async function startCamera(){
    try{
    await navigator.mediaDevices.getUserMedia({video:{width:1280,height:720}, audio:false});
    }catch(e){ console.error('Camera permission denied or not available', e); alert('Camera access required. Use HTTPS or localhost.'); return; }

    camera = new Camera(video, {onFrame: async ()=>{ await faceMesh.send({image:video}); }, width:1280, height:720});
    camera.start();
}

// Resize overlay when video ready
video.addEventListener('loadeddata', ()=>{ resizeOverlay(); });

// Kick off
startCamera();

// Accessibility: keyboard shortcuts
window.addEventListener('keydown',(e)=>{ 
    if(e.code==='Space'){ e.preventDefault(); decodedText+=' '; updateDecoded(); } 
    if(e.code==='KeyC'){ decodedText=''; currentMorse=''; updateDecoded(); } 
    if(e.code==='KeyE'){ mode='eyes'; modeLabel.textContent='Eye Blink'; eyeModeBtn.classList.add('active'); lightModeBtn.classList.remove('active'); } 
    if(e.code==='KeyL'){ mode='light'; modeLabel.textContent='Light Detection'; lightModeBtn.classList.add('active'); eyeModeBtn.classList.remove('active'); } 
});
