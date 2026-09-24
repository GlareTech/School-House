import test from 'node:test';
import assert from 'node:assert/strict';

process.env.FEATURE_LIBRARY='false';
process.env.FEATURE_CBT='false';
process.env.FEATURE_COMMUNICATIONS='false';
const {academicFeatureGate,adminFeatureGate,requireFeature}=await import('../src/features.js');

const invoke=(middleware,path)=>new Promise(resolve=>middleware({path},{},error=>resolve(error)));

test('disabled academic modules return a non-disclosing 404',async()=>{
  const error=await invoke(academicFeatureGate,'/library');
  assert.equal(error?.status,404);
  assert.equal(await invoke(academicFeatureGate,'/catalog'),undefined);
});

test('CBT endpoints are disabled while result CSV import remains available',async()=>{
  assert.equal((await invoke(adminFeatureGate,'/results'))?.status,404);
  assert.equal(await invoke(adminFeatureGate,'/results/import'),undefined);
});

test('direct module guards use the same environment feature state',async()=>{
  assert.equal((await invoke(requireFeature('library'),'/'))?.status,404);
  assert.equal((await invoke(requireFeature('communications'),'/'))?.status,404);
});
