(() => {
  const pencilBtn = document.getElementById('pencil');
  const eraserBtn = document.getElementById('eraser');
  const blenderBtn = document.getElementById('blender');
  const sizeInput = document.getElementById('size');
  const colorInput = document.getElementById('color');
  const blendStrengthInput = document.getElementById('blendOpacity');
  const clearBtn = document.getElementById('clear');

  let drawing = false;
  let currentColor = colorInput.value;
  let tool = 'pencil';
  let lastPos = null;
  let ctx = null;

  let strokes = [];
  let currentStroke = null;

  let blendCanvas = null;
  let blendCtx = null;

  function createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.id = 'drawCanvas';
    canvas.style.position = 'fixed';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.touchAction = 'none';
    document.body.appendChild(canvas);
    return canvas;
  }

  function resizeCanvas(canvas) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    blendCanvas = document.createElement('canvas');
    blendCanvas.width = canvas.width;
    blendCanvas.height = canvas.height;
    blendCtx = blendCanvas.getContext('2d');

    renderAll();
  }

  function setTool(t) {
    tool = t;
    pencilBtn.classList.toggle('active', t === 'pencil');
    eraserBtn.classList.toggle('active', t === 'eraser');
    blenderBtn.classList.toggle('active', t === 'blender');
  }

  function getPos(e) {
    const rect = ctx.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function renderAll() {
    const c = ctx.canvas;
    const w = c.width;
    const h = c.height;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (const stroke of strokes) {
      renderStroke(stroke);
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (blendCanvas) {
      ctx.drawImage(blendCanvas, 0, 0);
    }
    ctx.restore();

    if (currentStroke && currentStroke.points.length > 1) {
      renderStroke(currentStroke);
    }
  }

  function renderStroke(stroke) {
    const pts = stroke.points;
    if (pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.lineWidth = stroke.size;

    if (stroke.tool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = stroke.color;
      ctx.globalAlpha = 1;
    }

    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function doBlend(pos, prevPos, size, strength) {
    const dpr = window.devicePixelRatio || 1;
    const cx = Math.round(pos.x * dpr);
    const cy = Math.round(pos.y * dpr);
    const radius = Math.min(Math.round(size * dpr / 2), 100);
    const pad = Math.max(4, Math.round(radius * 1.5));
    const diameter = Math.min(radius * 2 + pad * 2, 300);
    if (diameter < 3) return;

    const offset = Math.round(diameter / 2);
    let startX = cx - offset;
    let startY = cy - offset;

    const c = ctx.canvas;
    startX = Math.max(0, Math.min(startX, c.width - diameter));
    startY = Math.max(0, Math.min(startY, c.height - diameter));

    const actualW = Math.min(diameter, c.width - startX);
    const actualH = Math.min(diameter, c.height - startY);
    if (actualW < 3 || actualH < 3) return;

    const imageData = ctx.getImageData(startX, startY, actualW, actualH);
    const pixels = imageData.data;

    const src = new Uint8ClampedArray(pixels);

    const dx = Math.round((pos.x - prevPos.x) * dpr);
    const dy = Math.round((pos.y - prevPos.y) * dpr);
    const hasMovement = (dx !== 0 || dy !== 0);

    const mixKernelRadius = Math.max(1, Math.round(radius * 0.35));

    for (let py = 0; py < actualH; py++) {
      for (let px = 0; px < actualW; px++) {
        const rdx = px - offset;
        const rdy = py - offset;
        const dist = Math.sqrt(rdx * rdx + rdy * rdy);
        if (dist > radius) continue;

        const idx = (py * actualW + px) * 4;
        const falloff = 1 - (dist / radius);

        let srcOffX = 0;
        let srcOffY = 0;

        if (hasMovement) {
          const pull = falloff * 5;
          const signX = dx >= 0 ? 1 : -1;
          const signY = dy >= 0 ? 1 : -1;
          srcOffX = -signX * Math.round(pull * Math.abs(dx) / Math.max(Math.abs(dx) + Math.abs(dy), 1));
          srcOffY = -signY * Math.round(pull * Math.abs(dy) / Math.max(Math.abs(dx) + Math.abs(dy), 1));

          const angle = Math.atan2(rdy, rdx);
          const sw = falloff * 1.5;
          srcOffX += Math.round(Math.cos(angle + Math.PI / 3) * sw);
          srcOffY += Math.round(Math.sin(angle + Math.PI / 3) * sw);
        } else {
          const angle = Math.atan2(rdy, rdx);
          const sw = falloff * 3;
          srcOffX = Math.round(Math.cos(angle + Math.PI / 2) * sw);
          srcOffY = Math.round(Math.sin(angle + Math.PI / 2) * sw);
        }

        let r = 0, g = 0, b = 0, count = 0;
        for (let ky = -mixKernelRadius; ky <= mixKernelRadius; ky++) {
          for (let kx = -mixKernelRadius; kx <= mixKernelRadius; kx++) {
            if (kx * kx + ky * ky > mixKernelRadius * mixKernelRadius) continue;
            const ni = (py + ky + srcOffY) * actualW + (px + kx + srcOffX);
            if (ni >= 0 && ni < actualW * actualH) {
              r += src[ni * 4];
              g += src[ni * 4 + 1];
              b += src[ni * 4 + 2];
              count++;
            }
          }
        }

        if (count > 0) {
          const mix = strength * falloff * 0.6;
          pixels[idx] = pixels[idx] * (1 - mix) + (r / count) * mix;
          pixels[idx + 1] = pixels[idx + 1] * (1 - mix) + (g / count) * mix;
          pixels[idx + 2] = pixels[idx + 2] * (1 - mix) + (b / count) * mix;
        }
      }
    }

    ctx.putImageData(imageData, startX, startY);
    blendCtx.putImageData(imageData, startX, startY);
  }

  function pointerDown(e) {
    drawing = true;
    const pos = getPos(e);
    lastPos = pos;

    if (tool === 'blender') {
      doBlend(pos, pos, parseInt(sizeInput.value, 10) || 4,
              parseFloat(blendStrengthInput.value) || 0.5);
    } else {
      currentStroke = {
        tool: tool,
        color: currentColor,
        size: parseInt(sizeInput.value, 10) || 4,
        points: [pos]
      };
    }
  }

  function pointerMove(e) {
    if (!drawing) return;
    const pos = getPos(e);

    if (tool === 'blender') {
      const steps = Math.max(Math.round(dist(pos, lastPos) / 2), 1);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const ip = {
          x: lastPos.x + (pos.x - lastPos.x) * t,
          y: lastPos.y + (pos.y - lastPos.y) * t
        };
        const pp = {
          x: lastPos.x + (pos.x - lastPos.x) * (t - 1/steps),
          y: lastPos.y + (pos.y - lastPos.y) * (t - 1/steps)
        };
        doBlend(ip, pp,
          parseInt(sizeInput.value, 10) || 4,
          parseFloat(blendStrengthInput.value) || 0.5
        );
      }
      lastPos = pos;
    } else {
      currentStroke.points.push(pos);
      lastPos = pos;
      if (currentStroke.points.length > 1) {
        renderAll();
      }
    }
  }

  function dist(a, b) {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
  }

  function pointerUp() {
    if (tool !== 'blender' && currentStroke && currentStroke.points.length > 1) {
      strokes.push(currentStroke);
    }
    drawing = false;
    lastPos = null;
    currentStroke = null;
  }

  const canvas = createCanvas();
  ctx = canvas.getContext('2d');
  resizeCanvas(canvas);

  window.addEventListener('resize', () => resizeCanvas(canvas));
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('pointermove', pointerMove);
  window.addEventListener('pointerup', pointerUp);

  pencilBtn.addEventListener('click', () => setTool('pencil'));
  eraserBtn.addEventListener('click', () => setTool('eraser'));
  blenderBtn.addEventListener('click', () => setTool('blender'));
  clearBtn.addEventListener('click', () => {
    strokes = [];
    currentStroke = null;
    if (blendCanvas) {
      blendCtx.clearRect(0, 0, blendCanvas.width, blendCanvas.height);
    }
    renderAll();
  });

  colorInput.addEventListener('input', () => {
    currentColor = colorInput.value;
  });

  setTool('pencil');
})();
