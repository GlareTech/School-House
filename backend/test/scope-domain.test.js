import test from 'node:test';
import assert from 'node:assert/strict';
import {canTargetLibrary,libraryWhereForStaff} from '../src/scope-domain.js';

const scope={classWideIds:['class-led'],courses:[{classId:'class-led',subjectId:'english'},{classId:'class-taught',subjectId:'maths'}]};

test('library targets require a class-wide assignment or an exact teaching course',()=>{
  assert.equal(canTargetLibrary(scope,'class-led',null),true);
  assert.equal(canTargetLibrary(scope,'class-taught',null),false);
  assert.equal(canTargetLibrary(scope,'class-taught','maths'),true);
  assert.equal(canTargetLibrary(scope,'class-taught','english'),false);
  assert.equal(canTargetLibrary(scope,null,'maths'),true);
  assert.equal(canTargetLibrary(scope,null,'science'),false);
});

test('staff library scope always includes own uploads and preserves class-subject pairs',()=>{
  const where=libraryWhereForStaff('teacher-1',scope);
  assert.deepEqual(where.OR[0],{uploadedById:'teacher-1'});
  assert.ok(where.OR.some(rule=>rule.subjectId==='maths'&&rule.OR.some(target=>target.classId==='class-taught')));
  assert.ok(!where.OR.some(rule=>rule.subjectId==='maths'&&rule.OR?.some(target=>target.classId==='class-led')));
});
