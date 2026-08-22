const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/**
 * Creates a raw PNG file with standard IHDR, IDAT, and IEND chunks.
 */
function createPNG(width, height, rgbaBuffer) {
  // Add scanline filter byte (0 = None) at the beginning of each row
  const rowSize = width * 4;
  const filteredData = Buffer.alloc(height * (rowSize + 1));

  for (let y = 0; y < height; y++) {
    filteredData[y * (rowSize + 1)] = 0; // Filter None
    rgbaBuffer.copy(filteredData, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }

  const compressedData = zlib.deflateSync(filteredData);

  function createChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type, 'ascii');
    const crc = crc32(Buffer.concat([typeBuffer, data]));
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc, 0);

    return Buffer.concat([length, typeBuffer, data, crcBuffer]);
  }

  // PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression method: Deflate
  ihdr[11] = 0; // Filter method: Standard
  ihdr[12] = 0; // Interlace: None

  const ihdrChunk = createChunk('IHDR', ihdr);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// CRC32 implementation
function crc32(buf) {
  let table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Draws the Sheet Send Icon (Spreadsheet card + Forward send arrow badge).
 */
function drawSheetSendIcon(size, badgeType = null) {
  const buffer = Buffer.alloc(size * size * 4);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const idx = (y * size + x) * 4;
    // Simple alpha blending
    const srcA = a / 255;
    const dstA = buffer[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA > 0) {
      buffer[idx] = Math.round((r * srcA + buffer[idx] * dstA * (1 - srcA)) / outA);
      buffer[idx + 1] = Math.round((g * srcA + buffer[idx + 1] * dstA * (1 - srcA)) / outA);
      buffer[idx + 2] = Math.round((b * srcA + buffer[idx + 2] * dstA * (1 - srcA)) / outA);
      buffer[idx + 3] = Math.round(outA * 255);
    }
  }

  // Draw background sheet canvas (cool indigo/periwinkle plate #3d4f97 & surface)
  const pad = Math.max(1, Math.round(size * 0.08));
  const sheetLeft = pad;
  const sheetTop = pad;
  const sheetRight = size - pad;
  const sheetBottom = size - pad;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Rounded sheet body
      const dx = Math.max(sheetLeft + pad - x, 0, x - (sheetRight - pad));
      const dy = Math.max(sheetTop + pad - y, 0, y - (sheetBottom - pad));
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= pad) {
        // Base sheet plate (Green / Emerald Sheets brand accent: #0f9d58 / #10b981)
        const isHeader = y < sheetTop + (sheetBottom - sheetTop) * 0.35;
        if (isHeader) {
          setPixel(x, y, 15, 157, 88, 255); // #0f9d58 (Google Sheets Green)
        } else {
          setPixel(x, y, 255, 255, 255, 255); // #ffffff (Sheet Body)
        }
      }
    }
  }

  // Draw sheet grid lines inside white body
  const gridTop = Math.round(sheetTop + (sheetBottom - sheetTop) * 0.42);
  const gridBottom = sheetBottom - Math.round(pad * 0.8);
  const gridLeft = sheetLeft + Math.round(pad * 0.8);
  const gridRight = sheetRight - Math.round(pad * 0.8);

  const rowStep = Math.max(2, Math.round((gridBottom - gridTop) / 3));
  for (let gy = gridTop; gy < gridBottom; gy += rowStep) {
    for (let gx = gridLeft; gx < gridRight; gx++) {
      setPixel(gx, gy, 209, 217, 230, 255); // #d1d9e6
    }
  }

  // Draw send arrow / chip (Signal Orange: #f68d1f) in bottom-right corner
  const arrowCenter = Math.round(size * 0.72);
  const arrowRadius = Math.round(size * 0.24);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.sqrt((x - arrowCenter) ** 2 + (y - arrowCenter) ** 2);
      if (d <= arrowRadius) {
        let r = 246, g = 141, b = 31; // Signal orange #f68d1f
        if (badgeType === 'success') {
          r = 16; g = 185; b = 129; // Green #10b981
        } else if (badgeType === 'error') {
          r = 230; g = 0; b = 18; // Red #e60012
        }
        setPixel(x, y, r, g, b, 255);
      } else if (d <= arrowRadius + 1.2) {
        setPixel(x, y, 255, 255, 255, 200); // White border ring
      }
    }
  }

  // Draw white arrow chevron inside the circle
  const arrowSize = Math.max(2, Math.round(size * 0.12));
  for (let i = -arrowSize; i <= arrowSize; i++) {
    const ax = arrowCenter + arrowSize - Math.abs(i);
    const ay = arrowCenter + i;
    for (let t = -1; t <= 1; t++) {
      setPixel(ax + t, ay, 255, 255, 255, 255);
    }
  }

  return createPNG(size, size, buffer);
}

// Generate all required icon files
const iconsDir = path.join(__dirname, '..', 'src', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

[16, 32, 48, 128].forEach((size) => {
  const png = drawSheetSendIcon(size);
  fs.writeFileSync(path.join(iconsDir, `icon-${size}.png`), png);
  console.log(`Generated icon-${size}.png (${size}x${size})`);
});

// Generate status badge overlays
fs.writeFileSync(path.join(iconsDir, 'icon-success-badge.png'), drawSheetSendIcon(32, 'success'));
fs.writeFileSync(path.join(iconsDir, 'icon-error-badge.png'), drawSheetSendIcon(32, 'error'));
console.log('Generated status badge overlay icons.');
