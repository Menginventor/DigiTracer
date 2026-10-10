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
    
    // Tool mode: 'pan', 'select', 'pixelEraser', 'pixelBrush', 'cadLine', 'cadRect', 'cadCircle', 'cadDim', 'calibrate', 'draw'
    this.activeMode = 'pan';
    this.brushSize = 12;
    this.isPainting = false;

    // Calibration state: default to 300 DPI for standard flatbed scan
    this.calibration = {
      points: [],
      dpi: 300,
      ppm: 300 / 25.4, // 11.811 px/mm
      unit: 'mm',
      isCalibrated: true
    };
    
    // Image filter settings tuned for scanned paper & ink lines
    this.filters = {
      threshold: 205,
      contrast: 1.2,
      brightness: 0,
      detectMode: 'dark-on-light',
      ignoreBorder: true,
      showBinary: false
    };
    
    // Tracing & Vectors
    this.rawContours = [];
    this.vectorPaths = []; // Final paths in image space
    this.minArea = 100;
    this.simplifyTolerance = 1.5;
    this.smoothSplines = false;

    // Circle Recognition state
    this.autoCircle = true;
    this.minCircularity = 0.60;
    this.selectedContourIndex = -1;
    
    // CAD Geometry & Dimensions
    this.dimensions = [];
    this.dimPoints = [];
    this.tempCadShape = null;
    this.draggedVertex = null;

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
    
    // Load the user's test scan as default image
    this.loadDefaultScan();
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

    // Header Buttons
    document.getElementById('btnSampleScan').addEventListener('click', () => {
      this.loadSampleScan();
    });

    const btnTestScan = document.getElementById('btnTestScan');
    if (btnTestScan) {
      btnTestScan.addEventListener('click', () => {
        this.loadDefaultScan();
      });
    }

    // Image Adjustments
    const selectDetectMode = document.getElementById('selectDetectMode');
    if (selectDetectMode) {
      selectDetectMode.addEventListener('change', (e) => {
        this.filters.detectMode = e.target.value;
        if (this.sourceImage) {
          this.runAutoTrace();
        }
      });
    }

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

    const checkIgnoreBorder = document.getElementById('checkIgnoreBorder');
    if (checkIgnoreBorder) {
      checkIgnoreBorder.addEventListener('change', (e) => {
        this.filters.ignoreBorder = e.target.checked;
        if (this.sourceImage) {
          this.runAutoTrace();
        }
      });
    }

    const checkBinaryPreview = document.getElementById('checkBinaryPreview');
    checkBinaryPreview.addEventListener('change', (e) => {
      this.filters.showBinary = e.target.checked;
      this.render();
    });

    document.getElementById('btnResetFilters').addEventListener('click', () => {
      this.filters = { threshold: 205, contrast: 1.2, brightness: 0, detectMode: 'dark-on-light', ignoreBorder: true, showBinary: false };
      sliderThreshold.value = 205;
      sliderContrast.value = 1.2;
      sliderBrightness.value = 0;
      if (selectDetectMode) selectDetectMode.value = 'dark-on-light';
      if (checkIgnoreBorder) checkIgnoreBorder.checked = true;
      checkBinaryPreview.checked = false;
      document.getElementById('valThreshold').textContent = '205';
      document.getElementById('valContrast').textContent = '1.2';
      document.getElementById('valBrightness').textContent = '0';
      if (this.sourceImage) {
        this.imgCtx.drawImage(this.sourceImage, 0, 0);
      }
      this.runAutoTrace();
      this.showToast('Image filters reset & pixel edits reloaded');
    });

    // Scanner DPI Calibration Controls
    const inputDPI = document.getElementById('inputDPI');
    const dpiPreview = document.getElementById('dpiScalePreview');

    const updateDPIPreview = () => {
      const dpiVal = parseFloat(inputDPI.value) || 300;
      const calcPpm = dpiVal / 25.4;
      if (dpiPreview) {
        dpiPreview.textContent = `${calcPpm.toFixed(3)} px/mm (${dpiVal} DPI)`;
      }
    };

    if (inputDPI) {
      inputDPI.addEventListener('input', updateDPIPreview);
    }

    // DPI Preset Chips
    document.querySelectorAll('.chip-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip-btn').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        if (inputDPI) {
          inputDPI.value = chip.dataset.dpi;
          updateDPIPreview();
        }
        this.applyDPIScale(parseFloat(chip.dataset.dpi));
      });
    });

    const btnApplyDPI = document.getElementById('btnApplyDPI');
    if (btnApplyDPI) {
      btnApplyDPI.addEventListener('click', () => {
        const dpiVal = parseFloat(inputDPI.value) || 300;
        this.applyDPIScale(dpiVal);
      });
    }

    // 2-Point Reference Calibration Controls
    document.getElementById('btnCalibrateTool').addEventListener('click', () => {
      this.startCalibrationMode();
    });

    document.getElementById('btnApplyCalibration').addEventListener('click', () => {
      const realLen = parseFloat(document.getElementById('inputRealLength').value);
      const unit = document.getElementById('selectUnit').value;
      if (this.calibration.points.length === 2 && realLen > 0) {
        this.finishCalibration(realLen, unit);
      } else {
        this.showToast('Please pick 2 points first using calibration tool', true);
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

    // Circle Recognition Controls
    const sliderCircularity = document.getElementById('sliderCircularity');
    if (sliderCircularity) {
      sliderCircularity.addEventListener('input', (e) => {
        this.minCircularity = parseInt(e.target.value) / 100;
        document.getElementById('valCircularity').textContent = `${e.target.value}%`;
        if (this.autoCircle && this.rawContours.length > 0) {
          this.updateSimplifiedPaths();
          this.render();
        }
      });
    }

    const checkAutoCircle = document.getElementById('checkAutoCircle');
    if (checkAutoCircle) {
      checkAutoCircle.addEventListener('change', (e) => {
        this.autoCircle = e.target.checked;
        this.updateSimplifiedPaths();
        this.render();
      });
    }

    const btnFitAllCircles = document.getElementById('btnFitAllCircles');
    if (btnFitAllCircles) {
      btnFitAllCircles.addEventListener('click', () => {
        this.convertAllNearCircularToCircles();
      });
    }

    const btnConvertSelectedCircle = document.getElementById('btnConvertSelectedCircle');
    if (btnConvertSelectedCircle) {
      btnConvertSelectedCircle.addEventListener('click', () => {
        this.convertSelectedContourToCircle();
      });
    }

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

    // Pixel Editor Controls (Scan Cleanup & Mask Pen)
    const btnToolEraser = document.getElementById('btnToolEraser');
    const toolPixelEraser = document.getElementById('toolPixelEraser');
    const btnToolBrush = document.getElementById('btnToolBrush');
    const toolPixelBrush = document.getElementById('toolPixelBrush');
    const sliderBrushSize = document.getElementById('sliderBrushSize');
    const btnClearDust = document.getElementById('btnClearDust');
    const btnTraceAfterEdit = document.getElementById('btnTraceAfterEdit');

    const setPixelMode = (mode) => {
      this.activeMode = this.activeMode === mode ? 'pan' : mode;
      this.updateToolbarActive();
      const modeName = this.activeMode === 'pixelEraser' ? 'Eraser' : (this.activeMode === 'pixelBrush' ? 'Ink Pen' : 'Pan');
      this.showToast(`Tool: ${modeName}`);
    };

    if (btnToolEraser) btnToolEraser.addEventListener('click', () => setPixelMode('pixelEraser'));
    if (toolPixelEraser) toolPixelEraser.addEventListener('click', () => setPixelMode('pixelEraser'));
    if (btnToolBrush) btnToolBrush.addEventListener('click', () => setPixelMode('pixelBrush'));
    if (toolPixelBrush) toolPixelBrush.addEventListener('click', () => setPixelMode('pixelBrush'));

    if (sliderBrushSize) {
      sliderBrushSize.addEventListener('input', (e) => {
        this.brushSize = parseInt(e.target.value);
        document.getElementById('valBrushSize').textContent = `${this.brushSize} px`;
      });
    }

    if (btnClearDust) {
      btnClearDust.addEventListener('click', () => {
        this.cleanNoiseDust();
      });
    }

    if (btnTraceAfterEdit) {
      btnTraceAfterEdit.addEventListener('click', () => {
        this.runAutoTrace();
      });
    }

    // CAD Drawing & Entity Tools
    const toolSelect = document.getElementById('toolSelect');
    const btnCadLine = document.getElementById('btnCadLine');
    const toolCadLine = document.getElementById('toolCadLine');
    const btnCadRect = document.getElementById('btnCadRect');
    const toolCadRect = document.getElementById('toolCadRect');
    const btnCadCircle = document.getElementById('btnCadCircle');
    const toolCadCircle = document.getElementById('toolCadCircle');
    const btnCadDim = document.getElementById('btnCadDim');
    const toolCadDim = document.getElementById('toolCadDim');
    const btnDeleteSelected = document.getElementById('btnDeleteSelected');
    const btnClearDims = document.getElementById('btnClearDims');

    const setCadTool = (mode, label) => {
      this.activeMode = this.activeMode === mode ? 'pan' : mode;
      this.dimPoints = [];
      this.tempCadShape = null;
      this.updateToolbarActive();
      this.showToast(`CAD Tool: ${this.activeMode === 'pan' ? 'Pan' : label}`);
    };

    if (toolSelect) toolSelect.addEventListener('click', () => setCadTool('select', 'Select & Move'));
    if (btnCadLine) btnCadLine.addEventListener('click', () => setCadTool('cadLine', 'Draw Line'));
    if (toolCadLine) toolCadLine.addEventListener('click', () => setCadTool('cadLine', 'Draw Line'));
    if (btnCadRect) btnCadRect.addEventListener('click', () => setCadTool('cadRect', 'Draw Rectangle'));
    if (toolCadRect) toolCadRect.addEventListener('click', () => setCadTool('cadRect', 'Draw Rectangle'));
    if (btnCadCircle) btnCadCircle.addEventListener('click', () => setCadTool('cadCircle', 'Draw Circle'));
    if (toolCadCircle) toolCadCircle.addEventListener('click', () => setCadTool('cadCircle', 'Draw Circle'));
    if (btnCadDim) btnCadDim.addEventListener('click', () => setCadTool('cadDim', 'Add Dimension (Click 2 Points)'));
    if (toolCadDim) toolCadDim.addEventListener('click', () => setCadTool('cadDim', 'Add Dimension (Click 2 Points)'));

    if (btnDeleteSelected) {
      btnDeleteSelected.addEventListener('click', () => {
        this.deleteSelectedContour();
      });
    }

    if (btnClearDims) {
      btnClearDims.addEventListener('click', () => {
        this.dimensions = [];
        this.updateDimensionsUI();
        this.render();
        this.showToast('Measurements cleared');
      });
    }

    // Toolbar Navigation & Zoom
    document.getElementById('toolPan').addEventListener('click', () => {
      this.activeMode = 'pan';
      this.dimPoints = [];
      this.tempCadShape = null;
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
    const tools = ['toolPan', 'toolSelect', 'toolPixelEraser', 'toolPixelBrush', 'toolCadLine', 'toolCadRect', 'toolCadCircle', 'toolCadDim'];
    tools.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    const activeMap = {
      pan: 'toolPan',
      select: 'toolSelect',
      pixelEraser: 'toolPixelEraser',
      pixelBrush: 'toolPixelBrush',
      cadLine: 'toolCadLine',
      cadRect: 'toolCadRect',
      cadCircle: 'toolCadCircle',
      cadDim: 'toolCadDim'
    };

    const activeId = activeMap[this.activeMode];
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) el.classList.add('active');
    }
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

    // Keyboard shortcuts for CAD operations
    window.addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        this.fitToScreen();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        this.deleteSelectedContour();
      } else if (e.key === 'Escape') {
        this.activeMode = 'pan';
        this.dimPoints = [];
        this.tempCadShape = null;
        this.calibration.points = [];
        this.updateToolbarActive();
        this.render();
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

  paintPixelAt(worldX, worldY) {
    if (!this.imgCtx) return;
    this.imgCtx.save();
    const isEraser = this.activeMode === 'pixelEraser';
    this.imgCtx.fillStyle = isEraser ? '#f8f9fa' : '#111827';
    this.imgCtx.beginPath();
    this.imgCtx.arc(worldX, worldY, this.brushSize / 2, 0, Math.PI * 2);
    this.imgCtx.fill();
    this.imgCtx.restore();
    this.render();
  }

  onMouseDown(e) {
    const worldPt = this.clientToWorld(e.clientX, e.clientY);
    this.mouseDownPos = { x: e.clientX, y: e.clientY };

    // 1. Pixel Painting Mode (Eraser / Ink Pen)
    if (e.button === 0 && (this.activeMode === 'pixelEraser' || this.activeMode === 'pixelBrush')) {
      this.isPainting = true;
      this.paintPixelAt(worldPt.x, worldPt.y);
      return;
    }

    // 2. CAD Line Tool
    if (e.button === 0 && this.activeMode === 'cadLine') {
      this.tempCadShape = { type: 'line', p1: worldPt, p2: worldPt };
      this.render();
      return;
    }

    // 3. CAD Rect Tool
    if (e.button === 0 && this.activeMode === 'cadRect') {
      this.tempCadShape = { type: 'rect', p1: worldPt, p2: worldPt };
      this.render();
      return;
    }

    // 4. CAD Circle Tool
    if (e.button === 0 && this.activeMode === 'cadCircle') {
      this.tempCadShape = { type: 'circle', center: worldPt, current: worldPt };
      this.render();
      return;
    }

    // 5. CAD Dimension Tool (Click 2 Points)
    if (e.button === 0 && this.activeMode === 'cadDim') {
      if (this.dimPoints.length === 0) {
        this.dimPoints.push(worldPt);
        this.showToast('Point 1 placed. Click Point 2 to place measurement.');
        this.render();
      } else {
        const p1 = this.dimPoints[0];
        const p2 = worldPt;
        const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const ppm = this.calibration.ppm || 1;
        const mmDist = distPx / ppm;
        this.dimensions.push({
          id: Date.now(),
          p1,
          p2,
          mmDist,
          text: `${mmDist.toFixed(1)} ${this.calibration.unit}`
        });
        this.dimPoints = [];
        this.updateDimensionsUI();
        this.render();
        this.showToast(`Measurement placed: ${mmDist.toFixed(1)} ${this.calibration.unit}`);
      }
      return;
    }

    // 6. Pan canvas with middle button or left click in pan/select mode
    if (e.button === 1 || (e.button === 0 && (this.activeMode === 'pan' || this.activeMode === 'select'))) {
      this.view.isPanning = true;
      this.view.startX = e.clientX - this.view.x;
      this.view.startY = e.clientY - this.view.y;
      this.canvas.style.cursor = 'grabbing';
      return;
    }

    // 7. Calibration Mode
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
          this.updateToolbarActive();
          this.render();
        }
      }
      return;
    }

    // 8. Manual Draw Mode
    if (e.button === 0 && this.activeMode === 'draw') {
      this.manualPath.push(worldPt);
      this.render();
    }
  }

  onMouseMove(e) {
    const worldPt = this.clientToWorld(e.clientX, e.clientY);
    this.mouseWorldPos = worldPt;

    // Pixel Painting Drag
    if (this.isPainting && (this.activeMode === 'pixelEraser' || this.activeMode === 'pixelBrush')) {
      this.paintPixelAt(worldPt.x, worldPt.y);
      return;
    }

    // Canvas Pan
    if (this.view.isPanning) {
      this.view.x = e.clientX - this.view.startX;
      this.view.y = e.clientY - this.view.startY;
      this.render();
      return;
    }

    // Live CAD Line Preview
    if (this.tempCadShape && this.tempCadShape.type === 'line') {
      this.tempCadShape.p2 = worldPt;
      this.render();
      return;
    }

    // Live CAD Rect Preview
    if (this.tempCadShape && this.tempCadShape.type === 'rect') {
      this.tempCadShape.p2 = worldPt;
      this.render();
      return;
    }

    // Live CAD Circle Preview
    if (this.tempCadShape && this.tempCadShape.type === 'circle') {
      this.tempCadShape.current = worldPt;
      this.render();
      return;
    }

    // Live Dimension Preview
    if (this.activeMode === 'cadDim' && this.dimPoints.length === 1) {
      this.render();
      return;
    }

    // Update coordinate status bar
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
    } else if (this.activeMode === 'pixelEraser' || this.activeMode === 'pixelBrush') {
      this.render(); // Redraw brush cursor circle
    }
  }

  onMouseUp(e) {
    const worldPt = this.clientToWorld(e.clientX, e.clientY);

    // End pixel painting
    if (this.isPainting) {
      this.isPainting = false;
      return;
    }

    // Commit CAD Line
    if (this.tempCadShape && this.tempCadShape.type === 'line') {
      const p1 = this.tempCadShape.p1;
      const p2 = worldPt;
      if (Math.hypot(p2.x - p1.x, p2.y - p1.y) > 4) {
        const linePath = [p1, p2];
        linePath.isLine = true;
        linePath.originalPoints = linePath;
        this.vectorPaths.push(linePath);
        const mmLen = (Math.hypot(p2.x - p1.x, p2.y - p1.y) / (this.calibration.ppm || 1)).toFixed(1);
        this.showToast(`CAD Line added (${mmLen} ${this.calibration.unit})`);
      }
      this.tempCadShape = null;
      this.updateStats();
      this.render();
      return;
    }

    // Commit CAD Rect
    if (this.tempCadShape && this.tempCadShape.type === 'rect') {
      const p1 = this.tempCadShape.p1;
      const p2 = worldPt;
      const w = Math.abs(p2.x - p1.x);
      const h = Math.abs(p2.y - p1.y);
      if (w > 4 && h > 4) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        const rectPath = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY }
        ];
        rectPath.isRect = true;
        rectPath.originalPoints = rectPath;
        this.vectorPaths.push(rectPath);
        const ppm = this.calibration.ppm || 1;
        const wMM = (w / ppm).toFixed(1);
        const hMM = (h / ppm).toFixed(1);
        this.showToast(`CAD Rectangle added (${wMM} × ${hMM} ${this.calibration.unit})`);
      }
      this.tempCadShape = null;
      this.updateStats();
      this.render();
      return;
    }

    // Commit CAD Circle
    if (this.tempCadShape && this.tempCadShape.type === 'circle') {
      const center = this.tempCadShape.center;
      const radius = Math.hypot(worldPt.x - center.x, worldPt.y - center.y);
      if (radius > 4) {
        const fittedCircle = ImageTracer.fitCircle([
          { x: center.x - radius, y: center.y },
          { x: center.x + radius, y: center.y },
          { x: center.x, y: center.y - radius },
          { x: center.x, y: center.y + radius }
        ]);
        fittedCircle.cx = center.x;
        fittedCircle.cy = center.y;
        fittedCircle.radius = radius;
        fittedCircle.diameter = radius * 2;
        this.vectorPaths.push(fittedCircle);
        const diaMM = (fittedCircle.diameter / (this.calibration.ppm || 1)).toFixed(1);
        this.showToast(`CAD Circle added (⌀${diaMM} ${this.calibration.unit})`);
      }
      this.tempCadShape = null;
      this.updateStats();
      this.render();
      return;
    }

    // Canvas Pan & Selection click
    if (this.view.isPanning) {
      this.view.isPanning = false;
      this.canvas.style.cursor = 'crosshair';

      // If mouse barely moved, treat as a selection click
      if (this.mouseDownPos && Math.hypot(e.clientX - this.mouseDownPos.x, e.clientY - this.mouseDownPos.y) < 6) {
        const clickedIdx = this.findContourAtPoint(worldPt);
        this.selectedContourIndex = clickedIdx;
        if (clickedIdx !== -1) {
          const path = this.vectorPaths[clickedIdx];
          const ppm = this.calibration.ppm || 1;
          if (path.isCircle) {
            const diaMM = (path.diameter / ppm).toFixed(1);
            this.showToast(`Selected Circle ⭕ (⌀${diaMM} mm)`);
          } else if (path.isLine) {
            const mmLen = (Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y) / ppm).toFixed(1);
            this.showToast(`Selected Line (${mmLen} mm)`);
          } else {
            const circ = Math.round(ImageTracer.calculateCircularity(path) * 100);
            this.showToast(`Selected Shape (Circularity: ${circ}%)`);
          }
        }
        this.render();
      }
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

  loadDefaultScan() {
    const img = new Image();
    img.onload = () => {
      this.setImage(img);
      // Flatbed scan is 300 DPI
      this.applyDPIScale(300);
      this.fitToScreen();
      // Auto-trace ink lines
      this.runAutoTrace();
      this.showToast('User test scan loaded (300 DPI calibrated)');
    };
    img.onerror = () => {
      // Fallback to Scan_20261010.png, test_scan.png or procedural sample
      const fallbackImg = new Image();
      fallbackImg.onload = () => {
        this.setImage(fallbackImg);
        this.applyDPIScale(300);
        this.fitToScreen();
        this.runAutoTrace();
      };
      fallbackImg.onerror = () => {
        this.loadSampleScan();
      };
      fallbackImg.src = 'assets/Scan_20261010.png';
    };
    img.src = 'assets/Scan_20261011.png';
  }

  applyDPIScale(dpi) {
    this.calibration.dpi = dpi;
    this.calibration.ppm = dpi / 25.4;
    this.calibration.unit = 'mm';
    this.calibration.isCalibrated = true;

    const inputDPI = document.getElementById('inputDPI');
    if (inputDPI) inputDPI.value = dpi;

    document.querySelectorAll('.chip-btn').forEach(c => {
      c.classList.toggle('active', parseFloat(c.dataset.dpi) === dpi);
    });

    const dpiPreview = document.getElementById('dpiScalePreview');
    if (dpiPreview) {
      dpiPreview.textContent = `${this.calibration.ppm.toFixed(3)} px/mm (${dpi} DPI)`;
    }

    this.updateCalibrationDisplay();
    this.updateStats();
    this.render();
  }

  loadSampleScan() {
    const sampleCanvas = SampleGenerator.createSampleScan();
    const img = new Image();
    img.onload = () => {
      this.setImage(img);
      // Auto calibrate to sample's reference: 200px = 50.0mm => 4.0 px/mm
      this.calibration.ppm = 4.0;
      this.calibration.dpi = null;
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
    this.dimensions = [];
    this.updateDimensionsUI();

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
    this.calibration.dpi = Math.round(this.calibration.ppm * 25.4);
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
      const dpiSuffix = this.calibration.dpi ? ` (${this.calibration.dpi} DPI)` : '';
      text.textContent = `Scale: 1 ${this.calibration.unit} = ${(this.calibration.ppm).toFixed(2)} px${dpiSuffix}`;
      if (infoScaleRatio) {
        infoScaleRatio.textContent = `${this.calibration.ppm.toFixed(3)} px/${this.calibration.unit}`;
      }
    } else {
      indicator.classList.remove('calibrated');
      text.textContent = 'Scale: Uncalibrated (1 px = 1 unit)';
      if (infoScaleRatio) {
        infoScaleRatio.textContent = '1.000 px/unit';
      }
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

    // 1. Process image on offscreen canvas (preserves user pixel edits, eraser & ink pen)
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
    this.vectorPaths = this.rawContours.map((contour) => {
      let simplified = ImageTracer.simplify(contour, this.simplifyTolerance);
      if (this.smoothSplines) {
        simplified = ImageTracer.smoothCurve(simplified);
      }

      // Check if contour is near-circular and auto-circle is enabled
      if (this.autoCircle) {
        const circ = ImageTracer.calculateCircularity(contour);
        if (circ >= this.minCircularity) {
          const fitted = ImageTracer.fitCircle(contour);
          if (fitted) return fitted;
        }
      }

      simplified.originalPoints = contour;
      return simplified;
    });

    this.updateStats();
  }

  convertAllNearCircularToCircles() {
    let count = 0;
    this.vectorPaths = this.vectorPaths.map(path => {
      const orig = path.originalPoints || path;
      const circ = ImageTracer.calculateCircularity(orig);
      if (circ >= (this.minCircularity || 0.50)) {
        const fitted = ImageTracer.fitCircle(orig);
        if (fitted) {
          count++;
          return fitted;
        }
      }
      return path;
    });
    this.updateStats();
    this.render();
    this.showToast(`Converted ${count} shape(s) to true CAD circles!`);
  }

  convertSelectedContourToCircle() {
    if (this.selectedContourIndex < 0 || this.selectedContourIndex >= this.vectorPaths.length) {
      this.showToast('Click a shape on the canvas first to select it', true);
      return;
    }
    const path = this.vectorPaths[this.selectedContourIndex];
    const orig = path.originalPoints || path;
    const fitted = ImageTracer.fitCircle(orig);
    if (fitted) {
      this.vectorPaths[this.selectedContourIndex] = fitted;
      this.updateStats();
      this.render();
      const diaMM = (fitted.diameter / (this.calibration.ppm || 1)).toFixed(1);
      this.showToast(`Selected contour converted to circle (⌀${diaMM} mm)!`);
    }
  }

  findContourAtPoint(pt) {
    const thresholdPx = 25 / this.view.scale;
    for (let i = 0; i < this.vectorPaths.length; i++) {
      const path = this.vectorPaths[i];
      if (path.isCircle) {
        const dist = Math.hypot(pt.x - path.cx, pt.y - path.cy);
        if (Math.abs(dist - path.radius) <= thresholdPx || dist <= path.radius) {
          return i;
        }
      } else {
        for (let j = 0; j < path.length; j++) {
          if (Math.hypot(pt.x - path[j].x, pt.y - path[j].y) <= thresholdPx) {
            return i;
          }
        }
      }
    }
    return -1;
  }

  updateStats() {
    let totalVerts = 0;
    let totalPerimeterPx = 0;
    let totalAreaPx = 0;
    let circleCount = 0;

    this.vectorPaths.forEach(path => {
      if (path.isCircle) circleCount++;
      totalVerts += path.length;
      totalPerimeterPx += ImageTracer.calculatePerimeter(path);
      totalAreaPx += Math.abs(ImageTracer.calculatePolygonArea(path));
    });

    const ppm = this.calibration.ppm || 1.0;
    const perimMM = (totalPerimeterPx / ppm).toFixed(1);
    const areaMM2 = (totalAreaPx / (ppm * ppm)).toFixed(1);

    const circleSuffix = circleCount > 0 ? ` (${circleCount} ⭕)` : '';
    document.getElementById('statContourCount').textContent = `${this.vectorPaths.length}${circleSuffix}`;
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

    // 2. Image Layer (Original or Filtered/Binary, including pixel eraser and ink pen edits)
    if (this.layers.image && this.sourceImage) {
      this.ctx.save();
      if (this.filters.showBinary && this.binaryPreviewData) {
        // Draw binary mask
        this.ctx.putImageData(this.binaryPreviewData, 0, 0);
      } else {
        // Apply CSS filters on context
        const contrastPct = this.filters.contrast * 100;
        const brightnessPct = 100 + this.filters.brightness;
        const invertPct = this.filters.invert ? 100 : 0;
        this.ctx.filter = `contrast(${contrastPct}%) brightness(${brightnessPct}%) invert(${invertPct}%)`;
        this.ctx.drawImage(this.imgCanvas, 0, 0);
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

    // 4. CAD Geometry Previews (Line, Rect, Circle, Dim being drawn)
    this.renderCadPreviews();

    // 5. CAD Measurement Dimensions Layer
    this.renderDimensions();

    // 6. Manual Path in progress
    if (this.manualPath.length > 0) {
      this.renderManualPath();
    }

    // 7. Calibration Overlay
    this.renderCalibrationOverlay();

    // 8. Pixel brush / eraser ring indicator
    this.renderBrushCursor();

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
    const ppm = this.calibration.ppm || 1.0;

    this.vectorPaths.forEach((path, idx) => {
      if (!path) return;
      const isSelected = this.selectedContourIndex === idx;

      // Circle Shape Rendering with CAD Center Crosshair & Diameter Badge
      if (path.isCircle) {
        this.ctx.beginPath();
        this.ctx.arc(path.cx, path.cy, path.radius, 0, Math.PI * 2);

        this.ctx.strokeStyle = isSelected ? '#ec4899' : (idx === 0 ? '#00f0ff' : '#f59e0b');
        this.ctx.lineWidth = isSelected ? lineWidth * 1.6 : lineWidth;
        this.ctx.shadowColor = isSelected ? 'rgba(236, 72, 153, 0.8)' : (idx === 0 ? 'rgba(0, 240, 255, 0.5)' : 'rgba(245, 158, 11, 0.4)');
        this.ctx.shadowBlur = isSelected ? 12 : 6;
        this.ctx.stroke();

        this.ctx.fillStyle = isSelected ? 'rgba(236, 72, 153, 0.1)' : 'rgba(0, 240, 255, 0.05)';
        this.ctx.fill();

        // CAD Center Crosshair
        const crossSize = Math.max(6 / this.view.scale, Math.min(16 / this.view.scale, path.radius * 0.35));
        this.ctx.strokeStyle = isSelected ? '#ec4899' : 'rgba(255, 255, 255, 0.6)';
        this.ctx.lineWidth = 1 / this.view.scale;
        this.ctx.beginPath();
        this.ctx.moveTo(path.cx - crossSize, path.cy);
        this.ctx.lineTo(path.cx + crossSize, path.cy);
        this.ctx.moveTo(path.cx, path.cy - crossSize);
        this.ctx.lineTo(path.cx, path.cy + crossSize);
        this.ctx.stroke();

        // Center dot
        this.ctx.beginPath();
        this.ctx.arc(path.cx, path.cy, 2 / this.view.scale, 0, Math.PI * 2);
        this.ctx.fillStyle = isSelected ? '#ec4899' : '#00f0ff';
        this.ctx.fill();

        // Diameter Dimension Label (e.g. ⌀13.1 mm)
        const diaMM = (path.diameter / ppm).toFixed(1);
        const dimStr = `⌀${diaMM} ${this.calibration.unit}`;
        const fontSize = Math.max(10, 12 / this.view.scale);
        this.ctx.font = `600 ${fontSize}px var(--font-mono), monospace`;
        this.ctx.fillStyle = isSelected ? '#ec4899' : '#f3f4f6';
        this.ctx.fillText(dimStr, path.cx + path.radius + 6 / this.view.scale, path.cy + 4 / this.view.scale);

        return;
      }

      if (path.length < 2) return;

      // CAD Line Rendering
      if (path.isLine && path.length >= 2) {
        this.ctx.beginPath();
        this.ctx.moveTo(path[0].x, path[0].y);
        this.ctx.lineTo(path[1].x, path[1].y);
        this.ctx.strokeStyle = isSelected ? '#ec4899' : '#10b981';
        this.ctx.lineWidth = isSelected ? lineWidth * 1.6 : lineWidth;
        this.ctx.shadowColor = isSelected ? 'rgba(236, 72, 153, 0.8)' : 'rgba(16, 185, 129, 0.4)';
        this.ctx.shadowBlur = isSelected ? 12 : 6;
        this.ctx.stroke();

        if (this.layers.points || isSelected) {
          this.ctx.fillStyle = isSelected ? '#ec4899' : '#ffffff';
          const nodeRadius = 3 / this.view.scale;
          [path[0], path[1]].forEach(pt => {
            this.ctx.beginPath();
            this.ctx.arc(pt.x, pt.y, nodeRadius, 0, Math.PI * 2);
            this.ctx.fill();
          });
        }
        return;
      }

      this.ctx.beginPath();
      this.ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        this.ctx.lineTo(path[i].x, path[i].y);
      }
      this.ctx.closePath();

      // Outer paths cyan, inner holes yellow, selected pink
      this.ctx.strokeStyle = isSelected ? '#ec4899' : (idx === 0 ? '#00f0ff' : '#f59e0b');
      this.ctx.lineWidth = isSelected ? lineWidth * 1.6 : lineWidth;
      this.ctx.shadowColor = isSelected ? 'rgba(236, 72, 153, 0.8)' : (idx === 0 ? 'rgba(0, 240, 255, 0.5)' : 'rgba(245, 158, 11, 0.4)');
      this.ctx.shadowBlur = isSelected ? 12 : 6;
      this.ctx.stroke();

      // Subtle fill
      this.ctx.fillStyle = isSelected ? 'rgba(236, 72, 153, 0.1)' : (idx === 0 ? 'rgba(0, 240, 255, 0.04)' : 'rgba(245, 158, 11, 0.04)');
      this.ctx.fill();

      // Render vertex nodes if enabled
      if (this.layers.points) {
        this.ctx.fillStyle = isSelected ? '#ec4899' : '#ffffff';
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
     CAD Rendering, Dimensions & Editing Methods
     ---------------------------------------------------- */
  renderCadPreviews() {
    this.ctx.save();
    const ppm = this.calibration.ppm || 1.0;
    const lineWidth = 2 / this.view.scale;
    const fontSize = Math.max(10, 12 / this.view.scale);
    this.ctx.font = `600 ${fontSize}px var(--font-mono), monospace`;

    // 1. Live Line preview
    if (this.tempCadShape && this.tempCadShape.type === 'line') {
      const p1 = this.tempCadShape.p1;
      const p2 = this.tempCadShape.p2;
      this.ctx.strokeStyle = '#10b981';
      this.ctx.lineWidth = lineWidth;
      this.ctx.setLineDash([5 / this.view.scale, 3 / this.view.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      const lenMM = (Math.hypot(p2.x - p1.x, p2.y - p1.y) / ppm).toFixed(1);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      this.ctx.fillStyle = '#10b981';
      this.ctx.fillText(`L: ${lenMM} ${this.calibration.unit}`, midX + 8 / this.view.scale, midY - 6 / this.view.scale);
    }

    // 2. Live Rect preview
    if (this.tempCadShape && this.tempCadShape.type === 'rect') {
      const p1 = this.tempCadShape.p1;
      const p2 = this.tempCadShape.p2;
      const minX = Math.min(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x);
      const h = Math.abs(p2.y - p1.y);

      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = lineWidth;
      this.ctx.setLineDash([5 / this.view.scale, 3 / this.view.scale]);
      this.ctx.strokeRect(minX, minY, w, h);
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
      this.ctx.fillRect(minX, minY, w, h);
      this.ctx.setLineDash([]);

      const wMM = (w / ppm).toFixed(1);
      const hMM = (h / ppm).toFixed(1);
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.fillText(`${wMM} × ${hMM} ${this.calibration.unit}`, minX + 6 / this.view.scale, minY - 6 / this.view.scale);
    }

    // 3. Live Circle preview
    if (this.tempCadShape && this.tempCadShape.type === 'circle') {
      const c = this.tempCadShape.center;
      const cur = this.tempCadShape.current;
      const r = Math.hypot(cur.x - c.x, cur.y - c.y);

      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = lineWidth;
      this.ctx.setLineDash([5 / this.view.scale, 3 / this.view.scale]);
      this.ctx.beginPath();
      this.ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      const crossSize = 10 / this.view.scale;
      this.ctx.beginPath();
      this.ctx.moveTo(c.x - crossSize, c.y);
      this.ctx.lineTo(c.x + crossSize, c.y);
      this.ctx.moveTo(c.x, c.y - crossSize);
      this.ctx.lineTo(c.x, c.y + crossSize);
      this.ctx.stroke();

      const diaMM = ((r * 2) / ppm).toFixed(1);
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.fillText(`⌀${diaMM} ${this.calibration.unit}`, c.x + r + 6 / this.view.scale, c.y);
    }

    // 4. Dimension placement point 1 preview
    if (this.activeMode === 'cadDim' && this.dimPoints.length === 1 && this.mouseWorldPos) {
      const p1 = this.dimPoints[0];
      const p2 = this.mouseWorldPos;

      this.ctx.strokeStyle = '#ec4899';
      this.ctx.lineWidth = lineWidth;
      this.ctx.setLineDash([4 / this.view.scale, 4 / this.view.scale]);
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      this.ctx.fillStyle = '#ec4899';
      this.ctx.beginPath();
      this.ctx.arc(p1.x, p1.y, 4 / this.view.scale, 0, Math.PI * 2);
      this.ctx.fill();

      const distMM = (Math.hypot(p2.x - p1.x, p2.y - p1.y) / ppm).toFixed(1);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      this.ctx.fillText(`📏 ${distMM} ${this.calibration.unit}`, midX + 8 / this.view.scale, midY - 6 / this.view.scale);
    }

    this.ctx.restore();
  }

  renderDimensions() {
    if (!this.dimensions || this.dimensions.length === 0) return;
    this.ctx.save();
    const ppm = this.calibration.ppm || 1.0;
    const lineWidth = 1.5 / this.view.scale;
    const tickLen = 6 / this.view.scale;
    const slash = 5 / this.view.scale;
    const fontSize = Math.max(10, 11 / this.view.scale);
    this.ctx.font = `600 ${fontSize}px var(--font-mono), monospace`;

    this.dimensions.forEach((dim) => {
      const { p1, p2, text } = dim;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) return;

      const ux = dx / dist;
      const uy = dy / dist;
      const nx = -uy;
      const ny = ux;

      this.ctx.strokeStyle = '#ec4899';
      this.ctx.lineWidth = lineWidth;

      // Witness extension lines
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x - nx * tickLen, p1.y - ny * tickLen);
      this.ctx.lineTo(p1.x + nx * tickLen, p1.y + ny * tickLen);
      this.ctx.moveTo(p2.x - nx * tickLen, p2.y - ny * tickLen);
      this.ctx.lineTo(p2.x + nx * tickLen, p2.y + ny * tickLen);
      this.ctx.stroke();

      // CAD 45-degree architectural ticks at endpoints
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x - slash, p1.y - slash);
      this.ctx.lineTo(p1.x + slash, p1.y + slash);
      this.ctx.moveTo(p2.x - slash, p2.y - slash);
      this.ctx.lineTo(p2.x + slash, p2.y + slash);
      this.ctx.stroke();

      // Main dimension line
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();

      // Measurement value badge
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const textMetrics = this.ctx.measureText(text);
      const textW = textMetrics.width;
      const padX = 6 / this.view.scale;
      const padY = 3 / this.view.scale;

      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      this.ctx.strokeStyle = '#ec4899';
      this.ctx.lineWidth = 1 / this.view.scale;
      this.ctx.fillRect(midX - textW / 2 - padX, midY - fontSize / 2 - padY, textW + padX * 2, fontSize + padY * 2);
      this.ctx.strokeRect(midX - textW / 2 - padX, midY - fontSize / 2 - padY, textW + padX * 2, fontSize + padY * 2);

      this.ctx.fillStyle = '#f472b6';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(text, midX, midY);
    });

    this.ctx.restore();
  }

  renderBrushCursor() {
    if ((this.activeMode === 'pixelEraser' || this.activeMode === 'pixelBrush') && this.mouseWorldPos) {
      this.ctx.save();
      const r = this.brushSize / 2;
      this.ctx.beginPath();
      this.ctx.arc(this.mouseWorldPos.x, this.mouseWorldPos.y, r, 0, Math.PI * 2);
      this.ctx.strokeStyle = this.activeMode === 'pixelEraser' ? '#f43f5e' : '#00f0ff';
      this.ctx.lineWidth = 1.5 / this.view.scale;
      this.ctx.fillStyle = this.activeMode === 'pixelEraser' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(0, 240, 255, 0.15)';
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  cleanNoiseDust() {
    if (!this.imgCtx || !this.imageWidth || !this.imageHeight) return;
    const imgData = this.imgCtx.getImageData(0, 0, this.imageWidth, this.imageHeight);
    const data = imgData.data;
    const w = this.imageWidth;
    const h = this.imageHeight;
    let cleanedCount = 0;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const lum = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
        if (lum < 160) {
          let darkNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nIdx = ((y + dy) * w + (x + dx)) * 4;
              const nLum = (data[nIdx] * 299 + data[nIdx + 1] * 587 + data[nIdx + 2] * 114) / 1000;
              if (nLum < 160) darkNeighbors++;
            }
          }
          if (darkNeighbors <= 1) {
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            cleanedCount++;
          }
        }
      }
    }
    this.imgCtx.putImageData(imgData, 0, 0);
    this.render();
    this.showToast(`Cleaned ${cleanedCount} isolated scan dust speckles!`);
  }

  updateDimensionsUI() {
    const listContainer = document.getElementById('dimListContainer');
    const countBadge = document.getElementById('countDims');
    if (countBadge) countBadge.textContent = this.dimensions.length;
    if (!listContainer) return;

    if (this.dimensions.length === 0) {
      listContainer.innerHTML = '<div class="dim-empty-hint" style="font-size: 0.72rem; color: var(--text-dim); padding: 8px; text-align: center;">No measurements placed. Click 📐 Measure to add.</div>';
      return;
    }

    listContainer.innerHTML = '';
    this.dimensions.forEach((dim, idx) => {
      const item = document.createElement('div');
      item.className = 'dim-item';
      item.innerHTML = `
        <span class="dim-label">📐 #${idx + 1}: <strong>${dim.text}</strong></span>
        <button class="btn-dim-del" title="Delete measurement">&times;</button>
      `;
      item.querySelector('.btn-dim-del').addEventListener('click', (e) => {
        e.stopPropagation();
        this.dimensions.splice(idx, 1);
        this.updateDimensionsUI();
        this.render();
        this.showToast('Measurement deleted');
      });
      listContainer.appendChild(item);
    });
  }

  deleteSelectedContour() {
    if (this.selectedContourIndex >= 0 && this.selectedContourIndex < this.vectorPaths.length) {
      this.vectorPaths.splice(this.selectedContourIndex, 1);
      this.selectedContourIndex = -1;
      this.updateStats();
      this.render();
      this.showToast('Deleted selected CAD element');
    } else {
      this.showToast('No shape selected. Click a vector on canvas first.', true);
    }
  }

  /* ----------------------------------------------------
     CAD & Vector Export Methods
     ---------------------------------------------------- */
  getMillimeterPaths() {
    const ppm = this.calibration.ppm || 1.0;
    return this.vectorPaths.map(path => {
      if (path.isCircle) {
        const mmCircle = path.map(pt => ({
          x: pt.x / ppm,
          y: pt.y / ppm
        }));
        mmCircle.isCircle = true;
        mmCircle.cx = path.cx / ppm;
        mmCircle.cy = path.cy / ppm;
        mmCircle.radius = path.radius / ppm;
        mmCircle.diameter = path.diameter / ppm;
        return mmCircle;
      }
      const mmPath = path.map(pt => ({
        x: pt.x / ppm,
        y: pt.y / ppm
      }));
      if (path.isLine) mmPath.isLine = true;
      if (path.isRect) mmPath.isRect = true;
      return mmPath;
    });
  }

  getMillimeterDimensions() {
    const ppm = this.calibration.ppm || 1.0;
    return this.dimensions.map(dim => ({
      p1: { x: dim.p1.x / ppm, y: dim.p1.y / ppm },
      p2: { x: dim.p2.x / ppm, y: dim.p2.y / ppm },
      mmDist: dim.mmDist,
      text: dim.text
    }));
  }

  exportDXF() {
    if (this.vectorPaths.length === 0 && this.dimensions.length === 0) {
      this.showToast('No contours or measurements to export! Trace an image first.', true);
      return;
    }
    const mmPaths = this.getMillimeterPaths();
    DXFGenerator.download(mmPaths, 'digitracer_part.dxf', {
      unit: this.calibration.unit,
      layerName: 'DIGITRACER_CONTOUR',
      dimensions: this.getMillimeterDimensions()
    });
    this.showToast('Downloaded AutoCAD DXF file with CAD entities & dimensions!');
  }

  exportSVG() {
    if (this.vectorPaths.length === 0 && this.dimensions.length === 0) {
      this.showToast('No contours or measurements to export! Trace an image first.', true);
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
    if (this.vectorPaths.length === 0 && this.dimensions.length === 0) {
      this.showToast('No contours or measurements to export! Trace an image first.', true);
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
      dimensionsMM: this.getMillimeterDimensions(),
      pathsPixel: this.vectorPaths,
      dimensionsPixel: this.dimensions
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'digitracer_cad_data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    this.showToast('Downloaded CAD data JSON!');
  }

  generateSVGString() {
    const ppm = this.calibration.ppm || 1.0;
    const widthMM = (this.imageWidth / ppm).toFixed(2);
    const heightMM = (this.imageHeight / ppm).toFixed(2);
    const mmPaths = this.getMillimeterPaths();

    let pathsMarkup = '';
    mmPaths.forEach((path, idx) => {
      if (!path) return;
      const stroke = idx === 0 ? '#00f0ff' : '#f59e0b';

      if (path.isCircle) {
        pathsMarkup += `  <circle cx="${path.cx.toFixed(3)}" cy="${path.cy.toFixed(3)}" r="${path.radius.toFixed(3)}" fill="none" stroke="${stroke}" stroke-width="0.3" vector-effect="non-scaling-stroke" />\n`;
        return;
      }

      if (path.isLine && path.length >= 2) {
        pathsMarkup += `  <line x1="${path[0].x.toFixed(3)}" y1="${path[0].y.toFixed(3)}" x2="${path[1].x.toFixed(3)}" y2="${path[1].y.toFixed(3)}" stroke="#10b981" stroke-width="0.3" vector-effect="non-scaling-stroke" />\n`;
        return;
      }

      if (path.length < 2) return;
      let d = `M ${path[0].x.toFixed(3)} ${path[0].y.toFixed(3)}`;
      for (let i = 1; i < path.length; i++) {
        d += ` L ${path[i].x.toFixed(3)} ${path[i].y.toFixed(3)}`;
      }
      d += ' Z';
      pathsMarkup += `  <path d="${d}" fill="none" stroke="${stroke}" stroke-width="0.3" vector-effect="non-scaling-stroke" />\n`;
    });

    let dimsMarkup = '';
    const mmDims = this.getMillimeterDimensions();
    if (mmDims.length > 0) {
      dimsMarkup += '  <g id="dimensions">\n';
      mmDims.forEach(dim => {
        dimsMarkup += `    <line x1="${dim.p1.x.toFixed(3)}" y1="${dim.p1.y.toFixed(3)}" x2="${dim.p2.x.toFixed(3)}" y2="${dim.p2.y.toFixed(3)}" stroke="#ec4899" stroke-width="0.25" stroke-dasharray="1,1" />\n`;
        const midX = (dim.p1.x + dim.p2.x) / 2;
        const midY = (dim.p1.y + dim.p2.y) / 2;
        dimsMarkup += `    <text x="${midX.toFixed(3)}" y="${(midY - 0.8).toFixed(3)}" font-size="2.2" fill="#ec4899" text-anchor="middle" font-family="sans-serif">${dim.text}</text>\n`;
      });
      dimsMarkup += '  </g>\n';
    }

    return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" 
     width="${widthMM}mm" height="${heightMM}mm" 
     viewBox="0 0 ${widthMM} ${heightMM}">
  <title>DigiTracer Calibrated Part</title>
  <desc>Exported from DigiTracer (Scale: 1 ${this.calibration.unit} = ${ppm.toFixed(2)} px)</desc>
  <g id="contours">
${pathsMarkup}  </g>
${dimsMarkup}</svg>`;
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
