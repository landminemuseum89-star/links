const { PNG } = require('pngjs');

const LIGHT = [255, 250, 242, 255];
const LABEL = [180, 180, 180, 255];
const LABEL_TEXT_HEIGHT = 40;
const FONT = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  '6': ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111']
};

function setPixel(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const index = (png.width * y + x) << 2;
  png.data[index] = color[0];
  png.data[index + 1] = color[1];
  png.data[index + 2] = color[2];
  png.data[index + 3] = color[3];
}

function fillRect(png, x, y, width, height, color) {
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      setPixel(png, x + column, y + row, color);
    }
  }
}

function drawText(png, text, x, y, targetHeight, color) {
  let cursor = x;
  const normalized = String(text).toUpperCase();
  const charWidth = Math.round((targetHeight * 5) / 7);
  const charGap = Math.round((targetHeight * 2) / 7);

  for (const char of normalized) {
    const glyph = FONT[char] || FONT['-'];
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel === '1') {
          const x1 = cursor + Math.round((columnIndex * charWidth) / 5);
          const x2 = cursor + Math.round(((columnIndex + 1) * charWidth) / 5);
          const y1 = y + Math.round((rowIndex * targetHeight) / 7);
          const y2 = y + Math.round(((rowIndex + 1) * targetHeight) / 7);
          fillRect(png, x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1), color);
        }
      });
    });
    cursor += charWidth + charGap;
  }
}

function getTextWidth(text, targetHeight) {
  const charWidth = Math.round((targetHeight * 5) / 7);
  const charGap = Math.round((targetHeight * 2) / 7);
  return String(text).length * charWidth + Math.max(String(text).length - 1, 0) * charGap;
}

function addQrCodeLabel(qrBuffer, code) {
  const qr = PNG.sync.read(qrBuffer);
  const labelHeight = 110;
  const output = new PNG({ width: qr.width, height: qr.height + labelHeight });

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      setPixel(output, x, y, LIGHT);
    }
  }

  PNG.bitblt(qr, output, 0, 0, qr.width, qr.height, 0, 0);

  const label = String(code);
  const labelWidth = getTextWidth(label, LABEL_TEXT_HEIGHT);
  const x = Math.max(32, output.width - labelWidth - 36);
  const y = qr.height + Math.floor((labelHeight - LABEL_TEXT_HEIGHT) / 2);
  drawText(output, label, x, y, LABEL_TEXT_HEIGHT, LABEL);

  return PNG.sync.write(output);
}

module.exports = { addQrCodeLabel };
