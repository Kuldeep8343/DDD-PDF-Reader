const app = document.querySelector(".app-shell");
const pdfUpload = document.querySelector("#pdfUpload");
const fileName = document.querySelector("#fileName");
const welcomeScreen = document.querySelector("#welcomeScreen");
const pdfScroll = document.querySelector("#pdfScroll");
const documentStage = document.querySelector("#documentStage");
const statusLabel = document.querySelector("#statusLabel");
const pageCountLabel = document.querySelector("#pageCountLabel");
const pageJump = document.querySelector("#pageJump");
const prevPage = document.querySelector("#prevPage");
const nextPage = document.querySelector("#nextPage");
const zoomOut = document.querySelector("#zoomOut");
const zoomIn = document.querySelector("#zoomIn");
const zoomLabel = document.querySelector("#zoomLabel");
const fitWidth = document.querySelector("#fitWidth");
const fitPage = document.querySelector("#fitPage");
const modeToggle = document.querySelector("#modeToggle");
const boardThemeToggle = document.querySelector("#boardThemeToggle");
const blankBoard = document.querySelector("#blankBoard");
const boardSurface = document.querySelector("#boardSurface");
const boardCanvas = document.querySelector("#boardCanvas");
const boardLaserCanvas = document.querySelector("#boardLaserCanvas");
const autoScrollToggle = document.querySelector("#autoScrollToggle");
const scrollReset = document.querySelector("#scrollReset");
const scrollSpeed = document.querySelector("#scrollSpeed");
const scrollSpeedValue = document.querySelector("#scrollSpeedValue");
const scrollState = document.querySelector("#scrollState");
const laserToggle = document.querySelector("#laserToggle");
const laserDot = document.querySelector("#laserDot");
const laserSize = document.querySelector("#laserSize");
const laserSizeValue = document.querySelector("#laserSizeValue");
const laserFade = document.querySelector("#laserFade");
const laserFadeValue = document.querySelector("#laserFadeValue");
const laserColors = document.querySelector("#laserColors");
const spotlightToggle = document.querySelector("#spotlightToggle");
const spotlight = document.querySelector("#spotlight");
const annotationTools = document.querySelector("#annotationTools");
const annotationColor = document.querySelector("#annotationColor");
const annotationSize = document.querySelector("#annotationSize");
const annotationSizeValue = document.querySelector("#annotationSizeValue");
const annotationUndo = document.querySelector("#annotationUndo");
const annotationRedo = document.querySelector("#annotationRedo");
const clearAnnotations = document.querySelector("#clearAnnotations");
const sidebarToggle = document.querySelector("#sidebarToggle");
const themeToggle = document.querySelector("#themeToggle");
const hideUiToggle = document.querySelector("#hideUiToggle");
const fullscreenBtn = document.querySelector("#fullscreenBtn");
const timerStart = document.querySelector("#timerStart");
const timerReset = document.querySelector("#timerReset");
const stopwatchStart = document.querySelector("#stopwatchStart");
const stopwatchReset = document.querySelector("#stopwatchReset");
const timerMinutes = document.querySelector("#timerMinutes");
const clockLabel = document.querySelector("#clockLabel");
const toast = document.querySelector("#toast");

const state = {
  pdf: null,
  mode: "pdf",
  pages: [],
  boardPages: [],
  boardTheme: "white",
  currentPage: 1,
  scale: 1,
  autoScrolling: false,
  autoScrollFrame: null,
  lastScrollTick: 0,
  laserEnabled: false,
  laserColor: "#ef4444",
  laserSize: 18,
  laserFadeMs: 5000,
  laserDrawing: false,
  activeLaserPage: null,
  activeLaserStroke: null,
  laserAnimationFrame: null,
  spotlightEnabled: false,
  tool: "pen",
  annotationSnapshots: new Map(),
  undoStack: [],
  redoStack: [],
  maxHistory: 40,
  pendingHistorySnapshot: null,
  drawing: false,
  activeCanvas: null,
  startPoint: null,
  snapshot: null,
  activeStrokePoints: [],
  strokeMoved: false,
  historyRestoring: false,
  timerMode: null,
  timerRunning: false,
  timerStartedAt: 0,
  timerBaseMs: 0,
  timerDurationMs: 30 * 60 * 1000,
  timerFrame: null,
};

state.historyByMode = {
  pdf: { undoStack: state.undoStack, redoStack: state.redoStack },
  board: { undoStack: [], redoStack: [] },
};

const pdfApi = window.pdfjsLib;

if (pdfApi) {
  pdfApi.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function updateStatus(message) {
  statusLabel.textContent = message;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function activePages() {
  return state.mode === "board" ? state.boardPages : state.pages;
}

function canAnnotateActiveSurface() {
  return state.mode === "board" || Boolean(state.pdf);
}

function setZoom(nextScale) {
  if (state.mode !== "pdf") return;
  state.scale = clamp(Number(nextScale.toFixed(2)), 0.45, 2.6);
  zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
  if (state.pdf) {
    renderAllPages();
  }
}

function captureAnnotationSnapshots(pages = activePages()) {
  const snapshots = new Map();
  pages.forEach(({ pageNumber, annotationCanvas }) => {
    snapshots.set(pageNumber, {
      dataUrl: annotationCanvas.toDataURL("image/png"),
      width: annotationCanvas.width,
      height: annotationCanvas.height,
    });
  });
  return snapshots;
}

function restoreAnnotationSnapshot(canvas, snapshot) {
  if (!snapshot) return Promise.resolve();
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    image.onerror = resolve;
    image.src = snapshot.dataUrl;
  });
}

function cloneAnnotationSnapshots(snapshots) {
  return new Map(Array.from(snapshots || [], ([pageNumber, snapshot]) => [pageNumber, { ...snapshot }]));
}

function updateUndoRedoButtons() {
  annotationUndo.disabled = !state.undoStack.length || state.historyRestoring;
  annotationRedo.disabled = !state.redoStack.length || state.historyRestoring;
}

function saveHistoryForCurrentMode() {
  state.historyByMode[state.mode] = {
    undoStack: state.undoStack,
    redoStack: state.redoStack,
  };
}

function loadHistoryForMode(mode) {
  const history = state.historyByMode[mode] || { undoStack: [], redoStack: [] };
  state.undoStack = history.undoStack;
  state.redoStack = history.redoStack;
  state.pendingHistorySnapshot = null;
  updateUndoRedoButtons();
}

function resetAnnotationHistory(mode = state.mode) {
  const history = { undoStack: [], redoStack: [] };
  state.historyByMode[mode] = history;
  if (mode !== state.mode) return;
  state.undoStack = history.undoStack;
  state.redoStack = history.redoStack;
  state.pendingHistorySnapshot = null;
  updateUndoRedoButtons();
}

function pushAnnotationHistory(snapshot = captureAnnotationSnapshots()) {
  if (!activePages().length) return;
  state.undoStack.push(cloneAnnotationSnapshots(snapshot));
  if (state.undoStack.length > state.maxHistory) {
    state.undoStack.shift();
  }
  state.redoStack = [];
  updateUndoRedoButtons();
}

function prepareAnnotationHistory() {
  state.pendingHistorySnapshot = captureAnnotationSnapshots();
  state.strokeMoved = false;
}

function commitPendingAnnotationHistory() {
  if (!state.pendingHistorySnapshot) return;
  pushAnnotationHistory(state.pendingHistorySnapshot);
  state.pendingHistorySnapshot = null;
}

async function restoreAnnotationState(snapshots) {
  state.historyRestoring = true;
  updateUndoRedoButtons();
  const nextSnapshots = cloneAnnotationSnapshots(snapshots);
  try {
    await Promise.all(activePages().map(async ({ pageNumber, annotationCanvas }) => {
      const context = annotationCanvas.getContext("2d");
      context.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
      await restoreAnnotationSnapshot(annotationCanvas, nextSnapshots.get(pageNumber));
    }));
    if (state.mode === "pdf") {
      state.annotationSnapshots = nextSnapshots;
    }
  } finally {
    state.historyRestoring = false;
    updateUndoRedoButtons();
  }
}

async function undoAnnotations() {
  if (!state.undoStack.length || state.historyRestoring) return;
  const current = captureAnnotationSnapshots();
  const previous = state.undoStack.pop();
  state.redoStack.push(cloneAnnotationSnapshots(current));
  if (state.redoStack.length > state.maxHistory) {
    state.redoStack.shift();
  }
  await restoreAnnotationState(previous);
  showToast("Annotation undone");
}

async function redoAnnotations() {
  if (!state.redoStack.length || state.historyRestoring) return;
  const current = captureAnnotationSnapshots();
  const next = state.redoStack.pop();
  state.undoStack.push(cloneAnnotationSnapshots(current));
  if (state.undoStack.length > state.maxHistory) {
    state.undoStack.shift();
  }
  await restoreAnnotationState(next);
  showToast("Annotation redone");
}

async function renderAllPages({ preserveAnnotations = true } = {}) {
  if (!state.pdf) return;

  updateStatus("Rendering PDF...");
  const scrollTop = pdfScroll.scrollTop;

  // Save existing annotations if needed
  state.annotationSnapshots = preserveAnnotations
    ? captureAnnotationSnapshots(state.pages)
    : new Map();

  // Clear previous pages
  pdfScroll.innerHTML = "";
  state.pages = [];

  // Create a document fragment for better performance
  const fragment = document.createDocumentFragment();

  // Render pages one by one in strict order
  for (let pageNumber = 1; pageNumber <= state.pdf.numPages; pageNumber++) {
    const page = await state.pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: state.scale });

    // Page wrapper
    const pageWrap = document.createElement("article");
    pageWrap.className = "pdf-page";
    pageWrap.dataset.page = String(pageNumber);
    pageWrap.style.width = `${viewport.width}px`;
    pageWrap.style.height = `${viewport.height}px`;

    // PDF canvas
    const pdfCanvas = document.createElement("canvas");
    const pdfContext = pdfCanvas.getContext("2d");

    pdfCanvas.width = Math.floor(viewport.width);
    pdfCanvas.height = Math.floor(viewport.height);
    pdfCanvas.style.width = `${viewport.width}px`;
    pdfCanvas.style.height = `${viewport.height}px`;

    // Annotation canvas
    const annotationCanvas = document.createElement("canvas");
    annotationCanvas.className = "annotation-canvas";
    annotationCanvas.width = Math.floor(viewport.width);
    annotationCanvas.height = Math.floor(viewport.height);
    annotationCanvas.style.width = `${viewport.width}px`;
    annotationCanvas.style.height = `${viewport.height}px`;

    // Laser canvas
    const laserCanvas = document.createElement("canvas");
    laserCanvas.className = "laser-canvas";
    laserCanvas.width = Math.floor(viewport.width);
    laserCanvas.height = Math.floor(viewport.height);
    laserCanvas.style.width = `${viewport.width}px`;
    laserCanvas.style.height = `${viewport.height}px`;

    // Attach annotation events
    attachAnnotationEvents(annotationCanvas, laserCanvas);

    // Add canvases to wrapper
    pageWrap.append(pdfCanvas, annotationCanvas, laserCanvas);

    // IMPORTANT: Render page completely BEFORE appending
    await page.render({
      canvasContext: pdfContext,
      viewport
    }).promise;

    // Restore annotations
    await restoreAnnotationSnapshot(
      annotationCanvas,
      state.annotationSnapshots.get(pageNumber)
    );

    // Store page reference
    state.pages.push({
      pageNumber,
      pageWrap,
      annotationCanvas,
      laserCanvas,
      laserStrokes: []
    });

    // Add to fragment in correct order
    fragment.appendChild(pageWrap);
  }

  // Append all pages together after rendering
  pdfScroll.appendChild(fragment);

  // Update UI
  pageCountLabel.textContent =
    `${state.pdf.numPages} page${state.pdf.numPages === 1 ? "" : "s"}`;

  pageJump.max = String(state.pdf.numPages);
  pageJump.value = String(state.currentPage);

  // Restore scroll position
  pdfScroll.scrollTop = scrollTop;

  updateUndoRedoButtons();

  updateStatus(
    `${fileName.textContent} - Page ${state.currentPage} of ${state.pdf.numPages}`
  );
}

async function loadPdf(file) {
  if (!file) return;
  try {
    updateStatus("Loading PDF...");
    stopAutoScroll();
    if (!pdfApi) {
      throw new Error("PDF.js did not load");
    }
    const buffer = await file.arrayBuffer();
    const loadingTask = pdfApi.getDocument({ data: buffer });
    state.pdf = await loadingTask.promise;
    state.currentPage = 1;
    resetAnnotationHistory("pdf");
    fileName.textContent = file.name;
    welcomeScreen.classList.add("is-hidden");
    setReaderMode("pdf");
    await renderAllPages({ preserveAnnotations: false });
    goToPage(1);
    showToast("PDF ready for presentation");
  } catch (error) {
    console.error(error);
    showToast("Could not load this PDF. Please try another file.");
    updateStatus("PDF loading failed");
  }
}

function currentPageFromScroll() {
  if (state.mode !== "pdf" || !state.pages.length) return 1;
  const stageTop = pdfScroll.getBoundingClientRect().top;
  let closest = state.pages[0];
  let closestDistance = Number.POSITIVE_INFINITY;
  state.pages.forEach((page) => {
    const rect = page.pageWrap.getBoundingClientRect();
    const distance = Math.abs(rect.top - stageTop - 24);
    if (distance < closestDistance) {
      closest = page;
      closestDistance = distance;
    }
  });
  return closest.pageNumber;
}

function syncCurrentPage() {
  if (!state.pdf || state.mode !== "pdf") return;
  state.currentPage = currentPageFromScroll();
  pageJump.value = String(state.currentPage);
  updateStatus(`${fileName.textContent} - Page ${state.currentPage} of ${state.pdf.numPages}`);
}

function goToPage(pageNumber) {
  if (!state.pdf || state.mode !== "pdf") return;
  const nextPage = clamp(Number(pageNumber) || 1, 1, state.pdf.numPages);
  const target = state.pages[nextPage - 1];
  if (!target) return;
  target.pageWrap.scrollIntoView({ behavior: "smooth", block: "start" });
  state.currentPage = nextPage;
  pageJump.value = String(nextPage);
  updateStatus(`${fileName.textContent} - Page ${nextPage} of ${state.pdf.numPages}`);
}

function fitToWidth() {
  if (!state.pdf || state.mode !== "pdf" || !state.pages.length) return;
  const firstPageWidth = state.pages[0].pageWrap.offsetWidth / state.scale;
  const available = pdfScroll.clientWidth - 72;
  setZoom(clamp(available / firstPageWidth, 0.45, 2.6));
  showToast("Fit width applied");
}

function fitToPage() {
  if (!state.pdf || state.mode !== "pdf" || !state.pages.length) return;
  const firstPage = state.pages[0].pageWrap;
  const baseWidth = firstPage.offsetWidth / state.scale;
  const baseHeight = firstPage.offsetHeight / state.scale;
  const scaleX = (pdfScroll.clientWidth - 72) / baseWidth;
  const scaleY = (pdfScroll.clientHeight - 72) / baseHeight;
  setZoom(clamp(Math.min(scaleX, scaleY), 0.45, 2.6));
  showToast("Fit page applied");
}

function autoScrollStep(timestamp) {
  if (!state.autoScrolling) return;
  if (!state.lastScrollTick) {
    state.lastScrollTick = timestamp;
  }
  const delta = timestamp - state.lastScrollTick;
  state.lastScrollTick = timestamp;
  const pixelsPerSecond = Number(scrollSpeed.value) * 18;
  pdfScroll.scrollTop += (pixelsPerSecond * delta) / 1000;

  if (pdfScroll.scrollTop + pdfScroll.clientHeight >= pdfScroll.scrollHeight - 2) {
    stopAutoScroll();
    return;
  }

  state.autoScrollFrame = window.requestAnimationFrame(autoScrollStep);
}

function startAutoScroll() {
  if (!state.pdf || state.mode !== "pdf" || state.autoScrolling) return;
  state.autoScrolling = true;
  state.lastScrollTick = 0;
  autoScrollToggle.textContent = "Pause";
  scrollState.textContent = "Running";
  state.autoScrollFrame = window.requestAnimationFrame(autoScrollStep);
}

function stopAutoScroll() {
  state.autoScrolling = false;
  autoScrollToggle.textContent = "Start";
  scrollState.textContent = "Paused";
  if (state.autoScrollFrame) {
    window.cancelAnimationFrame(state.autoScrollFrame);
  }
  state.autoScrollFrame = null;
}

function toggleAutoScroll() {
  if (state.autoScrolling) {
    stopAutoScroll();
  } else {
    startAutoScroll();
  }
}

function drawLaserStroke(context, stroke, alpha = 1) {
  if (stroke.points.length < 2) return;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = stroke.size;
  context.strokeStyle = stroke.color;
  context.globalAlpha = alpha;
  context.shadowColor = stroke.color;
  context.shadowBlur = Math.max(8, stroke.size * 1.4);
  context.beginPath();
  context.moveTo(stroke.points[0].x, stroke.points[0].y);
  stroke.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
  context.restore();
}

function renderLaserPage(page, now = performance.now()) {
  const context = page.laserCanvas.getContext("2d");
  context.clearRect(0, 0, page.laserCanvas.width, page.laserCanvas.height);
  page.laserStrokes = page.laserStrokes.filter((stroke) => !stroke.expiresAt || stroke.expiresAt > now);
  page.laserStrokes.forEach((stroke) => {
    const alpha = stroke.expiresAt ? clamp((stroke.expiresAt - now) / stroke.fadeMs, 0, 1) : 1;
    drawLaserStroke(context, stroke, alpha);
  });
}

function animateLaserAnnotations() {
  const now = performance.now();
  let hasVisibleStroke = false;
  activePages().forEach((page) => {
    if (!page.laserStrokes?.length) return;
    renderLaserPage(page, now);
    if (page.laserStrokes.length) hasVisibleStroke = true;
  });
  state.laserAnimationFrame = hasVisibleStroke ? window.requestAnimationFrame(animateLaserAnnotations) : null;
}

function ensureLaserAnimation() {
  if (!state.laserAnimationFrame) {
    state.laserAnimationFrame = window.requestAnimationFrame(animateLaserAnnotations);
  }
}

function startLaserAnnotation(laserCanvas, point) {
  const page = activePages().find((item) => item.laserCanvas === laserCanvas);
  if (!page) return;
  const stroke = {
    points: [point],
    color: state.laserColor,
    size: Math.max(3, state.laserSize * 0.55),
    fadeMs: state.laserFadeMs,
    expiresAt: null,
  };
  page.laserStrokes.push(stroke);
  state.laserDrawing = true;
  state.activeLaserPage = page;
  state.activeLaserStroke = stroke;
  renderLaserPage(page);
}

function updateLaserAnnotation(point) {
  if (!state.laserDrawing || !state.activeLaserStroke || !state.activeLaserPage) return;
  const points = state.activeLaserStroke.points;
  const lastPoint = points[points.length - 1];
  if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 1.5) return;
  points.push(point);
  renderLaserPage(state.activeLaserPage);
}

function finishLaserAnnotation(point) {
  if (!state.laserDrawing || !state.activeLaserStroke || !state.activeLaserPage) return;
  updateLaserAnnotation(point);
  const now = performance.now();
  state.activeLaserStroke.fadeMs = state.laserFadeMs;
  state.activeLaserStroke.expiresAt = now + state.laserFadeMs;
  renderLaserPage(state.activeLaserPage, now);
  state.laserDrawing = false;
  state.activeLaserPage = null;
  state.activeLaserStroke = null;
  ensureLaserAnimation();
}

function updatePointerPosition(event) {
  const x = `${event.clientX}px`;
  const y = `${event.clientY}px`;
  if (state.laserEnabled) {
    laserDot.style.left = x;
    laserDot.style.top = y;
  }
  if (state.spotlightEnabled) {
    spotlight.style.setProperty("--spot-x", x);
    spotlight.style.setProperty("--spot-y", y);
  }
}

function setLaserEnabled(enabled) {
  state.laserEnabled = enabled;
  laserToggle.setAttribute("aria-pressed", String(enabled));
  laserDot.classList.toggle("is-active", enabled);
  showToast(enabled ? "Laser pointer enabled" : "Laser pointer hidden");
}

function setSpotlightEnabled(enabled) {
  state.spotlightEnabled = enabled;
  spotlightToggle.setAttribute("aria-pressed", String(enabled));
  spotlight.classList.toggle("is-active", enabled);
  showToast(enabled ? "Spotlight enabled" : "Spotlight hidden");
}

function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function configureStroke(context, tool = state.tool) {
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Number(annotationSize.value);
  context.strokeStyle = annotationColor.value;
  context.fillStyle = annotationColor.value;
  context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  context.globalAlpha = tool === "highlighter" ? 0.3 : 1;
}

function isPreviewTool(tool = state.tool) {
  return ["rectangle", "ellipse", "line", "linePen"].includes(tool);
}

function drawShapePreview(canvas, point) {
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (state.snapshot) {
    context.putImageData(state.snapshot, 0, 0);
  }
  configureStroke(context);
  const width = point.x - state.startPoint.x;
  const height = point.y - state.startPoint.y;

  if (state.tool === "rectangle") {
    context.strokeRect(state.startPoint.x, state.startPoint.y, width, height);
  }

  if (state.tool === "ellipse") {
    context.beginPath();
    context.ellipse(
      state.startPoint.x + width / 2,
      state.startPoint.y + height / 2,
      Math.abs(width / 2),
      Math.abs(height / 2),
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  }

  if (state.tool === "line" || state.tool === "linePen") {
    context.beginPath();
    context.moveTo(state.startPoint.x, state.startPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
  }
}

function drawFreehandPreview(canvas, points, tool) {
  if (points.length < 2) return;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (state.snapshot) {
    context.putImageData(state.snapshot, 0, 0);
  }
  configureStroke(context, tool);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
}

function addTextAnnotation(canvas, point) {
  const text = window.prompt("Annotation text");
  if (!text) return;
  pushAnnotationHistory();
  const context = canvas.getContext("2d");
  configureStroke(context);
  context.globalAlpha = 1;
  context.font = `${Math.max(16, Number(annotationSize.value) * 5)}px Inter, Arial, sans-serif`;
  context.fillText(text, point.x, point.y);
}

function attachAnnotationEvents(canvas, laserCanvas) {
  canvas.addEventListener("pointerdown", (event) => {
    if (!canAnnotateActiveSurface()) return;
    const point = canvasPoint(canvas, event);

    if (state.laserEnabled) {
      startLaserAnnotation(laserCanvas, point);
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (state.tool === "text") {
      addTextAnnotation(canvas, point);
      return;
    }

    state.drawing = true;
    state.activeCanvas = canvas;
    state.startPoint = point;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    state.snapshot = context.getImageData(0, 0, canvas.width, canvas.height);
    state.activeStrokePoints = [point];
    prepareAnnotationHistory();
    configureStroke(context);
    context.beginPath();
    context.moveTo(point.x, point.y);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (state.laserDrawing && state.activeLaserPage?.laserCanvas === laserCanvas) {
      updateLaserAnnotation(canvasPoint(canvas, event));
      return;
    }

    if (!state.drawing || state.activeCanvas !== canvas) return;
    const point = canvasPoint(canvas, event);
    const context = canvas.getContext("2d");
    state.strokeMoved = true;

    if (isPreviewTool()) {
      commitPendingAnnotationHistory();
      drawShapePreview(canvas, point);
      return;
    }

    commitPendingAnnotationHistory();
    if (state.tool === "highlighter") {
      state.activeStrokePoints.push(point);
      drawFreehandPreview(canvas, state.activeStrokePoints, "highlighter");
      return;
    }

    configureStroke(context);
    context.lineTo(point.x, point.y);
    context.stroke();
  });

  const finishDrawing = (event) => {
    if (state.laserDrawing && state.activeLaserPage?.laserCanvas === laserCanvas) {
      finishLaserAnnotation(canvasPoint(canvas, event));
      return;
    }

    if (!state.drawing || state.activeCanvas !== canvas) return;
    const point = canvasPoint(canvas, event);
    if (state.tool === "highlighter" && state.strokeMoved) {
      commitPendingAnnotationHistory();
      state.activeStrokePoints.push(point);
      drawFreehandPreview(canvas, state.activeStrokePoints, "highlighter");
    }
    if (isPreviewTool() && state.strokeMoved) {
      commitPendingAnnotationHistory();
      drawShapePreview(canvas, point);
    }
    state.drawing = false;
    state.activeCanvas = null;
    state.snapshot = null;
    state.pendingHistorySnapshot = null;
    state.activeStrokePoints = [];
    state.strokeMoved = false;
  };

  canvas.addEventListener("pointerup", finishDrawing);
  canvas.addEventListener("pointercancel", finishDrawing);
  canvas.addEventListener("pointerleave", (event) => {
    if (event.buttons === 1) finishDrawing(event);
  });
}

function clearVisibleAnnotations() {
  if (!activePages().length) return;
  pushAnnotationHistory();
  activePages().forEach(({ annotationCanvas, laserCanvas, laserStrokes }) => {
    const context = annotationCanvas.getContext("2d");
    context.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
    if (laserCanvas) {
      laserCanvas.getContext("2d").clearRect(0, 0, laserCanvas.width, laserCanvas.height);
    }
    if (laserStrokes) {
      laserStrokes.length = 0;
    }
  });
  if (state.mode === "pdf") {
    state.annotationSnapshots.clear();
  }
  showToast("Annotations cleared");
}

function updateClock() {
  if (!state.timerRunning) return;
  const elapsed = state.timerBaseMs + (performance.now() - state.timerStartedAt);
  if (state.timerMode === "countdown") {
    const remaining = state.timerDurationMs - elapsed;
    clockLabel.textContent = formatClock(remaining);
    if (remaining <= 0) {
      state.timerRunning = false;
      state.timerBaseMs = 0;
      timerStart.textContent = "Start";
      showToast("Presentation timer complete");
      return;
    }
  } else {
    clockLabel.textContent = formatClock(elapsed);
  }
  state.timerFrame = window.requestAnimationFrame(updateClock);
}

function startCountdown() {
  if (state.timerRunning && state.timerMode === "countdown") {
    state.timerBaseMs += performance.now() - state.timerStartedAt;
    state.timerRunning = false;
    timerStart.textContent = "Resume";
    return;
  }

  if (state.timerMode !== "countdown") {
    state.timerBaseMs = 0;
  }
  state.timerMode = "countdown";
  state.timerDurationMs = clamp(Number(timerMinutes.value) || 30, 1, 240) * 60 * 1000;
  state.timerStartedAt = performance.now();
  state.timerRunning = true;
  timerStart.textContent = "Pause";
  stopwatchStart.textContent = "Stopwatch";
  window.cancelAnimationFrame(state.timerFrame);
  updateClock();
}

function resetCountdown() {
  state.timerMode = "countdown";
  state.timerRunning = false;
  state.timerBaseMs = 0;
  state.timerDurationMs = clamp(Number(timerMinutes.value) || 30, 1, 240) * 60 * 1000;
  clockLabel.textContent = formatClock(state.timerDurationMs);
  timerStart.textContent = "Start";
  window.cancelAnimationFrame(state.timerFrame);
}

function startStopwatch() {
  if (state.timerRunning && state.timerMode === "stopwatch") {
    state.timerBaseMs += performance.now() - state.timerStartedAt;
    state.timerRunning = false;
    stopwatchStart.textContent = "Resume";
    return;
  }

  if (state.timerMode !== "stopwatch") {
    state.timerBaseMs = 0;
  }
  state.timerMode = "stopwatch";
  state.timerStartedAt = performance.now();
  state.timerRunning = true;
  stopwatchStart.textContent = "Pause";
  timerStart.textContent = "Start";
  window.cancelAnimationFrame(state.timerFrame);
  updateClock();
}

function resetStopwatch() {
  state.timerMode = "stopwatch";
  state.timerRunning = false;
  state.timerBaseMs = 0;
  clockLabel.textContent = "00:00";
  stopwatchStart.textContent = "Stopwatch";
  window.cancelAnimationFrame(state.timerFrame);
}

function toggleUiHidden() {
  app.classList.toggle("ui-hidden");
  const hidden = app.classList.contains("ui-hidden");
  hideUiToggle.setAttribute("aria-label", hidden ? "Show interface" : "Hide interface");
  if (hidden) {
    showToast("Interface hidden. Press H to bring controls back.");
  }
}

function toggleControlPanel() {
  app.classList.toggle("controls-collapsed");
  const collapsed = app.classList.contains("controls-collapsed");
  sidebarToggle.textContent = collapsed ? "Show Controls" : "Controls";
  sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggle.setAttribute("aria-label", collapsed ? "Show control panel" : "Collapse control panel");
  sidebarToggle.title = collapsed ? "Show control panel" : "Collapse control panel";
}

function resizeCanvasPreserving(canvas, width, height) {
  if (!width || !height || (canvas.width === width && canvas.height === height)) return;
  const previous = document.createElement("canvas");
  previous.width = canvas.width;
  previous.height = canvas.height;
  if (canvas.width && canvas.height) {
    previous.getContext("2d").drawImage(canvas, 0, 0);
  }
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  if (previous.width && previous.height) {
    canvas.getContext("2d").drawImage(previous, 0, 0, width, height);
  }
}

function resizeBoardCanvases() {
  const rect = boardSurface.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || documentStage.clientWidth - 72 || 1280));
  const height = Math.max(1, Math.floor(rect.height || documentStage.clientHeight - 72 || 720));
  resizeCanvasPreserving(boardCanvas, width, height);
  resizeCanvasPreserving(boardLaserCanvas, width, height);
}

function initializeBoardCanvas() {
  state.boardPages = [{
    pageNumber: "board",
    pageWrap: boardSurface,
    annotationCanvas: boardCanvas,
    laserCanvas: boardLaserCanvas,
    laserStrokes: [],
  }];
  attachAnnotationEvents(boardCanvas, boardLaserCanvas);
  resizeBoardCanvases();
}

function setBoardTheme(theme) {
  state.boardTheme = theme;
  blankBoard.dataset.boardTheme = theme;
  boardThemeToggle.textContent = theme === "white" ? "Black Board" : "White Board";
  if (state.mode === "board") {
    updateStatus(`Blank Canvas Mode - ${theme === "white" ? "White Board" : "Black Board"}`);
  }
}

function toggleBoardTheme() {
  setBoardTheme(state.boardTheme === "white" ? "black" : "white");
}

function syncModeControls() {
  const boardMode = state.mode === "board";
  app.classList.toggle("board-mode", boardMode);
  modeToggle.textContent = boardMode ? "PDF Reader" : "Blank Canvas";
  modeToggle.setAttribute("aria-pressed", String(boardMode));
  modeToggle.setAttribute("aria-label", boardMode ? "Switch to PDF reader mode" : "Switch to blank canvas mode");

  [prevPage, nextPage, pageJump, zoomOut, zoomIn, fitWidth, fitPage, autoScrollToggle, scrollReset, scrollSpeed].forEach((control) => {
    control.disabled = boardMode;
  });

  if (boardMode) {
    pageCountLabel.textContent = "Board";
    pageJump.value = "1";
    updateStatus(`Blank Canvas Mode - ${state.boardTheme === "white" ? "White Board" : "Black Board"}`);
  } else if (state.pdf) {
    pageCountLabel.textContent = `${state.pdf.numPages} page${state.pdf.numPages === 1 ? "" : "s"}`;
    pageJump.value = String(state.currentPage);
    updateStatus(`${fileName.textContent} - Page ${state.currentPage} of ${state.pdf.numPages}`);
  } else {
    pageCountLabel.textContent = "0 pages";
    updateStatus("Ready for a lecture deck");
  }
}

function setReaderMode(mode) {
  if (mode === state.mode) {
    syncModeControls();
    return;
  }
  saveHistoryForCurrentMode();
  state.pendingHistorySnapshot = null;
  state.drawing = false;
  state.laserDrawing = false;
  state.activeCanvas = null;
  state.activeLaserPage = null;
  state.activeLaserStroke = null;
  state.mode = mode;
  loadHistoryForMode(mode);
  if (mode === "board") {
    stopAutoScroll();
    window.requestAnimationFrame(() => {
      resizeBoardCanvases();
      activePages().forEach((page) => renderLaserPage(page));
    });
  } else {
    activePages().forEach((page) => renderLaserPage(page));
  }
  syncModeControls();
  showToast(mode === "board" ? "Blank canvas ready" : "PDF reader mode");
}

function toggleReaderMode() {
  setReaderMode(state.mode === "board" ? "pdf" : "board");
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.();
  } else {
    document.exitFullscreen?.();
  }
}

pdfUpload.addEventListener("change", (event) => loadPdf(event.target.files[0]));

prevPage.addEventListener("click", () => goToPage(state.currentPage - 1));
nextPage.addEventListener("click", () => goToPage(state.currentPage + 1));
pageJump.addEventListener("change", () => goToPage(pageJump.value));
zoomOut.addEventListener("click", () => setZoom(state.scale - 0.1));
zoomIn.addEventListener("click", () => setZoom(state.scale + 0.1));
fitWidth.addEventListener("click", fitToWidth);
fitPage.addEventListener("click", fitToPage);
modeToggle.addEventListener("click", toggleReaderMode);
boardThemeToggle.addEventListener("click", toggleBoardTheme);

autoScrollToggle.addEventListener("click", toggleAutoScroll);
scrollReset.addEventListener("click", () => {
  pdfScroll.scrollTo({ top: 0, behavior: "smooth" });
  goToPage(1);
});
scrollSpeed.addEventListener("input", () => {
  scrollSpeedValue.textContent = scrollSpeed.value;
});

laserToggle.addEventListener("click", () => setLaserEnabled(!state.laserEnabled));
laserSize.addEventListener("input", () => {
  state.laserSize = Number(laserSize.value);
  laserSizeValue.textContent = laserSize.value;
  laserDot.style.setProperty("--laser-size", `${state.laserSize}px`);
});
laserFade.addEventListener("input", () => {
  state.laserFadeMs = Number(laserFade.value) * 1000;
  laserFadeValue.textContent = `${laserFade.value}s`;
});
laserColors.addEventListener("click", (event) => {
  const swatch = event.target.closest("[data-color]");
  if (!swatch) return;
  state.laserColor = swatch.dataset.color;
  laserDot.style.setProperty("--laser-color", state.laserColor);
  laserColors.querySelectorAll(".swatch").forEach((button) => button.classList.toggle("is-active", button === swatch));
});
spotlightToggle.addEventListener("click", () => setSpotlightEnabled(!state.spotlightEnabled));
window.addEventListener("pointermove", updatePointerPosition);
window.addEventListener("resize", () => {
  if (state.mode === "board") {
    window.requestAnimationFrame(resizeBoardCanvases);
  }
});

annotationTools.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tool]");
  if (!button) return;
  state.tool = button.dataset.tool;
  annotationTools.querySelectorAll("[data-tool]").forEach((tool) => tool.classList.toggle("is-active", tool === button));
  showToast(`${button.dataset.label || button.textContent.trim()} tool selected`);
});
annotationSize.addEventListener("input", () => {
  annotationSizeValue.textContent = annotationSize.value;
});
annotationUndo.addEventListener("click", undoAnnotations);
annotationRedo.addEventListener("click", redoAnnotations);
clearAnnotations.addEventListener("click", clearVisibleAnnotations);

sidebarToggle.addEventListener("click", toggleControlPanel);
themeToggle.addEventListener("click", () => {
  const nextTheme = app.dataset.theme === "dark" ? "light" : "dark";
  app.dataset.theme = nextTheme;
});
hideUiToggle.addEventListener("click", toggleUiHidden);
fullscreenBtn.addEventListener("click", toggleFullscreen);

timerStart.addEventListener("click", startCountdown);
timerReset.addEventListener("click", resetCountdown);
stopwatchStart.addEventListener("click", startStopwatch);
stopwatchReset.addEventListener("click", resetStopwatch);
timerMinutes.addEventListener("change", resetCountdown);

pdfScroll.addEventListener("scroll", () => {
  window.clearTimeout(pdfScroll.scrollTimer);
  pdfScroll.scrollTimer = window.setTimeout(syncCurrentPage, 80);
});

window.addEventListener("keydown", (event) => {
  const tagName = document.activeElement?.tagName?.toLowerCase();
  if (tagName === "input" && event.key !== "Escape") return;

  const shortcutKey = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && shortcutKey === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      redoAnnotations();
    } else {
      undoAnnotations();
    }
    return;
  }
  if ((event.ctrlKey || event.metaKey) && shortcutKey === "y") {
    event.preventDefault();
    redoAnnotations();
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    toggleAutoScroll();
  }
  if (event.key === "ArrowLeft") goToPage(state.currentPage - 1);
  if (event.key === "ArrowRight") goToPage(state.currentPage + 1);
  if (event.key === "+" || event.key === "=") setZoom(state.scale + 0.1);
  if (event.key === "-" || event.key === "_") setZoom(state.scale - 0.1);
  if (event.key.toLowerCase() === "l") setLaserEnabled(!state.laserEnabled);
  if (event.key.toLowerCase() === "s") setSpotlightEnabled(!state.spotlightEnabled);
  if (event.key.toLowerCase() === "b") toggleReaderMode();
  if (event.key.toLowerCase() === "h") toggleUiHidden();
  if (event.key.toLowerCase() === "f") toggleFullscreen();
  if (event.key === "Escape") {
    stopAutoScroll();
    setLaserEnabled(false);
    setSpotlightEnabled(false);
    app.classList.remove("ui-hidden");
  }
});

document.addEventListener("fullscreenchange", () => {
  fullscreenBtn.textContent = document.fullscreenElement ? "Exit Full Screen" : "Full Screen";
});

initializeBoardCanvas();
setBoardTheme(state.boardTheme);
syncModeControls();
resetCountdown();
updateUndoRedoButtons();
laserDot.style.setProperty("--laser-color", state.laserColor);
laserDot.style.setProperty("--laser-size", `${state.laserSize}px`);
laserFadeValue.textContent = `${laserFade.value}s`;
