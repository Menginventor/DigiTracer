/**
 * DigiTracer - Main Application Controller
 * Handles interactive canvas rendering, pan/zoom, calibration,
 * user interactions, and export workflows.
 */

class DigiTracerApp {
  constructor() {
    this.canvas = document.getElementById('mainCanvas');
    this.ctx = this.canvas.getContext('2d');
    
    // Virtual offscreen canvas for image processing
    this.imgCanvas = document.createElement('canvas');
    this.imgCtx = this.imgCanvas.getContext('2d', { willReadFrequently: true });
    
    // State
    this.sourceImage = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
    
    // Viewport transform
    this.view = {
      x: 60,
      y: 60,
      scale: 0.8,
      isPanning: false,
      startX: 0,
      startY: 0
    };
    
    // Tool mode: 'pan', 'calibrate', 'draw'
    this.activeMode = 'pan';
    
    // Calibration state
    this.calibration = {
      points: [],
      ppm: 1.0, // pixels per mm (default uncalibrated: 1px = 1 unit)
      unit: 'mm',
      isCalibrated: false
    };
    
    // Image filter settings
    this.filters = {
      threshold: 128,
      contrast: 1.2,
      brightness: 0,
      invert: false,
      showBinary: false
    };
    
    // Tracing & Vectors
    this.rawContours = [];
    this.vectorPaths = []; // Final paths in image space
    this.minArea = 200;
    this.simplifyTolerance = 1.5;
    this.smoothSplines = false;
    
    // Manual path drawing
    this.manualPath = [];
    
    // Visibility layers
    this.layers = {
      image: true,
      grid: true,
      vectors: true,
      points: false
    };

    this.initDOM();
    this.initCanvasEvents();
    this.initDragDrop();
    this.resizeCanvas();
    
    // Load initial sample scan
    this.loadSampleScan();
  }

  /* ----------------------------------------------------
     DOM & UI Initialization
     ---------------------------------------------------- */
  initDOM() {
    // Window resize
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.render();
    });

    // Tab Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetTab = document.getElementById(`tab-${btn.dataset.tab}`);
        if (targetTab) targetTab.classList.add('active');
      });
    });

    // File Upload
    const fileInput = document.getElementById('imageUploadInput');
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.loadImageFile(e.target.files[0]);
      }
    });

    // Sample Scan Button
    document.getElementById('btnSampleScan').addEventListener('click', () => {
      this.loadSampleScan();
    });

    // Image Adjustments
    const sliderThreshold = document.getElementById('sliderThreshold');
    sliderThreshold.addEventListener('input', (e) => {
      this.filters.threshold = parseInt(e.target.value);
      document.getElementById('valThreshold').textContent = this.filters.threshold;
      this.render();
    });

    const sliderContrast = document.getElementById('sliderContrast');
    sliderContrast.addEventListener('input', (e) => {
      this.filters.contrast = parseFloat(e.target.value);
      document.getElementById('valContrast').textContent = this.filters.contrast.toFixed(1);
      this.render();
    });

    const sliderBrightness = document.getElementById('sliderBrightness');
    sliderBrightness.addEventListener('input', (e) => {
      this.filters.brightness = parseInt(e.target.value);
      document.getElementById('valBrightness').textContent = this.filters.brightness;
      this.render();
    });

    const checkInvert = document.getElementById('checkInvert');
    checkInvert.addEventListener('change', (e) => {
      this.filters.invert = e.target.checked;
      this.render();
    });

    const checkBinaryPreview = document.getElementById('checkBinaryPreview');
    checkBinaryPreview.addEventListener('change', (e) => {
      this.filters.showBinary = e.target.checked;
      this.render();
    });

    document.getElementById('btnResetFilters').addEventListener('click', () => {
      this.filters = { threshold: 128, contrast: 1.0, brightness: 0, invert: false, showBinary: false };
      sliderThreshold.value = 128;
      sliderContrast.value = 1.0;
      sliderBrightness.value = 0;
      checkInvert.checked = false;
      checkBinaryPreview.checked = false;
      document.getElementById('valThreshold').textContent = '128';
      document.getElementById('valContrast').textContent = '1.0';
      document.getElementById('valBrightness').textContent = '0';
      this.render();
      this.showToast('Image filters reset');
    });

    // Calibration Controls
    document.getElementById('btnCalibrateTool').addEventListener('click', () => {
      this.startCalibrationMode();
    });

    document.getElementById('btnApplyCalibration').addEventListener('click', () => {
      const realLen = parseFloat(document.getElementById('inputRealLength').value);
      const unit = document.getElementById('selectUnit').value;
      if (this.calibration.points.length === 2 && realLen > 0) {
        this.finishCalibration(realLen, unit);
      } else {
        this.showToast('Please set 2 points first using calibration tool', true);
      }
    });

    // Calibration Modal
    document.getElementById('modalBtnConfirm').addEventListener('click', () => {
      const val = parseFloat(document.getElementById('modalRealDistance').value);
      const unit = document.getElementById('modalUnitSelect').value;
      if (val > 0) {
        this.finishCalibration(val, unit);
        document.getElementById('calibrationModal').classList.remove('active');
      }
    });

    document.getElementById('modalBtnCancel').addEventListener('click', () => {
      document.getElementById('calibrationModal').classList.remove('active');
    });

    // Tracing Controls
    document.getElementById('btnAutoTrace').addEventListener('click', () => {
      this.runAutoTrace();
    });

    const sliderMinArea = document.getElementById('sliderMinArea');
    sliderMinArea.addEventListener('input', (e) => {
      this.minArea = parseInt(e.target.value);
      document.getElementById('valMinArea').textContent = `${this.minArea} px`;
      if (this.rawContours.length > 0) {
        this.runAutoTrace();
      }
    });

    const sliderSimplify = document.getElementById('sliderSimplify');
    sliderSimplify.addEventListener('input', (e) => {
      this.simplifyTolerance = parseFloat(e.target.value);
      document.getElementById('valSimplify').textContent = `${this.simplifyTolerance.toFixed(1)} px`;
      this.updateSimplifiedPaths();
      this.render();
    });

    const checkSmoothCurves = document.getElementById('checkSmoothCurves');
    checkSmoothCurves.addEventListener('change', (e) => {
      this.smoothSplines = e.target.checked;
      this.updateSimplifiedPaths();
      this.render();
    });

    document.getElementById('btnClearPaths').addEventListener('click', () => {
      this.rawContours = [];
      this.vectorPaths = [];
      this.manualPath = [];
      this.updateStats();
      this.render();
      this.showToast('Contours cleared');
    });

    document.getElementById('btnManualPen').addEventListener('click', () => {
      this.activeMode = this.activeMode === 'draw' ? 'pan' : 'draw';
      const btn = document.getElementById('btnManualPen');
      if (this.activeMode === 'draw') {
        btn.classList.add('btn-primary');
        btn.textContent = '✏️ Finish Path';
        this.showToast('Click points on canvas to draw. Click Finish to save.');
      } else {
        btn.classList.remove('btn-primary');
        btn.textContent = '✏️ Draw Path';
        if (this.manualPath.length > 2) {
          this.vectorPaths.push([...this.manualPath]);
          this.manualPath = [];
          this.updateStats();
          this.render();
        }
      }
    });

    // Toolbar Controls
    document.getElementById('toolPan').addEventListener('click', () => {
      this.activeMode = 'pan';
      this.updateToolbarActive();
    });

    document.getElementById('toolZoomIn').addEventListener('click', () => {
      this.zoomAtCenter(1.25);
    });

    document.getElementById('toolZoomOut').addEventListener('click', () => {
      this.zoomAtCenter(0.8);
    });

    document.getElementById('toolFit').addEventListener('click', () => {
      this.fitToScreen();
    });

    // Layer toggles
    this.setupLayerToggle('toggleImage', 'image');
    this.setupLayerToggle('toggleGrid', 'grid');
    this.setupLayerToggle('toggleVectors', 'vectors');
    this.setupLayerToggle('togglePoints', 'points');

    // Export Handlers
    document.getElementById('btnExportDXF').addEventListener('click', () => {
      this.exportDXF();
    });

    document.getElementById('btnExportSVG').addEventListener('click', () => {
      this.exportSVG();
    });

    document.getElementById('btnExportJSON').addEventListener('click', () => {
      this.exportJSON();
    });

    document.getElementById('btnCopySVG').addEventListener('click', () => {
      this.copySVG();
    });
  }

  setupLayerToggle(elementId, layerKey) {
    const el = document.getElementById(elementId);
    el.addEventListener('click', () => {
      this.layers[layerKey] = !this.layers[layerKey];
      el.classList.toggle('active', this.layers[layerKey]);
      this.render();
    });
  }

  updateToolbarActive() {
    document.getElementById('toolPan').classList.toggle('active', this.activeMode === 'pan');
  }

  /* ----------------------------------------------------
     Canvas Viewport & Interaction
     ---------------------------------------------------- */
  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.ctx.scale(dpr, dpr);
    this.render();
  }

  initCanvasEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        this.fitToScreen();
      } else if (e.key === 'Escape') {
        if (this.activeMode === 'calibrate') {
          this.activeMode = 'pan';
          this.calibration.points = [];
          document.getElementById('calibrateBtnText').textContent = 'Set 2 Calibration Points';
          this.render();
        }
      }
    });
  }

  clientToWorld(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    return {
      x: (cx - this.view.x) / this.view.scale,
      y: (cy - this.view.y) / this.view.scale
    };
  }

  worldToClient(worldX, worldY) {
    return {
      x: worldX * this.view.scale + this.view.x,
      y: worldY * this.view.scale + this.view.y
    };
  }

  onMouseDown(e) {
    const worldPt = this.clientToWorld(e.clientX, e.clientY);

    // Pan canvas with middle button or left click in pan mode
    if (e.button === 1 || (e.button === 0 && this.activeMode === 'pan')) {
      this.view.isPanning = true;
      this.view.startX = e.clientX - this.view.x;
      this.view.startY = e.clientY - this.view.y;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // Calibration Mode
    if (e.button === 0 && this.activeMode === 'calibrate') {
      if (this.calibration.points.length < 2) {
        this.calibration.points.push(worldPt);
        if (this.calibration.points.length === 1) {
          document.getElementById('calibrationStepInfo').textContent = 'Point 1 set. Now click Point 2...';
          this.render();
        } else if (this.calibration.points.length === 2) {
          const pt1 = this.calibration.points[0];
          const pt2 = this.calibration.points[1];
          const pixelDist = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);

          document.getElementById('infoPixelDist').textContent = `${pixelDist.toFixed(1)} px`;
          document.getElementById('modalPixelSpan').textContent = pixelDist.toFixed(1);
          document.getElementById('calibrationModal').classList.add('active');

          this.activeMode = 'pan';
          document.getElementById('calibrateBtnText').textContent = 'Scale Points Selected';
          this.render();
        }
      }
      return;
    }

    // Manual Draw Mode
    if (e.button === 0 && this.activeMode === 'draw') {
      this.manualPath.push(worldPt);
      this.render();
    }
  }

  onMouseMove(e) {
    if (this.view.isPanning) {
      this.view.x = e.clientX - this.view.startX;
      this.view.y = e.clientY - this.view.startY;
      this.render();
      return;
    }

    // Update coordinate status bar
    const worldPt = this.clientToWorld(e.clientX, e.clientY);
    const mmX = (worldPt.x / this.calibration.ppm).toFixed(2);
    const mmY = (worldPt.y / this.calibration.ppm).toFixed(2);
    const pxX = Math.round(worldPt.x);
    const pxY = Math.round(worldPt.y);

    const coordsDisplay = document.getElementById('cursorCoords');
    coordsDisplay.textContent = `X: ${mmX} ${this.calibration.unit} | Y: ${mmY} ${this.calibration.unit} (${pxX} px, ${pxY} px)`;

    // Live preview when drawing or calibrating
    if (this.activeMode === 'calibrate' && this.calibration.points.length === 1) {
      this.calibrationPreviewPt = worldPt;
      this.render();
    }
  }

  onMouseUp(e) {
    if (this.view.isPanning) {
      this.view.isPanning = false;
      this.canvas.style.cursor = 'crosshair';
    }
  }

  onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    const newScale = Math.max(0.05, Math.min(40.0, this.view.scale * zoomFactor));

    // Zoom centered on cursor
    this.view.x = mouseX - (mouseX - this.view.x) * (newScale / this.view.scale);
    this.view.y = mouseY - (mouseY - this.view.y) * (newScale / this.view.scale);
    this.view.scale = newScale;

    document.getElementById('zoomLevel').textContent = `${Math.round(this.view.scale * 100)}%`;
    this.render();
  }

  zoomAtCenter(factor) {
    const rect = this.canvas.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const newScale = Math.max(0.05, Math.min(40.0, this.view.scale * factor));

    this.view.x = centerX - (centerX - this.view.x) * (newScale / this.view.scale);
    this.view.y = centerY - (centerY - this.view.y) * (newScale / this.view.scale);
    this.view.scale = newScale;

    document.getElementById('zoomLevel').textContent = `${Math.round(this.view.scale * 100)}%`;
    this.render();
  }

  fitToScreen() {
    if (!this.imageWidth || !this.imageHeight) return;
    const rect = this.canvas.getBoundingClientRect();
    const padding = 80;
    const scaleX = (rect.width - padding) / this.imageWidth;
    const scaleY = (rect.height - padding) / this.imageHeight;
    this.view.scale = Math.min(scaleX, scaleY);
    this.view.x = (rect.width - this.imageWidth * this.view.scale) / 2;
    this.view.y = (rect.height - this.imageHeight * this.view.scale) / 2;

    document.getElementById('zoomLevel').textContent = `${Math.round(this.view.scale * 100)}%`;
    this.render();
  }

  /* ----------------------------------------------------
     Drag & Drop Handling
     ---------------------------------------------------- */
  initDragDrop() {
    const overlay = document.getElementById('dropOverlay');
    const viewport = document.getElementById('viewport');

    ['dragenter', 'dragover'].forEach(eventName => {
      viewport.addEventListener(eventName, (e) => {
        e.preventDefault();
        overlay.classList.add('active');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      viewport.addEventListener(eventName, (e) => {
        e.preventDefault();
        overlay.classList.remove('active');
      });
    });

    viewport.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this.loadImageFile(e.dataTransfer.files[0]);
      }
    });
  }

  loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        this.setImage(img);
        this.showToast(`Loaded ${file.name}`);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  loadSampleScan() {
    const sampleCanvas = SampleGenerator.createSampleScan();
    const img = new Image();
    img.onload = () => {
      this.setImage(img);
      // Auto calibrate to sample's reference: 200px = 50.0mm => 4.0 px/mm
      this.calibration.ppm = 4.0;
      this.calibration.unit = 'mm';
      this.calibration.isCalibrated = true;
      this.calibration.points = [
        { x: 100, y: 120 },
        { x: 300, y: 120 }
      ];
      this.updateCalibrationDisplay();
      this.fitToScreen();
      // Auto-trace sample immediately so user sees vectors right away
      this.runAutoTrace();
      this.showToast('Sample mechanical scan loaded & calibrated!');
    };
    img.src = sampleCanvas.toDataURL();
  }

  setImage(img) {
    this.sourceImage = img;
    this.imageWidth = img.width;
    this.imageHeight = img.height;

    this.imgCanvas.width = this.imageWidth;
    this.imgCanvas.height = this.imageHeight;
    this.imgCtx.drawImage(img, 0, 0);

    this.rawContours = [];
    this.vectorPaths = [];
    this.manualPath = [];

    this.fitToScreen();
    this.render();
  }

  /* ----------------------------------------------------
     Calibration Operations
     ---------------------------------------------------- */
  startCalibrationMode() {
    this.activeMode = 'calibrate';
    this.calibration.points = [];
    document.getElementById('calibrateBtnText').textContent = 'Click Point 1 on Image';
    document.getElementById('calibrationStepInfo').textContent = 'Click Point 1 (e.g. start of a ruler or feature).';
    this.showToast('Calibration active: Click 2 reference points on image');
    this.render();
  }

  finishCalibration(realDistance, unit = 'mm') {
    if (this.calibration.points.length !== 2) return;
    const pt1 = this.calibration.points[0];
    const pt2 = this.calibration.points[1];
    const pixelDist = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);

    let mmDist = realDistance;
    if (unit === 'cm') mmDist = realDistance * 10;
    if (unit === 'in') mmDist = realDistance * 25.4;

    this.calibration.ppm = pixelDist / mmDist;
    this.calibration.unit = unit;
    this.calibration.isCalibrated = true;

    this.updateCalibrationDisplay();
    this.updateStats();
    this.showToast(`Calibrated: ${this.calibration.ppm.toFixed(3)} px/mm (${unit})`);
    this.render();
  }

  updateCalibrationDisplay() {
    const indicator = document.getElementById('scaleIndicator');
    const text = document.getElementById('scaleStatusText');
    const infoScaleRatio = document.getElementById('infoScaleRatio');

    if (this.calibration.isCalibrated) {
      indicator.classList.add('calibrated');
      text.textContent = `Scale: 1 ${this.calibration.unit} = ${(this.calibration.ppm).toFixed(2)} px`;
      infoScaleRatio.textContent = `${this.calibration.ppm.toFixed(3)} px/${this.calibration.unit}`;
    } else {
      indicator.classList.remove('calibrated');
      text.textContent = 'Scale: Uncalibrated (1 px = 1 unit)';
      infoScaleRatio.textContent = '1.000 px/unit';
    }
  }

  /* ----------------------------------------------------
     Computer Vision & Vector Contours
     ---------------------------------------------------- */
  runAutoTrace() {
    if (!this.sourceImage) {
      this.showToast('Please open an image first', true);
      return;
    }

    document.getElementById('canvasStatus').textContent = 'Tracing contours...';

    // 1. Process image on offscreen canvas
    this.imgCtx.drawImage(this.sourceImage, 0, 0);
    const { binary, previewImageData } = ImageTracer.processToBinary(
      this.imgCtx,
      this.imageWidth,
      this.imageHeight,
      this.filters
    );

    this.binaryPreviewData = previewImageData;

    // 2. Extract closed contours using Moore-Neighbor algorithm
    this.rawContours = ImageTracer.findContours(
      binary,
      this.imageWidth,
      this.imageHeight,
      this.minArea
    );

    // 3. Simplify paths with Douglas-Peucker
    this.updateSimplifiedPaths();

    document.getElementById('canvasStatus').textContent = `Detected ${this.vectorPaths.length} contours`;
    this.showToast(`Auto-traced ${this.vectorPaths.length} boundary contours!`);
    this.render();
  }

  updateSimplifiedPaths() {
    this.vectorPaths = this.rawContours.map(contour => {
      let simplified = ImageTracer.simplify(contour, this.simplifyTolerance);
      if (this.smoothSplines) {
        simplified = ImageTracer.smoothCurve(simplified);
      }
      return simplified;
    });

    this.updateStats();
  }

  updateStats() {
    let totalVerts = 0;
    let totalPerimeterPx = 0;
    let totalAreaPx = 0;

    this.vectorPaths.forEach(path => {
      totalVerts += path.length;
      totalPerimeterPx += ImageTracer.calculatePerimeter(path);
      totalAreaPx += Math.abs(ImageTracer.calculatePolygonArea(path));
    });

    const ppm = this.calibration.ppm || 1.0;
    const perimMM = (totalPerimeterPx / ppm).toFixed(1);
    const areaMM2 = (totalAreaPx / (ppm * ppm)).toFixed(1);

    document.getElementById('statContourCount').textContent = this.vectorPaths.length;
    document.getElementById('statVertexCount').textContent = totalVerts;
    document.getElementById('statPerimeter').textContent = `${perimMM} ${this.calibration.unit}`;
    document.getElementById('statArea').textContent = `${areaMM2} ${this.calibration.unit}²`;
  }

  /* ----------------------------------------------------
     Canvas Render Pipeline
     ---------------------------------------------------- */
  render() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);

    this.ctx.save();
    // Apply Viewport Pan & Zoom
    this.ctx.translate(this.view.x, this.view.y);
    this.ctx.scale(this.view.scale, this.view.scale);

    // 1. Engineering CAD Grid Layer
    if (this.layers.grid) {
      this.renderCADGrid();
    }

    // 2. Image Layer (Original or Filtered/Binary)
    if (this.layers.image && this.sourceImage) {
      this.ctx.save();
      if (this.filters.showBinary && this.binaryPreviewData) {
        // Draw binary mask
        this.ctx.putImageData(this.binaryPreviewData, 0, 0); // PutImageData is unscaled
      } else {
        // Apply CSS filters on context
        const contrastPct = this.filters.contrast * 100;
        const brightnessPct = 100 + this.filters.brightness;
        const invertPct = this.filters.invert ? 100 : 0;
        this.ctx.filter = `contrast(${contrastPct}%) brightness(${brightnessPct}%) invert(${invertPct}%)`;
        this.ctx.drawImage(this.sourceImage, 0, 0);
      }
      this.ctx.restore();

      // Image Boundary Border
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      this.ctx.lineWidth = 1 / this.view.scale;
      this.ctx.strokeRect(0, 0, this.imageWidth, this.imageHeight);
    }

    // 3. Traced Vector Contours Layer
    if (this.layers.vectors && this.vectorPaths.length > 0) {
      this.renderVectors();
    }

    // 4. Manual Path in progress
    if (this.manualPath.length > 0) {
      this.renderManualPath();
    }

    // 5. Calibration Overlay
    this.renderCalibrationOverlay();

    this.ctx.restore();
  }

  renderCADGrid() {
    const ppm = this.calibration.ppm || 1.0;
    // Base grid every 10mm (or 40px uncalibrated)
    const mmStep = 10;
    const gridSpacing = ppm * mmStep;

    const w = this.imageWidth || 1200;
    const h = this.imageHeight || 900;

    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.08)';
    this.ctx.lineWidth = 1 / this.view.scale;

    for (let x = 0; x <= w; x += gridSpacing) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }

    for (let y = 0; y <= h; y += gridSpacing) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }

    // Major 50mm grid lines
    this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.18)';
    this.ctx.lineWidth = 1.5 / this.view.scale;
    for (let x = 0; x <= w; x += gridSpacing * 5) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }
    for (let y = 0; y <= h; y += gridSpacing * 5) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(w, y);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  renderVectors() {
    this.ctx.save();
    const lineWidth = 2 / this.view.scale;

    this.vectorPaths.forEach((path, idx) => {
      if (!path || path.length < 2) return;

      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        this.ctx.lineTo(path[i].x, path[i].y);
      }
      this.ctx.closePath();

      // Outer paths cyan, inner holes yellow
      this.ctx.strokeStyle = idx === 0 ? '#00f0ff' : '#f59e0b';
      this.ctx.lineWidth = lineWidth;
      this.ctx.shadowColor = idx === 0 ? 'rgba(0, 240, 255, 0.5)' : 'rgba(245, 158, 11, 0.4)';
      this.ctx.shadowBlur = 6;
      this.ctx.stroke();

      // Subtle fill
      this.ctx.fillStyle = idx === 0 ? 'rgba(0, 240, 255, 0.04)' : 'rgba(245, 158, 11, 0.04)';
      this.ctx.fill();

      // Render vertex nodes if enabled
      if (this.layers.points) {
        this.ctx.fillStyle = '#ffffff';
        const nodeRadius = 3 / this.view.scale;
        path.forEach(pt => {
          this.ctx.beginPath();
          this.ctx.arc(pt.x, pt.y, nodeRadius, 0, Math.PI * 2);
          this.ctx.fill();
        });
      }
    });

    this.ctx.restore();
  }

  renderManualPath() {
    this.ctx.save();
    this.ctx.strokeStyle = '#10b981';
    this.ctx.lineWidth = 2 / this.view.scale;
    this.ctx.beginPath();
    this.ctx.moveTo(this.manualPath[0].x, this.manualPath[0].y);
    for (let i = 1; i < this.manualPath.length; i++) {
      this.ctx.lineTo(this.manualPath[i].x, this.manualPath[i].y);
    }
    this.ctx.stroke();

    // Node handles
    this.ctx.fillStyle = '#10b981';
    const nodeRadius = 4 / this.view.scale;
    this.manualPath.forEach(pt => {
      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, nodeRadius, 0, Math.PI * 2);
      this.ctx.fill();
    });
    this.ctx.restore();
  }

  renderCalibrationOverlay() {
    if (this.calibration.points.length === 0) return;

    this.ctx.save();
    const pt1 = this.calibration.points[0];
    const pt2 = this.calibration.points.length === 2 ? this.calibration.points[1] : this.calibrationPreviewPt;

    // Point 1 Marker
    this.drawCalibrationTarget(pt1.x, pt1.y, 'A');

    if (pt2) {
      // Point 2 Marker
      this.drawCalibrationTarget(pt2.x, pt2.y, 'B');

      // Calibration measurement line
      this.ctx.strokeStyle = '#ec4899';
      this.ctx.lineWidth = 2 / this.view.scale;
      this.ctx.setLineDash([6 / this.view.scale, 4 / this.view.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(pt1.x, pt1.y);
      this.ctx.lineTo(pt2.x, pt2.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // Dimension distance badge in middle
      const midX = (pt1.x + pt2.x) / 2;
      const midY = (pt1.y + pt2.y) / 2;
      const distPx = Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y);
      const distStr = `${distPx.toFixed(1)} px (${(distPx / this.calibration.ppm).toFixed(1)} ${this.calibration.unit})`;

      this.ctx.fillStyle = 'rgba(17, 24, 39, 0.85)';
      this.ctx.strokeStyle = '#ec4899';
      this.ctx.lineWidth = 1 / this.view.scale;
      const fontSize = Math.max(11, 13 / this.view.scale);
      this.ctx.font = `600 ${fontSize}px sans-serif`;
      const textWidth = this.ctx.measureText(distStr).width;

      this.ctx.fillRect(midX - textWidth / 2 - 6, midY - fontSize, textWidth + 12, fontSize + 8);
      this.ctx.strokeRect(midX - textWidth / 2 - 6, midY - fontSize, textWidth + 12, fontSize + 8);

      this.ctx.fillStyle = '#f3f4f6';
      this.ctx.fillText(distStr, midX - textWidth / 2, midY - 2);
    }

    this.ctx.restore();
  }

  drawCalibrationTarget(x, y, label) {
    const r = 8 / this.view.scale;
    this.ctx.strokeStyle = '#ec4899';
    this.ctx.lineWidth = 2 / this.view.scale;
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.moveTo(x - r * 1.5, y);
    this.ctx.lineTo(x + r * 1.5, y);
    this.ctx.moveTo(x, y - r * 1.5);
    this.ctx.lineTo(x, y + r * 1.5);
    this.ctx.stroke();

    this.ctx.fillStyle = '#ec4899';
    const fontSize = Math.max(10, 12 / this.view.scale);
    this.ctx.font = `bold ${fontSize}px sans-serif`;
    this.ctx.fillText(label, x + r + 4, y - r);
  }

  /* ----------------------------------------------------
     CAD & Vector Export Methods
     ---------------------------------------------------- */
  getMillimeterPaths() {
    const ppm = this.calibration.ppm || 1.0;
    return this.vectorPaths.map(path => {
      return path.map(pt => ({
        x: pt.x / ppm,
        y: pt.y / ppm
      }));
    });
  }

  exportDXF() {
    if (this.vectorPaths.length === 0) {
      this.showToast('No contours to export! Trace an image first.', true);
      return;
    }
    const mmPaths = this.getMillimeterPaths();
    DXFGenerator.download(mmPaths, 'digitracer_part.dxf', {
      unit: this.calibration.unit,
      layerName: 'DIGITRACER_CONTOUR'
    });
    this.showToast('Downloaded AutoCAD DXF file!');
  }

  exportSVG() {
    if (this.vectorPaths.length === 0) {
      this.showToast('No contours to export! Trace an image first.', true);
      return;
    }
    const svgContent = this.generateSVGString();
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'digitracer_part.svg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showToast('Downloaded Scalable Vector Graphics (.SVG)!');
  }

  exportJSON() {
    if (this.vectorPaths.length === 0) {
      this.showToast('No contours to export! Trace an image first.', true);
      return;
    }
    const exportData = {
      meta: {
        app: 'DigiTracer',
        unit: this.calibration.unit,
        pixelsPerUnit: this.calibration.ppm,
        date: new Date().toISOString()
      },
      pathsMM: this.getMillimeterPaths(),
      pathsPixel: this.vectorPaths
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'digitracer_paths.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showToast('Downloaded path coordinate JSON!');
  }

  generateSVGString() {
    const ppm = this.calibration.ppm || 1.0;
    const widthMM = (this.imageWidth / ppm).toFixed(2);
    const heightMM = (this.imageHeight / ppm).toFixed(2);
    const mmPaths = this.getMillimeterPaths();

    let pathsMarkup = '';
    mmPaths.forEach((path, idx) => {
      if (!path || path.length < 2) return;
      let d = `M ${path[0].x.toFixed(3)} ${path[0].y.toFixed(3)}`;
      for (let i = 1; i < path.length; i++) {
        d += ` L ${path[i].x.toFixed(3)} ${path[i].y.toFixed(3)}`;
      }
      d += ' Z';
      const stroke = idx === 0 ? '#00f0ff' : '#f59e0b';
      pathsMarkup += `  <path d="${d}" fill="none" stroke="${stroke}" stroke-width="0.3" vector-effect="non-scaling-stroke" />\n`;
    });

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${widthMM}mm" height="${heightMM}mm" 
     viewBox="0 0 ${widthMM} ${heightMM}">
  <title>DigiTracer Calibrated Part</title>
  <desc>Exported from DigiTracer (Scale: 1 ${this.calibration.unit} = ${ppm.toFixed(2)} px)</desc>
  <g id="contours">
${pathsMarkup}  </g>
</svg>`;
  }

  copySVG() {
    if (this.vectorPaths.length === 0) {
      this.showToast('No contours to export! Trace an image first.', true);
      return;
    }
    const svg = this.generateSVGString();
    navigator.clipboard.writeText(svg).then(() => {
      this.showToast('SVG code copied to clipboard!');
    }).catch(() => {
      this.showToast('Could not access clipboard', true);
    });
  }

  /* ----------------------------------------------------
     Notifications
     ---------------------------------------------------- */
  showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.borderColor = isError ? 'var(--danger-color)' : 'var(--border-active)';
    toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }
}

// Start application once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new DigiTracerApp();
});
