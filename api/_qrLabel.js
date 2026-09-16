const { PNG } = require('pngjs');

const LIGHT = [255, 250, 242, 255];
const LABEL = [142, 142, 142, 255];
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

function drawText(png, text, x, y, scale, color) {
  let cursor = x;
  const normalized = String(text).toUpperCase();

  for (const char of normalized) {
    const glyph = FONT[char] || FONT['-'];
    glyph.forEach((row, rowIndex) => {
      [...row].forEach((pixel, columnIndex) => {
        if (pixel === '1') {
          fillRect(png, cursor + columnIndex * scale, y + rowIndex * scale, scale, scale, color);
        }
      });
    });
    cursor += 7 * scale;
  }
}

function getTextWidth(text, scale) {
  return String(text).length * 5 * scale + Math.max(String(text).length - 1, 0) * 2 * scale;
}

function addQrCodeLabel(qrBuffer, code) {
  const qr = PNG.sync.read(qrBuffer);
  const labelHeight = 110;
  const scale = 8;
  const output = new PNG({ width: qr.width, height: qr.height + labelHeight });

  for (let y = 0; y < output.height; y += 1) {
    for (let x = 0; x < output.width; x += 1) {
      setPixel(output, x, y, LIGHT);
    }
  }

  PNG.bitblt(qr, output, 0, 0, qr.width, qr.height, 0, 0);

  const label = String(code);
  const labelWidth = getTextWidth(label, scale);
  const x = Math.max(32, output.width - labelWidth - 36);
  const y = qr.height + Math.floor((labelHeight - 7 * scale) / 2);
  drawText(output, label, x, y, scale, LABEL);

  return PNG.sync.write(output);
}

module.exports = { addQrCodeLabel };
