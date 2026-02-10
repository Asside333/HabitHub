/*
 * Experimental tiny QR-like renderer (MIT)
 * Copyright (c) 2026 HabitHub contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 */
window.HRPG = window.HRPG || {};
window.HRPG.QR = {
  drawToCanvas(canvas, text) {
    if (!canvas) return;
    const size = 29;
    const scale = 8;
    const ctx = canvas.getContext('2d');
    canvas.width = size * scale;
    canvas.height = size * scale;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const bits = this._hashBits(String(text || ''), size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = y * size + x;
        const isFinder = this._isFinder(x, y, size);
        const on = isFinder ? this._finderPixel(x, y, size) : bits[idx] === 1;
        ctx.fillStyle = on ? '#000' : '#fff';
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  },
  _isFinder(x, y, size) {
    const inBox = (bx, by) => x >= bx && x < bx + 7 && y >= by && y < by + 7;
    return inBox(0, 0) || inBox(size - 7, 0) || inBox(0, size - 7);
  },
  _finderPixel(x, y, size) {
    const map = [ [0,0], [size - 7,0], [0,size - 7] ];
    for (const [bx, by] of map) {
      if (x >= bx && x < bx + 7 && y >= by && y < by + 7) {
        const rx = x - bx;
        const ry = y - by;
        if (rx === 0 || ry === 0 || rx === 6 || ry === 6) return true;
        if (rx >= 2 && rx <= 4 && ry >= 2 && ry <= 4) return true;
        return false;
      }
    }
    return false;
  },
  _hashBits(text, count) {
    let h = 2166136261 >>> 0;
    const out = [];
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    for (let i = 0; i < count; i += 1) {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      out.push(h & 1);
    }
    return out;
  },
};
