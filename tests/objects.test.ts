import assert from "node:assert/strict";
import test from "node:test";
import { Color, Vector3 } from "three";
import { createObjectModel, distanceToObject } from "../src/lib/objects";
import { createHandSegments, distanceToHand, FIELD } from "../src/lib/hand-model";

const palette={background:new Color("white"),foreground:new Color("black"),teal:new Color("cyan"),blue:new Color("blue"),purple:new Color("purple"),orange:new Color("orange")};

for(const id of ["knight","football","sock"] as const) {
  test(`${id}: field and contact samples follow its surface, not the old cube`,()=>{
    const model=createObjectModel(id,palette);
    try {
      assert.ok(model.surface.length>0 && model.surface.length<=32768);
      assert.ok(model.field.length>0 && model.field.length<=8192);
      assert.ok(model.field.every(p=>model.distance(p)>=-1e-8 && model.distance(p)<FIELD.proximityRange));
      assert.ok(model.surface.every(s=>Math.abs(model.distance(s.position))<.012));
      assert.ok(model.field.some(p=>Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))<1),"field must enter empty space inside the former cube's bounds");
      const open=createHandSegments(0,palette),closed=createHandSegments(1,palette);
      assert.equal(model.surface.filter(s=>distanceToHand(s.position,open)<=FIELD.contactTolerance).length,0);
      const contact=model.surface.filter(s=>distanceToHand(s.position,closed)<=FIELD.contactTolerance);
      assert.ok(contact.some(s=>s.position.y>.9));
      assert.ok(contact.some(s=>s.position.y<-.9));
    } finally {model.dispose();}
  });
}

test("object interiors and empty corners differ by selected shape",()=>{
  const corner=new Vector3(.9,.9,.9);
  assert.ok(distanceToObject("cube",corner)<0);
  for(const id of ["knight","football","sock"] as const) assert.ok(distanceToObject(id,corner)>0);
  assert.ok(distanceToObject("football",new Vector3())<0);
  assert.ok(distanceToObject("sock",new Vector3(-.1,.5,0))<0);
  assert.ok(distanceToObject("knight",new Vector3(0,-.9,0))<0);
});
