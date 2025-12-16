/**
 * PGSD Bangga Poster Generator
 * Deploy-friendly: static site (GitHub Pages/Netlify/Vercel)
 * - Place your template image as: template.png (same folder)
 */

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const photoInput = document.getElementById("photoInput");
const templateInput = document.getElementById("templateInput");
const btnLoadTemplate = document.getElementById("btnLoadTemplate");

const achievementEl = document.getElementById("achievement");
const filenameEl = document.getElementById("filename");
const scaleEl = document.getElementById("scale");
const zoomEl = document.getElementById("zoom");
const zoomVal = document.getElementById("zoomVal");
const showGuidesEl = document.getElementById("showGuides");

const fontSizeEl = document.getElementById("fontSize");
const fontSizeVal = document.getElementById("fontSizeVal");
const autoFitEl = document.getElementById("autoFit");

const btnDownload = document.getElementById("btnDownload");
const btnDownload2 = document.getElementById("btnDownload2");
const btnResetAll = document.getElementById("btnResetAll");
const btnCenter = document.getElementById("btnCenter");
const btnResetPos = document.getElementById("btnResetPos");

const infoRes = document.getElementById("infoRes");
document.getElementById("year").textContent = new Date().getFullYear();

/**
 * Template base: 1637x2048 (dari template kamu)
 * Photo rect kira-kira:
 * x=406..1178, y=597..1384
 */
const TEMPLATE_BASE_W = 1637;
const TEMPLATE_BASE_H = 2048;

const PHOTO_RECT_RATIO = {
  x: 406 / TEMPLATE_BASE_W,
  y: 597 / TEMPLATE_BASE_H,
  w: 772 / TEMPLATE_BASE_W,
  h: 787 / TEMPLATE_BASE_H,
  r: 44 / TEMPLATE_BASE_W
};

/**
 * Text box prestasi: area kiri bawah (di bawah PGSD BANGGA)
 */
const TEXT_BOX_RATIO = {
  x: 255 / TEMPLATE_BASE_W,
  y: 1590 / TEMPLATE_BASE_H,
  w: 1100 / TEMPLATE_BASE_W,
  h: 300 / TEMPLATE_BASE_H
};

const state = {
  templateImg: null,
  photoImg: null,

  photoOffsetX: 0,
  photoOffsetY: 0,
  zoom: parseFloat(zoomEl.value),

  dragging: false,
  lastX: 0,
  lastY: 0,

  dirty: true,
  raf: null
};

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function loadImageFromUrl(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function loadImageFromFile(file){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function roundedRectPath(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawCoverImage(ctx, img, x, y, w, h, offsetX, offsetY, zoom){
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;

  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;

  const cx = x + (w - dw)/2 + offsetX;
  const cy = y + (h - dh)/2 + offsetY;

  ctx.drawImage(img, cx, cy, dw, dh);
}

function wrapText(ctx, text, maxWidth){
  const lines = [];
  const rawLines = text
    .replace(/\r/g, "")
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  const chunks = rawLines.length ? rawLines : [text.trim()];

  for (const raw of chunks) {
    if (!raw) continue;
    const words = raw.split(/\s+/);
    let line = "";
    for (const w of words){
      const test = line ? (line + " " + w) : w;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = w;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Auto-fit: pilih fontSize terbesar yang masih muat box
 */
function fitTextToBox(ctx, text, w, h, baseSize, minSize){
  let fontSize = baseSize;

  while (fontSize >= minSize) {
    ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, Segoe UI, Arial`;
    const lines = wrapText(ctx, text, w);
    const lineHeight = Math.round(fontSize * 1.15);
    const totalH = lines.length * lineHeight;

    if (totalH <= h && lines.length <= 5) {
      return { fontSize, lines, lineHeight };
    }
    fontSize -= 1;
  }

  ctx.font = `900 ${minSize}px ui-sans-serif, system-ui, Segoe UI, Arial`;
  const lines = wrapText(ctx, text, w);
  return { fontSize: minSize, lines, lineHeight: Math.round(minSize * 1.15) };
}

function setDirty(){
  state.dirty = true;
  if (!state.raf) {
    state.raf = requestAnimationFrame(() => {
      state.raf = null;
      if (state.dirty) render();
    });
  }
}

function render(){
  state.dirty = false;

  const template = state.templateImg;
  const outScale = parseInt(scaleEl.value, 10) || 2;

  const tw = template ? (template.naturalWidth || template.width) : TEMPLATE_BASE_W;
  const th = template ? (template.naturalHeight || template.height) : TEMPLATE_BASE_H;

  canvas.width = Math.round(tw * outScale);
  canvas.height = Math.round(th * outScale);

  ctx.save();
  ctx.scale(outScale, outScale);

  ctx.clearRect(0, 0, tw, th);

  if (template) {
    ctx.drawImage(template, 0, 0, tw, th);
  } else {
    const g = ctx.createLinearGradient(0,0,tw,th);
    g.addColorStop(0, "#0b1220");
    g.addColorStop(1, "#101a33");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,tw,th);
  }

  // photo rect px
  const pr = {
    x: PHOTO_RECT_RATIO.x * tw,
    y: PHOTO_RECT_RATIO.y * th,
    w: PHOTO_RECT_RATIO.w * tw,
    h: PHOTO_RECT_RATIO.h * th,
    r: Math.max(20, PHOTO_RECT_RATIO.r * tw)
  };

  // draw photo clipped
  if (state.photoImg) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;

    roundedRectPath(ctx, pr.x, pr.y, pr.w, pr.h, pr.r);
    ctx.clip();

    drawCoverImage(ctx, state.photoImg, pr.x, pr.y, pr.w, pr.h, state.photoOffsetX, state.photoOffsetY, state.zoom);

    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(0,0,0,0.04)";
    ctx.fillRect(pr.x, pr.y, pr.w, pr.h);
    ctx.restore();
  }

  // text
  const ach = (achievementEl.value || "").trim();
  if (ach) {
    const tb = {
      x: TEXT_BOX_RATIO.x * tw,
      y: TEXT_BOX_RATIO.y * th,
      w: TEXT_BOX_RATIO.w * tw,
      h: TEXT_BOX_RATIO.h * th
    };

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.18)";
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;

    const baseSize = parseInt(fontSizeEl.value, 10) || 56;
    const minSize = 18;

    const textUpper = ach.toUpperCase();

    let fontSize, lines, lineHeight;

    if (autoFitEl.checked) {
      ({ fontSize, lines, lineHeight } = fitTextToBox(ctx, textUpper, tb.w, tb.h, baseSize, minSize));
    } else {
      // manual size: pakai slider persis, tetap wrap, tapi kalau kebanyakan ya kepotong
      fontSize = baseSize;
      ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, Segoe UI, Arial`;
      lines = wrapText(ctx, textUpper, tb.w);
      lineHeight = Math.round(fontSize * 1.15);
    }

    ctx.font = `900 ${fontSize}px ui-sans-serif, system-ui, Segoe UI, Arial`;
    ctx.fillStyle = "#1f3554";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // clip ke box supaya kalau manual kebesaran gak nabrak keluar
    ctx.save();
    ctx.beginPath();
    ctx.rect(tb.x, tb.y, tb.w, tb.h);
    ctx.clip();

    let y = tb.y + 6;
    for (let i = 0; i < lines.length; i++){
      ctx.fillText(lines[i], tb.x, y);
      y += lineHeight;
      if (y > tb.y + tb.h) break;
    }

    ctx.restore();
    ctx.restore();
  }

  if (showGuidesEl.checked) {
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    roundedRectPath(ctx, pr.x, pr.y, pr.w, pr.h, pr.r);
    ctx.stroke();

    const tb = {
      x: TEXT_BOX_RATIO.x * tw,
      y: TEXT_BOX_RATIO.y * th,
      w: TEXT_BOX_RATIO.w * tw,
      h: TEXT_BOX_RATIO.h * th
    };
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(tb.x, tb.y, tb.w, tb.h);
    ctx.restore();
  }

  ctx.restore();

  infoRes.textContent = `Template: ${tw}×${th} • Output: ${canvas.width}×${canvas.height} (scale ${outScale}x)`;
}

async function initTemplate(){
  try {
    state.templateImg = await loadImageFromUrl("template.png");
  } catch (e) {
    console.warn("Gagal load template.png. Pastikan file ada di folder yang sama.", e);
    state.templateImg = null;
  }
  setDirty();
}

// ===== Events =====
photoInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  state.photoImg = await loadImageFromFile(file);
  state.zoom = parseFloat(zoomEl.value);
  state.photoOffsetX = 0;
  state.photoOffsetY = 0;
  setDirty();
});

btnLoadTemplate.addEventListener("click", () => templateInput.click());
templateInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  state.templateImg = await loadImageFromFile(file);
  setDirty();
});

achievementEl.addEventListener("input", setDirty);
scaleEl.addEventListener("change", setDirty);
showGuidesEl.addEventListener("change", setDirty);

zoomEl.addEventListener("input", () => {
  state.zoom = parseFloat(zoomEl.value);
  zoomVal.textContent = `${state.zoom.toFixed(2)}x`;
  setDirty();
});

fontSizeEl.addEventListener("input", () => {
  fontSizeVal.textContent = `${fontSizeEl.value}px`;
  setDirty();
});
autoFitEl.addEventListener("change", setDirty);

btnCenter.addEventListener("click", () => {
  state.photoOffsetX = 0;
  state.photoOffsetY = 0;
  setDirty();
});

btnResetPos.addEventListener("click", () => {
  state.photoOffsetX = 0;
  state.photoOffsetY = 0;
  state.zoom = 1.15;
  zoomEl.value = String(state.zoom);
  zoomVal.textContent = `${state.zoom.toFixed(2)}x`;
  setDirty();
});

btnResetAll.addEventListener("click", () => {
  photoInput.value = "";
  achievementEl.value = "";
  filenameEl.value = "pgsd-bangga";
  scaleEl.value = "2";
  showGuidesEl.checked = false;

  fontSizeEl.value = "56";
  fontSizeVal.textContent = "56px";
  autoFitEl.checked = true;

  state.photoImg = null;
  state.photoOffsetX = 0;
  state.photoOffsetY = 0;
  state.zoom = 1.15;
  zoomEl.value = String(state.zoom);
  zoomVal.textContent = `${state.zoom.toFixed(2)}x`;

  setDirty();
});

function sanitizeFileName(name){
  const safe = (name || "pgsd-bangga")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return safe || "pgsd-bangga";
}

function downloadPNG(){
  render();

  const fname = sanitizeFileName(filenameEl.value) + ".png";
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, "image/png", 1);
}

btnDownload.addEventListener("click", downloadPNG);
btnDownload2.addEventListener("click", downloadPNG);

// Drag photo
canvas.addEventListener("pointerdown", (e) => {
  if (!state.photoImg) return;
  state.dragging = true;
  canvas.setPointerCapture(e.pointerId);
  state.lastX = e.clientX;
  state.lastY = e.clientY;
});

canvas.addEventListener("pointermove", (e) => {
  if (!state.dragging) return;
  const dx = e.clientX - state.lastX;
  const dy = e.clientY - state.lastY;
  state.lastX = e.clientX;
  state.lastY = e.clientY;

  const rect = canvas.getBoundingClientRect();
  const templateW = state.templateImg ? (state.templateImg.naturalWidth || state.templateImg.width) : TEMPLATE_BASE_W;
  const templateH = state.templateImg ? (state.templateImg.naturalHeight || state.templateImg.height) : TEMPLATE_BASE_H;

  const pxPerClientX = templateW / rect.width;
  const pxPerClientY = templateH / rect.height;

  state.photoOffsetX += dx * pxPerClientX;
  state.photoOffsetY += dy * pxPerClientY;

  setDirty();
});

canvas.addEventListener("pointerup", (e) => {
  state.dragging = false;
  try { canvas.releasePointerCapture(e.pointerId); } catch {}
});
canvas.addEventListener("pointercancel", () => { state.dragging = false; });

// Wheel zoom on canvas
canvas.addEventListener("wheel", (e) => {
  if (!state.photoImg) return;
  e.preventDefault();

  const delta = Math.sign(e.deltaY);
  const next = clamp(state.zoom + (delta > 0 ? -0.05 : 0.05), 0.8, 2.5);
  state.zoom = next;

  zoomEl.value = String(next);
  zoomVal.textContent = `${next.toFixed(2)}x`;
  setDirty();
}, { passive: false });

// Start
zoomVal.textContent = `${state.zoom.toFixed(2)}x`;
fontSizeVal.textContent = `${fontSizeEl.value}px`;
initTemplate().then(() => setDirty());
