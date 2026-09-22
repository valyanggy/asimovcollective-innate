import assert from "node:assert/strict";
import test from "node:test";
import { clampTypeBar, clampTypeColor, clampTypeFace, clampTypeField, clampTypeFont, clampTypeTrack, mapTypeLineBoxes, nearestTypeBox, typeBlockFromSetup, typeBlockLabel, typeLineMergeScale, typeLineMetrics, wrapTypeLines, TYPE_AREA_COLOR, TYPE_AREA_DEFAULT, TYPE_AREA_TRACK, TYPE_SURROUND_DEFAULTS } from "../src/lib/type-area";

test("wrapTypeLines keeps author breaks and wraps long lines", () => {
  const measure = (line: string) => line.length;
  assert.deepEqual(wrapTypeLines("Innate\nOS", measure, 20), ["Innate", "OS"]);
  assert.deepEqual(wrapTypeLines("one two three four", measure, 8), ["one two", "three", "four"]);
  assert.deepEqual(wrapTypeLines("", measure, 8), [""]);
  const wide = wrapTypeLines("one two three four five", measure, 20);
  const narrow = wrapTypeLines("one two three four five", measure, 8);
  assert.ok(narrow.length > wide.length);
});

test("type size and field width stay in range", () => {
  assert.equal(clampTypeFont(6), 9);
  assert.equal(clampTypeFont(12), 12);
  assert.equal(clampTypeFont(54.4), 54);
  assert.equal(clampTypeFont(120), 96);
  assert.equal(clampTypeField(.02), .14);
  assert.equal(clampTypeField(.9), .78);
  assert.equal(clampTypeBar(.2), .55);
  assert.equal(clampTypeBar(3), 2.4);
  assert.equal(clampTypeBar(3, 10), 3);
  assert.equal(clampTypeBar(11, 10), 10);
  assert.equal(clampTypeFace("Algebra"), "Algebra");
  assert.equal(clampTypeFace("Comic Sans"), "MDIO");
  assert.equal(clampTypeTrack(-.2), -.15);
  assert.equal(clampTypeTrack(TYPE_AREA_TRACK), -.05);
  assert.equal(clampTypeTrack(.4), .2);
  assert.equal(clampTypeColor("#0300cc"), "#0300cc");
  assert.equal(clampTypeColor("bad"), TYPE_AREA_COLOR);
});

test("type block labels stay short", () => {
  assert.equal(typeBlockLabel("  Sense  "), "Sense");
  assert.equal(typeBlockLabel(""), "Type");
});

test("10_text area defaults to the Catan type setup", () => {
  assert.match(TYPE_AREA_DEFAULT, /Catan after work/);
  assert.deepEqual(TYPE_SURROUND_DEFAULTS.map(block => block.copy), ["SEARCH CABINETS", "OPEN BOX", "SET UP THE BOARD"]);
});

test("setup images restore every type slot, not just the center", () => {
  assert.equal(typeBlockFromSetup({ name: "Sense" }), null);
  const sense = typeBlockFromSetup({
    name: "Hey Cosmo",
    typeCopy: "Hey Cosmo",
    typeFontSize: 40,
    sizePercent: 22,
    xPercent: 36.9,
    yPercent: 19.3,
    typeBarWidth: 2.01,
    typeBarHeight: 1.81,
    typeFace: "Algebra",
    typeTrack: .08,
    typeColor: "#0300cc",
  });
  assert.ok(sense);
  assert.equal(sense.copy, "Hey Cosmo");
  assert.equal(sense.fontSize, 40);
  assert.equal(sense.fieldWidth, .22);
  assert.equal(sense.cx, .369);
  assert.equal(sense.cy, .193);
  assert.equal(sense.barWidth, 2.01);
  assert.equal(sense.barHeight, 1.81);
  assert.equal(sense.face, "Algebra");
  assert.equal(sense.track, .08);
  assert.equal(sense.color, "#0300cc");
});

test("type occupancy is one slab per line with leading left empty", () => {
  const lines = typeLineMetrics(["Innate is the", "", "test"], 54, 400, 14, line => line.length * 10);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].width < lines[0].width);
  assert.ok(Math.abs(lines[1].left + lines[1].width / 2 - 200) < 1);
  assert.ok(lines[1].top > lines[0].top + lines[0].height);
  const boxes = mapTypeLineBoxes(lines, 400, 200, { x: 100, y: 50, width: 400, height: 200 }, { barWidth: 1, barHeight: 1 });
  assert.equal(boxes.length, 2);
  assert.ok(boxes[1].top > boxes[0].bottom);
  assert.ok(boxes[1].right - boxes[1].left < boxes[0].right - boxes[0].left);
  const wide = mapTypeLineBoxes(lines, 400, 200, { x: 100, y: 50, width: 400, height: 200 }, { barWidth: 1.8, barHeight: 1.4 });
  assert.ok(wide[0].right - wide[0].left > boxes[0].right - boxes[0].left);
  assert.ok(wide[0].bottom - wide[0].top > boxes[0].bottom - boxes[0].top);
  assert.ok(typeLineMergeScale(boxes, 6) < 6);
  const lower = { left: 80, top: 220, right: 140, bottom: 280 };
  assert.equal(nearestTypeBox(boxes, lower), boxes[1]);
});
