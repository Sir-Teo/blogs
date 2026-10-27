/* Small mathematical models for the Minecraft article. No game code or assets.
 * All generated terrain is synthetic. See the article's methods appendix. */
(function (root) {
  'use strict';
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function trilinear(c, x, y, z) {
    var value = 0, weights = [];
    for (var i = 0; i < 8; i++) {
      var weight = (i & 1 ? x : 1 - x) * (i & 2 ? y : 1 - y) * (i & 4 ? z : 1 - z);
      weights.push(weight); value += c[i] * weight;
    }
    return { value: value, weights: weights };
  }
  function squeeze(v) { var c = clamp(v, -1, 1); return c / 2 - c * c * c / 24; }
  function coordinate(x, y, z) {
    var cx = Math.floor(x / 16), cy = Math.floor(y / 16), cz = Math.floor(z / 16);
    var lx = x - cx * 16, ly = y - cy * 16, lz = z - cz * 16;
    return { chunkX: cx, chunkZ: cz, sectionY: cy, localX: lx, localY: ly, localZ: lz, index: ly * 256 + lz * 16 + lx };
  }
  function region(cx, cz, bytes) {
    var rx = Math.floor(cx / 32), rz = Math.floor(cz / 32);
    var x = cx - rx * 32, z = cz - rz * 32, slot = x + z * 32;
    var sectors = Math.ceil((bytes + 5) / 4096), external = sectors >= 256;
    return { x: x, z: z, regionX: rx, regionZ: rz, slot: slot, locationByte: slot * 4, timestampByte: 4096 + slot * 4, sectors: sectors, external: external, recordSectors: external ? 1 : sectors };
  }
  function hash(x, y, seed) {
    var h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
    h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967295 * 2 - 1;
  }
  function noise(x, y, seed) {
    var ix = Math.floor(x), iy = Math.floor(y), tx = x - ix, ty = y - iy;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    return lerp(lerp(hash(ix, iy, seed), hash(ix + 1, iy, seed), tx), lerp(hash(ix, iy + 1, seed), hash(ix + 1, iy + 1, seed), tx), ty);
  }
  function density(x, y, seed, caves) {
    var terrain = (25 - y) / 23 + noise(x / 23, y / 28, seed) * 1.2 + noise(x / 9, y / 12, seed + 3) * 0.35;
    var cave = Math.abs(noise(x / 13, y / 11, seed + 19)) * 3 - 0.23;
    return caves && y < 32 ? Math.min(terrain, cave) : terrain;
  }
  var api = { lerp: lerp, clamp: clamp, trilinear: trilinear, squeeze: squeeze, coordinate: coordinate, region: region, density: density };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.MinecraftCore = api;
})(typeof window !== 'undefined' ? window : null);
