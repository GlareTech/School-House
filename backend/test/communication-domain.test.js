import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRecipients,maskDestination,normalizePhone,validPhone} from '../src/communication-domain.js';

const student=(id,overrides={})=>({id,name:`Student ${id}`,email:`student${id}@school.test`,phone:'+234 800 000 0000',emergencyContactName:'Guardian',emergencyContactPhone:'+234-811-111-1111',guardianEmail:'guardian@example.test',studentAllowEmail:true,studentAllowSms:true,guardianAllowEmail:true,guardianAllowSms:true,...overrides});

test('recipient builder respects preferences and deduplicates shared destinations',()=>{
  let id=0;const rows=buildRecipients([student('a'),student('b',{studentAllowSms:false})],{channels:['EMAIL','SMS'],recipientType:'BOTH'},()=>String(++id));
  assert.equal(rows.filter(x=>x.recipientKind==='GUARDIAN').length,2);
  assert.equal(rows.filter(x=>x.destination==='guardian@example.test').length,1);
  assert.equal(rows.filter(x=>x.destination==='+2348111111111').length,1);
  assert.equal(rows.filter(x=>x.studentId==='b'&&x.recipientKind==='STUDENT'&&x.channel==='SMS').length,0);
});

test('invalid destinations are omitted and displayed destinations are masked',()=>{
  const rows=buildRecipients([student('a',{phone:'not-a-number',guardianEmail:'invalid'})],{channels:['EMAIL','SMS'],recipientType:'BOTH'},()=>String(Math.random()));
  assert.equal(rows.some(x=>x.destination==='not-a-number'),false);
  assert.equal(rows.some(x=>x.destination==='invalid'),false);
  assert.equal(maskDestination('learner@school.test'),'le***@school.test');
  assert.equal(maskDestination('+2348012345678'),'+23***678');
});

test('phone normalization accepts common punctuation but rejects short values',()=>{
  assert.equal(normalizePhone('+234 (801) 234-5678'),'+2348012345678');
  assert.equal(validPhone('+2348012345678'),true);
  assert.equal(validPhone('123'),false);
});
