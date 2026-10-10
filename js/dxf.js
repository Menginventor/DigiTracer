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
      if (!path) return;

      // Native AutoCAD Circle Entity
      if (path.isCircle && path.cx !== undefined && path.cy !== undefined && path.radius !== undefined) {
        dxf += '0\nCIRCLE\n';
        dxf += '5\n' + nextHandle() + '\n';
        dxf += '100\nAcDbEntity\n';
        dxf += '8\n' + layerName + '\n';
        dxf += '62\n4\n'; // Cyan
        dxf += '100\nAcDbCircle\n';
        dxf += '10\n' + path.cx.toFixed(4) + '\n';
        dxf += '20\n' + (-path.cy).toFixed(4) + '\n';
        dxf += '30\n0.0000\n';
        dxf += '40\n' + path.radius.toFixed(4) + '\n';
        return;
      }

      // Native AutoCAD Line Entity
      if (path.isLine && path.length >= 2) {
        dxf += '0\nLINE\n';
        dxf += '5\n' + nextHandle() + '\n';
        dxf += '100\nAcDbEntity\n';
        dxf += '8\n' + layerName + '\n';
        dxf += '62\n4\n'; // Cyan
        dxf += '100\nAcDbLine\n';
        dxf += '10\n' + path[0].x.toFixed(4) + '\n';
        dxf += '20\n' + (-path[0].y).toFixed(4) + '\n';
        dxf += '30\n0.0000\n';
        dxf += '11\n' + path[1].x.toFixed(4) + '\n';
        dxf += '21\n' + (-path[1].y).toFixed(4) + '\n';
        dxf += '31\n0.0000\n';
        return;
      }

      if (path.length < 2) return;

      const vertexCount = path.length;
      dxf += '0\nLWPOLYLINE\n';
      dxf += '5\n' + nextHandle() + '\n';
      dxf += '100\nAcDbEntity\n';
      dxf += '8\n' + layerName + '\n';
      dxf += '62\n4\n'; // Cyan
      dxf += '100\nAcDbPolyline\n';
      dxf += '90\n' + vertexCount + '\n';
      dxf += '70\n' + (path.isLine ? 0 : 1) + '\n'; // 1 = Closed, 0 = Open

      // Write each coordinate (In CAD, Y is often positive upwards, so we invert Y for standard Cartesian CAD orientation)
      for (let i = 0; i < vertexCount; i++) {
        const pt = path[i];
        dxf += '10\n' + pt.x.toFixed(4) + '\n';
        dxf += '20\n' + (-pt.y).toFixed(4) + '\n';
      }
    });

    // Dimensions Layer Entities
    if (options.dimensions && options.dimensions.length > 0) {
      options.dimensions.forEach((dim) => {
        if (!dim.p1 || !dim.p2) return;
        // Dimension Line
        dxf += '0\nLINE\n5\n' + nextHandle() + '\n100\nAcDbEntity\n8\nDIMENSIONS\n62\n1\n100\nAcDbLine\n';
        dxf += '10\n' + dim.p1.x.toFixed(4) + '\n20\n' + (-dim.p1.y).toFixed(4) + '\n30\n0.0000\n';
        dxf += '11\n' + dim.p2.x.toFixed(4) + '\n21\n' + (-dim.p2.y).toFixed(4) + '\n31\n0.0000\n';

        // Dimension Text
        const midX = (dim.p1.x + dim.p2.x) / 2;
        const midY = (dim.p1.y + dim.p2.y) / 2;
        dxf += '0\nTEXT\n5\n' + nextHandle() + '\n100\nAcDbEntity\n8\nDIMENSIONS\n62\n7\n100\nAcDbText\n';
        dxf += '10\n' + midX.toFixed(4) + '\n20\n' + (-midY + 1.5).toFixed(4) + '\n30\n0.0000\n';
        dxf += '40\n2.5000\n'; // Height
        dxf += '1\n' + (dim.text || '') + '\n';
      });
    }

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
