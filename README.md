# DigiTracer 📐

> A lightweight, client-side single-page web application designed to trace object outlines from scanned or digital images into CAD-ready drawings. Deployed directly via GitHub Pages.

---

## 🌟 Overview

**DigiTracer** enables engineers, makers, woodworkers, and designers to convert flatbed scans and photos of physical parts or templates into precise vector profiles. 

Since it runs entirely in the browser as a **Client-Side Single-Page Application (SPA)**, all image processing and vectorization happen locally on your machine—ensuring high performance, zero server costs, and complete privacy for proprietary designs.

---

## ✨ Features & Capabilities

- **100% Client-Side Processing**: No servers, no uploads, and no data tracking. Safe for confidential CAD models and functional offline.
- **Image Input & Pixel Editing**:
  - High-resolution flatbed scan imports (A4 300/600 DPI presets).
  - **🧹 Pixel Eraser & ✏️ Ink Pen**: Clean dust spots, eliminate scanner noise, or bridge broken pen lines directly on the pixel canvas before tracing.
  - **✨ Despeckle Dust Cleaner**: Automatically cleans isolated single-pixel scanner artifacts.
- **Accurate Scale Calibration**:
  - Scanner DPI presets (72, 150, 300, 600, 1200 DPI) with exact millimeter scaling (`px/mm`).
  - Interactive 2-point reference calibration with live distance readout.
- **Vector Contour Extraction**:
  - Automated contour tracing with dark-ink / light-paper detection tuned for scans.
  - Sub-pixel Douglas-Peucker path simplification and spline smoothing.
  - **⭕ True Circle Recognition**: Automatic algebraic least-squares circle fitting (detects circular contours and converts to native circles with center crosshairs and diameter badges).
- **CAD Geometry Editing & Dimensions**:
  - **📏 CAD Line**: Draw precision calibrated lines with millimeter length tags.
  - **⬛ CAD Rectangle**: Draw calibrated rectangular profiles.
  - **⭕ CAD Circle**: Draw calibrated circles with center marks and diameter labels.
  - **📐 CAD Dimensions & Measurements**: Click two points to place engineering dimension lines with extension witness lines, 45° architectural ticks, and millimeter value badges.
  - **🗑️ Delete & Select**: Click any vector element to select, inspect, convert to circle, or delete.
- **CAD & Vector Export**:
  - **AutoCAD DXF (R2000 / AC1015)**: Exports native `CIRCLE`, `LINE`, `LWPOLYLINE`, and calibrated `DIMENSIONS` layers.
  - **Scalable Vector Graphics (SVG)**: Exports calibrated paths, circles, lines, and dimension annotations in physical millimeters (`mm`).
  - **JSON**: Structured millimeter and pixel coordinates for robotic or CAM automation.

---

## 🚀 Live Demo

Access the live application hosted on GitHub Pages:
> **https://<username>.github.io/DigiTracer/** *(Update with your repository URL)*

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla JavaScript / TypeScript, Modern CSS.
- **Canvas / Image Processing**: HTML5 Canvas API, WebGL, or WebAssembly (e.g., OpenCV.js / Potrace).
- **Export Engines**: Client-side DXF generator and SVG DOM serializer.
- **Hosting**: GitHub Pages (Zero backend required).

---

## 📁 Suggested Project Structure

```text
DigiTracer/
├── index.html        # Main SPA interface
├── css/
│   └── styles.css    # Responsive styling & layout
├── js/
│   ├── app.js        # Application controller & state
│   ├── image.js      # Image loading, preprocessing & filters
│   ├── calibrate.js  # Scale reference & measurement calculations
│   ├── tracer.js     # Contour extraction & vector curve fitting
│   └── exporter.js   # DXF and SVG generation
├── assets/           # Icons, sample images, and demo scans
└── README.md
```

---

## 🚦 Getting Started

### Local Development

Because DigiTracer is a pure static web app, no complex build system is required to get started:

1. **Clone the repository:**
   ```bash
   git clone https://github.com/<username>/DigiTracer.git
   cd DigiTracer
   ```

2. **Serve locally:**
   You can open `index.html` directly in your browser, or run a lightweight local static server:
   ```bash
   # Using Python 3
   python -m http.server 8000

   # Or using Node.js / npx
   npx serve .
   ```

3. **Open in browser:**
   Navigate to `http://localhost:8000`.

---

## 🌐 Deploying to GitHub Pages

1. Push your code to the `main` branch:
   ```bash
   git add .
   git commit -m "Update application"
   git push origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
   - Select `main` branch and folder `/ (root)`, then click **Save**.
3. Your web app will be live at `https://<username>.github.io/DigiTracer/` within a couple of minutes.

---

## 🤝 Contributing

Contributions, feedback, and feature requests are welcome!
1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the Branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
