/**
 * DigiTracer - DXF (Drawing Exchange Format) Generator
 * Creates AutoCAD-compatible DXF (R2000 / AC1015) files with calibrated millimeter coordinates.
 */

const DXFGenerator = {
  /**
   * Generates a complete DXF file content string.
   * @param {Array<Array<{x: number, y: number}>>} paths - Array of closed polygon paths in mm
   * @param {Object} options - Export options (unit, layerName, color)
   * @returns {string} - Complete DXF formatted string
   */
  generate(paths, options = {}) {
    const layerName = options.layerName || 'PART_OUTLINE';
    const isInch = options.unit === 'in';
    const insUnits = isInch ? 1 : 4; // 1 = Inches, 4 = Millimeters
    let handle = 0x20;

    const nextHandle = () => (handle++).toString(16).toUpperCase();

    let dxf = '';

    // HEADER Section
    dxf += '0\nSECTION\n';
    dxf += '2\nHEADER\n';
    dxf += '9\n$ACADVER\n1\nAC1015\n'; // AutoCAD 2000
    dxf += '9\n$INSUNITS\n70\n' + insUnits + '\n';
    dxf += '9\n$MEASUREMENT\n70\n' + (isInch ? 0 : 1) + '\n'; // 0 = English, 1 = Metric
    dxf += '0\nENDSEC\n';

    // TABLES Section
    dxf += '0\nSECTION\n';
    dxf += '2\nTABLES\n';

    // Layer Table
    dxf += '0\nTABLE\n';
    dxf += '2\nLAYER\n';
    dxf += '70\n2\n';

    // Default Layer 0
    dxf += '0\nLAYER\n';
    dxf += '2\n0\n';
    dxf += '70\n0\n';
    dxf += '62\n7\n'; // White
    dxf += '6\nCONTINUOUS\n';

    // Contour Layer
    dxf += '0\nLAYER\n';
    dxf += '2\n' + layerName + '\n';
    dxf += '70\n0\n';
    dxf += '62\n4\n'; // Cyan color
    dxf += '6\nCONTINUOUS\n';

    dxf += '0\nENDTAB\n';
    dxf += '0\nENDSEC\n';

    // BLOCKS Section
    dxf += '0\nSECTION\n';
    dxf += '2\nBLOCKS\n';
    dxf += '0\nENDSEC\n';

    // ENTITIES Section
    dxf += '0\nSECTION\n';
    dxf += '2\nENTITIES\n';

    paths.forEach((path) => {
      if (!path || path.length < 2) return;

      const vertexCount = path.length;
      dxf += '0\nLWPOLYLINE\n';
      dxf += '5\n' + nextHandle() + '\n';
      dxf += '100\nAcDbEntity\n';
      dxf += '8\n' + layerName + '\n';
      dxf += '62\n4\n'; // Cyan
      dxf += '100\nAcDbPolyline\n';
      dxf += '90\n' + vertexCount + '\n';
      dxf += '70\n1\n'; // Closed polyline flag

      // Write each coordinate (In CAD, Y is often positive upwards, so we invert Y for standard Cartesian CAD orientation)
      for (let i = 0; i < vertexCount; i++) {
        const pt = path[i];
        dxf += '10\n' + pt.x.toFixed(4) + '\n';
        dxf += '20\n' + (-pt.y).toFixed(4) + '\n';
      }
    });

    dxf += '0\nENDSEC\n';
    dxf += '0\nEOF\n';

    return dxf;
  },

  /**
   * Triggers a browser download of the DXF file.
   */
  download(paths, filename = 'digitracer_part.dxf', options = {}) {
    const content = this.generate(paths, options);
    const blob = new Blob([content], { type: 'application/dxf;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

window.DXFGenerator = DXFGenerator;
