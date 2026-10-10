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
    const { threshold, contrast, brightness, invert } = settings;

    const binary = new Uint8Array(width * height);
    const factor = (259 * (contrast * 100 + 255)) / (255 * (259 - contrast * 100));

    for (let i = 0; i < data.length; i += 4) {
      // Perceptual grayscale formula
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      // Brightness & contrast
      r = factor * (r - 128) + 128 + brightness;
      g = factor * (g - 128) + 128 + brightness;
      b = factor * (b - 128) + 128 + brightness;

      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      let val = gray >= threshold ? 1 : 0;
      if (invert) val = 1 - val;

      const pixelIdx = i / 4;
      binary[pixelIdx] = val;

      // Update image data for visual binary preview
      const previewColor = val ? 255 : 0;
      data[i] = previewColor;
      data[i + 1] = previewColor;
      data[i + 2] = previewColor;
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
  }
};

window.ImageTracer = ImageTracer;
