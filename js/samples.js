/**
 * DigiTracer - Sample Scan Generator
 * Procedurally renders realistic high-resolution mechanical part scans with calibration rulers
 */

const SampleGenerator = {
  /**
   * Generates a realistic high-resolution scan canvas of a mechanical flange/bracket
   * @returns {HTMLCanvasElement}
   */
  createSampleScan() {
    const width = 1200;
    const height = 900;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Scanner background (slightly off-white paper with scanner noise)
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(0, 0, width, height);

    // Subtle paper grid texture (10mm grid simulation)
    ctx.strokeStyle = 'rgba(200, 210, 225, 0.45)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 2. 50 mm Reference Calibration Ruler Bar
    const rulerX = 100;
    const rulerY = 120;
    const rulerPixelWidth = 200; // 200px = 50.0 mm -> 4 px/mm
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rulerX, rulerY);
    ctx.lineTo(rulerX + rulerPixelWidth, rulerY);
    // End ticks
    ctx.moveTo(rulerX, rulerY - 12);
    ctx.lineTo(rulerX, rulerY + 12);
    ctx.moveTo(rulerX + rulerPixelWidth, rulerY - 12);
    ctx.lineTo(rulerX + rulerPixelWidth, rulerY + 12);
    // Intermediate 10mm ticks
    for (let t = 1; t < 5; t++) {
      const tx = rulerX + (rulerPixelWidth * (t / 5));
      ctx.moveTo(tx, rulerY - 6);
      ctx.lineTo(tx, rulerY + 6);
    }
    ctx.stroke();

    ctx.fillStyle = '#111';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('50.0 mm CALIBRATION REFERENCE', rulerX + 15, rulerY - 16);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText('(Click ends with Scale tool to calibrate: 4.0 px/mm)', rulerX + 15, rulerY + 28);

    // 3. Physical Mechanical Flange Bracket (dark anodized aluminum part)
    const centerX = 650;
    const centerY = 480;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = '#1c202a'; // Dark solid part
    ctx.strokeStyle = '#11141c';
    ctx.lineWidth = 2;

    // Draw outer bracket profile
    ctx.beginPath();
    const w = 480;
    const h = 260;
    const r = 40;
    const left = centerX - w / 2;
    const top = centerY - h / 2;

    // Rounded contour with notched tabs
    ctx.moveTo(left + r, top);
    ctx.lineTo(left + w - r, top);
    ctx.arcTo(left + w, top, left + w, top + r, r);
    ctx.lineTo(left + w, top + h / 2 - 30);
    // Right tab notch
    ctx.lineTo(left + w + 35, top + h / 2 - 20);
    ctx.lineTo(left + w + 35, top + h / 2 + 20);
    ctx.lineTo(left + w, top + h / 2 + 30);
    ctx.lineTo(left + w, top + h - r);
    ctx.arcTo(left + w, top + h, left + w - r, top + h, r);
    ctx.lineTo(left + r, top + h);
    ctx.arcTo(left, top + h, left, top + h - r, r);
    ctx.lineTo(left, top + h / 2 + 30);
    // Left tab notch
    ctx.lineTo(left - 35, top + h / 2 + 20);
    ctx.lineTo(left - 35, top + h / 2 - 20);
    ctx.lineTo(left, top + h / 2 - 30);
    ctx.lineTo(left, top + r);
    ctx.arcTo(left, top, left + r, top, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 4. Inner Cutout Holes (to demonstrate island & hole detection)
    ctx.globalCompositeOperation = 'destination-out';

    // Center circular bore hole
    ctx.beginPath();
    ctx.arc(centerX, centerY, 65, 0, Math.PI * 2);
    ctx.fill();

    // Center keyway notch
    ctx.fillRect(centerX - 12, centerY - 85, 24, 30);

    // 4 Corner Bolt Mounting Holes
    const holeOffsetX = 180;
    const holeOffsetY = 85;
    const holeRadius = 22;

    const holes = [
      { x: centerX - holeOffsetX, y: centerY - holeOffsetY },
      { x: centerX + holeOffsetX, y: centerY - holeOffsetY },
      { x: centerX - holeOffsetX, y: centerY + holeOffsetY },
      { x: centerX + holeOffsetX, y: centerY + holeOffsetY },
      // Notch holes on tabs
      { x: centerX - (w / 2) - 18, y: centerY },
      { x: centerX + (w / 2) + 18, y: centerY }
    ];

    holes.forEach((hPos) => {
      ctx.beginPath();
      ctx.arc(hPos.x, hPos.y, holeRadius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();

    // Subtle edge chamfer highlight on part
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 65, 0, Math.PI * 2);
    ctx.stroke();

    // Annotation text on paper
    ctx.fillStyle = '#4b5563';
    ctx.font = '500 13px monospace';
    ctx.fillText('PART REF: DIGI-TRACER-FLANGE-V2', 100, 840);
    ctx.fillText('SCAN DATE: FLATBED 600DPI SIMULATION', 100, 860);

    return canvas;
  }
};

window.SampleGenerator = SampleGenerator;
