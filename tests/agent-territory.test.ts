import assert from "node:assert/strict";
import test from "node:test";
import { fitTerritoryEllipse, orderTerritory, territoryCoverage } from "../src/lib/agent-territory";

const vertices = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
test("unordered agents enclose an interior with a finite soft fringe", () => {
  const polygon = orderTerritory(vertices);
  assert.equal(territoryCoverage({ x: 50, y: 50 }, polygon, 10), 1);
  assert.equal(territoryCoverage({ x: 50, y: 0 }, polygon, 10), .5);
  assert.ok(territoryCoverage({ x: 50, y: -5 }, polygon, 10) > 0);
  assert.equal(territoryCoverage({ x: 50, y: -11 }, polygon, 10), 0);
});
test("dragging a corner changes the territory rather than retaining a fixed terrain", () => {
  const before = orderTerritory(vertices);
  const after = orderTerritory(vertices.map((point, index) => index === 1 ? { x: 100, y: 40 } : point));
  assert.equal(territoryCoverage({ x: 90, y: 80 }, before, 5), 1);
  assert.equal(territoryCoverage({ x: 90, y: 80 }, after, 5), 0);
});
test("concave and collapsed layouts remain finite and keep the agent vertices", () => {
  const concave = orderTerritory([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 100 }]);
  assert.equal(concave.length, 4);
  assert.equal(territoryCoverage({ x: 80, y: 60 }, concave, 5), 0);
  for (const points of [[], [{ x: 5, y: 5 }], [{ x: 5, y: 5 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: 20, y: 0 }]]) {
    const value = territoryCoverage({ x: 5, y: 5 }, orderTerritory(points), 10);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
});

test("fitted ellipse stays inside convex and concave territories", () => {
  for (const points of [vertices, [{x:0,y:0},{x:180,y:30},{x:60,y:60},{x:20,y:140}]]) {
    const polygon = orderTerritory(points), ellipse = fitTerritoryEllipse(polygon);
    assert.ok(ellipse);
    for (let i = 0; i < 120; i++) {
      const angle = i / 120 * Math.PI * 2;
      const x = ellipse.rx * Math.cos(angle), y = ellipse.ry * Math.sin(angle);
      const point = { x: ellipse.x + x * Math.cos(ellipse.angle) - y * Math.sin(ellipse.angle),
        y: ellipse.y + x * Math.sin(ellipse.angle) + y * Math.cos(ellipse.angle) };
      assert.ok(territoryCoverage(point, polygon, .01) >= .49);
    }
  }
  const square = fitTerritoryEllipse(orderTerritory(vertices))!;
  assert.ok(square.rx * square.ry > 2400);
  assert.equal(fitTerritoryEllipse([{x:0,y:0},{x:50,y:0},{x:100,y:0}]), null);
});
