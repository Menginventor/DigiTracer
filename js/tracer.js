/**
 * DigiTracer - Image Processing & Contour Vectorizer Engine
 * Pure client-side computer vision: thresholding, boundary following,
 * Douglas-Peucker vector simplification, and geometric analysis.
 */

const ImageTracer = {
  /**
   * Preprocesses image data to produce a binary grid (0 = bg, 1 = fg)
   */
  processToBinary(ctx, width, height, settings) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const { threshold, contrast, brightness, detectMode, ignoreBorder } = settings;

    const binary = new Uint8Array(width * height);
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));
    const borderMargin = ignoreBorder ? 8 : 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const pixelIdx = y * width + x;

        // Scanner glass edge shadows filtering
        if (ignoreBorder && (x < borderMargin || x >= width - borderMargin || y < borderMargin || y >= height - borderMargin)) {
          binary[pixelIdx] = 0;
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          continue;
        }

        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];

        // Brightness & contrast
        r = factor * (r - 128) + 128 + brightness;
        g = factor * (g - 128) + 128 + brightness;
        b = factor * (b - 128) + 128 + brightness;

        const gray = 0.299 * r + 0.587 * g + 0.114 * b;

        let val = 0;
        if (detectMode === 'dark-on-light' || detectMode === 'dark-object') {
          // Scans: darker ink strokes on lighter paper
          val = gray <= threshold ? 1 : 0;
        } else {
          // Light objects on dark mat
          val = gray >= threshold ? 1 : 0;
        }

        binary[pixelIdx] = val;

        // Visual mask preview (cyan tint for detected foreground)
        if (val) {
          data[i] = 0;
          data[i + 1] = 240;
          data[i + 2] = 255;
        } else {
          data[i] = 20;
          data[i + 1] = 25;
          data[i + 2] = 35;
        }
      }
    }

    return { binary, previewImageData: imgData };
  },

  /**
   * Extracts closed vector contours using Moore-Neighbor boundary tracing algorithm
   */
  findContours(binary, width, height, minArea = 100) {
    const visited = new Uint8Array(width * height);
    const contours = [];

    // 8-connected Moore neighborhood directions (clockwise)
    const dx = [0, 1, 1, 1, 0, -1, -1, -1];
    const dy = [-1, -1, 0, 1, 1, 1, 0, -1];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Find boundary pixel: foreground pixel with at least one background neighbor
        if (binary[idx] === 1 && visited[idx] === 0) {
          const isBoundary =
            binary[idx - 1] === 0 ||
            binary[idx + 1] === 0 ||
            binary[idx - width] === 0 ||
            binary[idx + width] === 0;

          if (isBoundary) {
            const contour = this._traceMooreNeighbor(binary, width, height, x, y, dx, dy, visited);
            if (contour && contour.length > 5) {
              const area = Math.abs(this.calculatePolygonArea(contour));
              if (area >= minArea) {
                contours.push(contour);
              }
            }
          }
        }
      }
    }

    return contours;
  },

  /**
   * Traces a single closed contour loop
   */
  _traceMooreNeighbor(binary, width, height, startX, startY, dx, dy, visited) {
    const contour = [{ x: startX, y: startY }];
    let currX = startX;
    let currY = startY;
    let backtrackIdx = 0; // Came from North
    const maxSteps = width * height;
    let steps = 0;

    visited[startY * width + startX] = 1;

    while (steps < maxSteps) {
      steps++;
      let foundNext = false;

      // Check 8 neighbors in clockwise order starting from backtrack direction
      for (let i = 0; i < 8; i++) {
        const dir = (backtrackIdx + i) % 8;
        const nx = currX + dx[dir];
        const ny = currY + dy[dir];

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (binary[ny * width + nx] === 1) {
            currX = nx;
            currY = ny;
            visited[ny * width + nx] = 1;
            contour.push({ x: currX, y: currY });

            // Set next backtrack index: (dir + 5) % 8 is standard Moore backtrack
            backtrackIdx = (dir + 5) % 8;
            foundNext = true;
            break;
          }
        }
      }

      if (!foundNext) break;

      // Terminate when loop returns to the start pixel
      if (currX === startX && currY === startY && contour.length > 3) {
        break;
      }
    }

    return contour;
  },

  /**
   * Ramer-Douglas-Peucker (RDP) polygon simplification
   * Reduces thousands of pixel jitter points into smooth, CAD-ready vertices.
   */
  simplify(points, epsilon = 1.5) {
    if (points.length <= 2) return points;

    let dmax = 0;
    let index = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const d = this._perpendicularDistance(points[i], points[0], points[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }

    if (dmax > epsilon) {
      const recResults1 = this.simplify(points.slice(0, index + 1), epsilon);
      const recResults2 = this.simplify(points.slice(index, end + 1), epsilon);
      return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
    } else {
      return [points[0], points[end]];
    }
  },

  _perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lineLenSq = dx * dx + dy * dy;

    if (lineLenSq === 0) {
      const px = point.x - lineStart.x;
      const py = point.y - lineStart.y;
      return Math.sqrt(px * px + py * py);
    }

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLenSq;
    const clampedT = Math.max(0, Math.min(1, t));
    const projX = lineStart.x + clampedT * dx;
    const projY = lineStart.y + clampedT * dy;

    const diffX = point.x - projX;
    const diffY = point.y - projY;
    return Math.sqrt(diffX * diffX + diffY * diffY);
  },

  /**
   * Computes polygon area using Gauss Shoelace Formula
   */
  calculatePolygonArea(points) {
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    return area / 2.0;
  },

  /**
   * Computes polygon perimeter length
   */
  calculatePerimeter(points) {
    let perim = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const dx = points[j].x - points[i].x;
      const dy = points[j].y - points[i].y;
      perim += Math.hypot(dx, dy);
    }
    return perim;
  },

  /**
   * Calculates shape circularity metric: 4 * PI * Area / (Perimeter^2)
   * Perfect circle = 1.0. Square ~ 0.785. Hand-drawn circles ~ 0.65 - 0.95.
   */
  calculateCircularity(points) {
    const area = Math.abs(this.calculatePolygonArea(points));
    const perim = this.calculatePerimeter(points);
    if (perim === 0) return 0;
    return (4 * Math.PI * area) / (perim * perim);
  },

  /**
   * Ray-casting test to determine if a 2D point is inside a closed polygon
   */
  isPointInPolygon(point, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  },

  /**
   * Fits a least-squares circle to a set of contour points using Kåsa's algebraic method.
   * Returns a complete Circle object with exact center, radius, and polygon vertices.
   */
  fitCircle(points, numSegments = 64) {
    const n = points.length;
    if (n < 3) return null;

    let meanX = 0;
    let meanY = 0;
    for (let i = 0; i < n; i++) {
      meanX += points[i].x;
      meanY += points[i].y;
    }
    meanX /= n;
    meanY /= n;

    let Suu = 0, Suv = 0, Svv = 0;
    let Suuu = 0, Suvv = 0, Svvv = 0, Svuu = 0;

    for (let i = 0; i < n; i++) {
      const u = points[i].x - meanX;
      const v = points[i].y - meanY;
      Suu += u * u;
      Suv += u * v;
      Svv += v * v;
      Suuu += u * u * u;
      Suvv += u * v * v;
      Svvv += v * v * v;
      Svuu += v * u * u;
    }

    const det = Suu * Svv - Suv * Suv;
    let cx = meanX;
    let cy = meanY;
    let radius = 0;

    if (Math.abs(det) > 1e-7) {
      const rhs1 = 0.5 * (Suuu + Suvv);
      const rhs2 = 0.5 * (Svvv + Svuu);
      const cu = (rhs1 * Svv - rhs2 * Suv) / det;
      const cv = (Suu * rhs2 - Suv * rhs1) / det;
      cx = meanX + cu;
      cy = meanY + cv;
      radius = Math.sqrt(cu * cu + cv * cv + (Suu + Svv) / n);
    } else {
      // Fallback: mean center and average distance
      cx = meanX;
      cy = meanY;
      let sumR = 0;
      for (let i = 0; i < n; i++) {
        sumR += Math.hypot(points[i].x - cx, points[i].y - cy);
      }
      radius = sumR / n;
    }

    // Generate circle polyline points
    const circlePoints = [];
    for (let i = 0; i < numSegments; i++) {
      const angle = (i / numSegments) * Math.PI * 2;
      circlePoints.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      });
    }

    const circularity = this.calculateCircularity(points);

    // Create an Array-like path augmented with circle properties
    const resultPath = [...circlePoints];
    resultPath.isCircle = true;
    resultPath.cx = cx;
    resultPath.cy = cy;
    resultPath.radius = radius;
    resultPath.diameter = radius * 2;
    resultPath.circularity = circularity;
    const rootContour = points.originalContour || points.originalPoints || points;
    resultPath.originalPoints = rootContour;
    resultPath.originalContour = rootContour;

    return resultPath;
  },

  /**
   * Generates Catmull-Rom smooth spline points for organic outlines
   */
  smoothCurve(points, tension = 0.5, numSegments = 6) {
    if (points.length < 3) return points;
    const smoothed = [];
    const pts = [...points, points[0], points[1]]; // Wrap for closed loop

    for (let i = 0; i < points.length; i++) {
      const p0 = i === 0 ? points[points.length - 1] : points[i - 1];
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const p3 = points[(i + 2) % points.length];

      for (let t = 0; t < numSegments; t++) {
        const u = t / numSegments;
        const u2 = u * u;
        const u3 = u2 * u;

        const x = 0.5 * (
          (2 * p1.x) +
          (-p0.x + p2.x) * u +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3
        );

        const y = 0.5 * (
          (2 * p1.y) +
          (-p0.y + p2.y) * u +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3
        );

        smoothed.push({ x, y });
      }
    }

    return smoothed;
  },

  /**
   * Fits a straight line to an elongated contour with options for center, left, or right edge.
   * Uses Principal Component Analysis (PCA) to find the longitudinal orientation, or a constrained targetAngle.
   * @param {Array<{x: number, y: number}>} points - Contour vertices
   * @param {string} alignment - 'center' | 'left' | 'right'
   * @param {number|null} targetAngle - Optional fixed orientation constraint (in radians)
   * @returns {Array<{x: number, y: number}>} - 2-point line path with .isLine = true
   */
  fitLine(points, alignment = 'center', targetAngle = null) {
    if (!points || points.length < 2) return null;
    const n = points.length;

    // 1. Centroid
    let meanX = 0, meanY = 0;
    for (let i = 0; i < n; i++) {
      meanX += points[i].x;
      meanY += points[i].y;
    }
    meanX /= n;
    meanY /= n;

    let angle;
    if (targetAngle !== null && targetAngle !== undefined && !isNaN(targetAngle)) {
      angle = targetAngle;
    } else {
      // 2. Covariance matrix for principal direction (PCA)
      let sxx = 0, sxy = 0, syy = 0;
      for (let i = 0; i < n; i++) {
        const dx = points[i].x - meanX;
        const dy = points[i].y - meanY;
        sxx += dx * dx;
        sxy += dx * dy;
        syy += dy * dy;
      }
      // Principal angle (major axis direction)
      angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    }

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // 3. Project points onto major (u) and transverse (v) axes
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (let i = 0; i < n; i++) {
      const dx = points[i].x - meanX;
      const dy = points[i].y - meanY;
      const u = dx * cosA + dy * sinA;
      const v = -dx * sinA + dy * cosA;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    // Determine target offset vTarget
    let vTarget = (minV + maxV) / 2; // Center
    if (alignment === 'left') {
      vTarget = maxV;
    } else if (alignment === 'right') {
      vTarget = minV;
    }

    // Convert (minU, vTarget) and (maxU, vTarget) back to world coordinates
    const p1 = {
      x: meanX + minU * cosA - vTarget * sinA,
      y: meanY + minU * sinA + vTarget * cosA
    };
    const p2 = {
      x: meanX + maxU * cosA - vTarget * sinA,
      y: meanY + maxU * sinA + vTarget * cosA
    };

    const rootContour = points.originalContour || points.originalPoints || points;
    const linePath = [p1, p2];
    linePath.isLine = true;
    linePath.alignment = alignment;
    linePath.angle = angle;
    linePath.originalPoints = rootContour;
    linePath.originalContour = rootContour;
    return linePath;
  },

  /**
   * Fits a slot (capsule shape: two parallel lines and two semicircular ends)
   * to a contour using oriented bounding geometry.
   * @param {Array<{x: number, y: number}>} points - Contour vertices
   * @param {number} numSegments - Resolution of semicircular ends
   * @returns {Array<{x: number, y: number}>} - Slot path with isSlot = true
   */
  fitSlot(points, numSegments = 32) {
    if (!points || points.length < 3) return null;
    const n = points.length;

    // 1. Centroid
    let meanX = 0, meanY = 0;
    for (let i = 0; i < n; i++) {
      meanX += points[i].x;
      meanY += points[i].y;
    }
    meanX /= n;
    meanY /= n;

    // 2. Covariance for principal orientation
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = points[i].x - meanX;
      const dy = points[i].y - meanY;
      sxx += dx * dx;
      sxy += dx * dy;
      syy += dy * dy;
    }

    let angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let cosA = Math.cos(angle);
    let sinA = Math.sin(angle);

    // 3. Extents in (u, v)
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;

    for (let i = 0; i < n; i++) {
      const dx = points[i].x - meanX;
      const dy = points[i].y - meanY;
      const u = dx * cosA + dy * sinA;
      const v = -dx * sinA + dy * cosA;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    let length = maxU - minU;
    let width = maxV - minV;

    // Ensure length is the longer dimension along u axis
    if (width > length) {
      angle += Math.PI / 2;
      cosA = Math.cos(angle);
      sinA = Math.sin(angle);
      minU = Infinity; maxU = -Infinity;
      minV = Infinity; maxV = -Infinity;
      for (let i = 0; i < n; i++) {
        const dx = points[i].x - meanX;
        const dy = points[i].y - meanY;
        const u = dx * cosA + dy * sinA;
        const v = -dx * sinA + dy * cosA;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
      length = maxU - minU;
      width = maxV - minV;
    }

    const radius = width / 2;
    const halfDist = Math.max(0, (length - width) / 2);
    const centerU = (minU + maxU) / 2;
    const centerV = (minV + maxV) / 2;

    // Center in world coordinates (rotate (centerU, centerV) back from local uv frame)
    const cx = meanX + centerU * cosA - centerV * sinA;
    const cy = meanY + centerU * sinA + centerV * cosA;

    // The two end centers
    const c1 = {
      x: cx - halfDist * cosA,
      y: cy - halfDist * sinA
    };
    const c2 = {
      x: cx + halfDist * cosA,
      y: cy + halfDist * sinA
    };

    // Construct capsule polygon vertices
    const slotPoly = [];
    const halfSegs = Math.max(8, Math.floor(numSegments / 2));

    // End 2 (positive u) semicircle
    for (let i = 0; i <= halfSegs; i++) {
      const a = angle - Math.PI / 2 + (i / halfSegs) * Math.PI;
      slotPoly.push({
        x: c2.x + Math.cos(a) * radius,
        y: c2.y + Math.sin(a) * radius
      });
    }

    // End 1 (negative u) semicircle
    for (let i = 0; i <= halfSegs; i++) {
      const a = angle + Math.PI / 2 + (i / halfSegs) * Math.PI;
      slotPoly.push({
        x: c1.x + Math.cos(a) * radius,
        y: c1.y + Math.sin(a) * radius
      });
    }

    const result = [...slotPoly];
    result.isSlot = true;
    result.cx = cx;
    result.cy = cy;
    result.c1 = c1;
    result.c2 = c2;
    result.radius = radius;
    result.width = width;
    result.slotWidth = width;
    result.slotLength = length;
    result.lengthVal = length;
    result.angle = angle;
    result.constructionLine = { p1: { x: c1.x, y: c1.y }, p2: { x: c2.x, y: c2.y } };
    const rootContour = points.originalContour || points.originalPoints || points;
    result.originalPoints = rootContour;
    result.originalContour = rootContour;
    return result;
  }
};

window.ImageTracer = ImageTracer;
