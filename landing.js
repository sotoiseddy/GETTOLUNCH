// --- Random swiggle background ---
const bgCanvas = document.getElementById('bgCanvas');
const bgCtx = bgCanvas.getContext('2d');
let bgW, bgH;

function resizeBg() {
  bgW = window.innerWidth;
  bgH = window.innerHeight;
  bgCanvas.width = bgW;
  bgCanvas.height = bgH;
  drawSwiggles();
}

function drawSwiggles() {
  bgCtx.clearRect(0, 0, bgW, bgH);
  const colors = ['#ffb3ba','#ffdfba','#ffffba','#baffc9','#a0e7e5','#bae1ff','#e8baff','#ffb3e6'];
  for (let i = 0; i < 30; i++) {
    const x = Math.random() * bgW;
    const y = Math.random() * bgH;
    const cpx1 = x + (Math.random() - 0.5) * 300;
    const cpy1 = y + (Math.random() - 0.5) * 300;
    const cpx2 = x + (Math.random() - 0.5) * 300;
    const cpy2 = y + (Math.random() - 0.5) * 300;
    const ex = x + (Math.random() - 0.5) * 200;
    const ey = y + (Math.random() - 0.5) * 200;
    bgCtx.beginPath();
    bgCtx.moveTo(x, y);
    bgCtx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, ex, ey);
    bgCtx.strokeStyle = colors[Math.floor(Math.random() * colors.length)];
    bgCtx.lineWidth = 2 + Math.random() * 4;
    bgCtx.lineCap = 'round';
    bgCtx.globalAlpha = 0.6 + Math.random() * 0.4;
    bgCtx.stroke();
    bgCtx.globalAlpha = 1;
  }
}

window.addEventListener('resize', resizeBg);
resizeBg();

// --- UI ---
const nameInput = document.getElementById('name');
const createBtn = document.getElementById('createBtn');
const roomCodeInput = document.getElementById('roomCode');
const joinBtn = document.getElementById('joinBtn');
const errorMsg = document.getElementById('errorMsg');

function getName() {
  const name = nameInput.value.trim();
  if (!name) {
    errorMsg.textContent = 'Please enter your name';
    return null;
  }
  errorMsg.textContent = '';
  return name;
}

createBtn.addEventListener('click', async () => {
  const name = getName();
  if (name) {
    try {
      const res = await fetch('/api/create', { method: 'POST' });
      const data = await res.json();
      window.location.href = `draw.html?room=${data.room}&name=${encodeURIComponent(name)}`;
    } catch {
      errorMsg.textContent = 'Failed to create room';
    }
  }
});

joinBtn.addEventListener('click', () => {
  const name = getName();
  const code = roomCodeInput.value.trim().toUpperCase();
  if (!name) return;
  if (code.length !== 6) {
    errorMsg.textContent = 'Enter a valid 6-character room code';
    return;
  }
  const ws = new WebSocket(`ws://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', room: code, name }));
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'error') {
      errorMsg.textContent = msg.message;
      ws.close();
    } else if (msg.type === 'room_joined') {
      ws.close();
      window.location.href = `draw.html?room=${code}&name=${encodeURIComponent(name)}`;
    }
  };
});

nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createBtn.click(); });
roomCodeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinBtn.click(); });
