# DigiTracer 📐

> A lightweight, client-side single-page web application designed to trace object outlines from scanned or digital images into CAD-ready drawings. Deployed directly via GitHub Pages.

---

## 🌟 Overview

**DigiTracer** enables engineers, makers, woodworkers, and designers to convert flatbed scans and photos of physical parts or templates into precise vector profiles. 

Since it runs entirely in the browser as a **Client-Side Single-Page Application (SPA)**, all image processing and vectorization happen locally on your machine—ensuring high performance, zero server costs, and complete privacy for proprietary designs.

---

## ✨ Features & Capabilities

- **100% Client-Side Processing**: No servers, no uploads, and no data tracking. Safe for confidential CAD models and functional offline.
- **Image Input Support**:
  - High-resolution flatbed scan imports (PNG, JPG, WebP, TIFF).
  - Digital camera photos with perspective and contrast adjustment tools.
- **Accurate Scale Calibration**:
  - Set real-world scale (mm / inches) using reference markings, grid paper, or known feature dimensions.
- **Smart Edge Detection & Tracing**:
  - Automated edge and contour tracing (thresholding, Canny edge detection, path vectorization).
  - Manual and semi-automatic vector path editing (polyline, bezier curves, control points).
  - Path smoothing and point decimation (Douglas-Peucker simplification).
- **CAD & Vector Export**:
  - **DXF (Drawing Exchange Format)**: Ready for import into AutoCAD, Fusion 360, SolidWorks, FreeCAD, LightBurn, or CNC/CAM software.
  - **SVG**: For vector graphics editors (Inkscape, Illustrator) and laser cutters.
  - **JSON**: Raw coordinate points and calibration metadata for automation pipelines.

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
