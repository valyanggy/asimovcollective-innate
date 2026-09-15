import assert from "node:assert/strict";
import test from "node:test";
import { Color, Vector3 } from "three";
import { FIELD, createHandSegments, createSurfaceSamples, distanceToHand, sampleHandParticles, type Palette } from "../src/lib/hand-model";

const palette: Palette = {
  background: new Color("white"), foreground: new Color("black"),
  blue: new Color("blue"), purple: new Color("purple"),
  teal: new Color("cyan"), orange: new Color("orange"),
};

test("two rigid jaws rotate around fixed hinges without changing segment lengths", () => {
  const open = createHandSegments(0, palette);
  for (const curl of [0.25, 0.5, 0.75, 1]) {
    const hand = createHandSegments(curl, palette);
    for (let i = 0; i < 6; i++) {
      assert.ok(Math.abs(hand[i].a.distanceTo(hand[i].b) - open[i].a.distanceTo(open[i].b)) < 1e-10);
    }
  }
  const closed = createHandSegments(1, palette);
  assert.equal(closed.length, 10, "two 3-segment jaws plus four stationary base segments");
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(closed[i].b.x - closed[i + 3].b.x) < 1e-10);
    assert.ok(Math.abs(closed[i].b.y + closed[i + 3].b.y) < 1e-10);
  }
  assert.ok(closed[0].a.distanceTo(open[0].a) < 1e-10);
  assert.ok(closed[3].a.distanceTo(open[3].a) < 1e-10);
  const rootMotion = closed[0].a.clone().sub(open[0].a);
  const tipMotion = closed[2].b.clone().sub(open[2].b);
  assert.ok(rootMotion.distanceTo(tipMotion) > 1, "jaw closure must not reduce to a common translation");
});

test("open claw has no contact, and closed claw grips both opposing faces", () => {
  const samples = createSurfaceSamples();
  const contactCount = (curl: number) => {
    const hand = createHandSegments(curl, palette);
    return samples.filter(({ position }) => distanceToHand(position, hand) <= FIELD.contactTolerance).length;
  };
  assert.equal(contactCount(0), 0);
  const closed = createHandSegments(1, palette);
  for (const side of [-1, 1]) {
    assert.ok(samples.some(({ position }) => Math.abs(position.y - side * 1.003) < 1e-8
      && distanceToHand(position, closed) <= FIELD.contactTolerance));
  }
});

test("equal screen positions do not imply contact when depth differs", () => {
  const hand = createHandSegments(1, palette);
  const frontContact = createSurfaceSamples().find(({ position }) => position.y > 1 && distanceToHand(position, hand) <= FIELD.contactTolerance);
  assert.ok(frontContact);
  const separated = frontContact.position.clone().add(new Vector3(0, 0, 2));
  assert.equal(separated.x, frontContact.position.x);
  assert.equal(separated.y, frontContact.position.y);
  assert.ok(distanceToHand(separated, hand) > 1);
});

test("print marks add local color, stretch, and softness without reshuffling pose", () => {
  const hand = createHandSegments(0.4, palette);
  const flat = sampleHandParticles(hand, palette);
  const printed = sampleHandParticles(hand, palette, "print");
  const again = sampleHandParticles(hand, palette, "print");
  assert.equal(printed.length, flat.length);
  assert.ok(printed.every((particle, i) => particle.position.equals(flat[i].position) && particle.scale === flat[i].scale));
  assert.ok(printed.some(particle => (particle.span ?? 1) >= 2));
  assert.ok(printed.some(particle => (particle.span ?? 1) === 3));
  assert.ok(printed.some(particle => particle.color.r > particle.color.b + 0.12), "print inks should include warm hues");
  assert.ok(printed.every(particle => particle.colorB && particle.span && particle.softness! > 0 && particle.halo! > 0 && particle.axis));
  assert.ok(printed.every((particle, i) => particle.span === again[i].span && particle.colorB!.equals(again[i].colorB!)));
});

test("the gesture stays outside the cube and produces finite particles", () => {
  for (let step = 0; step <= 20; step++) {
    const hand = createHandSegments(step / 20, palette);
    for (const segment of hand) for (let i = 0; i <= 24; i++) {
      const p = segment.a.clone().lerp(segment.b, i / 24);
      const gap = Math.hypot(Math.max(Math.abs(p.x) - 1, 0), Math.max(Math.abs(p.y) - 1, 0), Math.max(Math.abs(p.z) - 1, 0)) - segment.radius;
      assert.ok(gap >= -1e-8, `capsule penetrates the cube at curl ${step / 20}`);
    }
    const particles = sampleHandParticles(hand, palette);
    assert.ok(particles.length > 0 && particles.length <= 2400);
    assert.ok(particles.every(({ position }) => position.toArray().every(Number.isFinite)));
  }
});
