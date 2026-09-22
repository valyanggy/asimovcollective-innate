import assert from "node:assert/strict";
import test from "node:test";
import { serializeDitherToSvg } from "../src/lib/dither-cells";

test("serializeDitherToSvg keeps a transparent root and shape markup", () => {
  const svg = serializeDitherToSvg([
    { kind: "circle", cx: 12, cy: 18, r: 7.5, fill: "rgb(17,17,17)" },
    { kind: "path", d: "M 0 0 L 10 0 L 10 10 Z", fill: "rgb(40,40,40)" },
  ], 120, 80);
  assert.match(svg, /^<\?xml version="1.0"/);
  assert.match(svg, /viewBox="0 0 120 80"/);
  assert.match(svg, /<circle cx="12" cy="18" r="7.5"/);
  assert.match(svg, /<path d="M 0 0 L 10 0 L 10 10 Z"/);
  assert.doesNotMatch(svg, /#d2d3d0/);
});
