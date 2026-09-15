import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';
import { thermalSpheres } from '../src/lib/thermal-claw';
import { createHandSegments } from '../src/lib/hand-model';
const palette = { background: new Color('white'), foreground: new Color('black'), blue: new Color('blue'), purple: new Color('purple'), teal: new Color('cyan'), orange: new Color('orange') };
test('thermal spheres retain their identities through articulation and include small edge fragments', () => {
  const poses = [0, .25, .5, .75, 1].map(curl => thermalSpheres(createHandSegments(curl, palette)));
  const first = poses[0];
  assert.ok(first.length <= 192);
  assert.ok(first.some(s => s.radius < .08));
  assert.ok(first.some(s => s.radius > .2));
  for (const pose of poses) {
    assert.equal(pose.length, first.length);
    assert.deepEqual(pose.map(s => s.radius), first.map(s => s.radius));
    assert.ok(pose.every(s => s.center.toArray().every(Number.isFinite)));
  }
  assert.ok(poses[0].some((s, i) => s.center.distanceTo(poses[4][i].center) > .4));
});
