import test from 'node:test';
import assert from 'node:assert/strict';

const {academicFeatureGate,adminFeatureGate,requireFeature}=await import('../src/features.js');

const invoke=(middleware,path,features=[])=>new Promise(resolve=>middleware({path,user:{organization:{subscriptions:[{plan:{features}}]}}},{},error=>resolve(error)));

test('subscription excludes academic modules not selected by platform admin',async()=>{
  const error=await invoke(academicFeatureGate,'/library');
  assert.equal(error?.status,403);
  assert.equal(await invoke(academicFeatureGate,'/catalog'),undefined);
  assert.equal(await invoke(academicFeatureGate,'/library',['Library']),undefined);
});

test('CBT plan gate preserves result CSV import',async()=>{
  assert.equal((await invoke(adminFeatureGate,'/results'))?.status,403);
  assert.equal(await invoke(adminFeatureGate,'/results/import'),undefined);
  assert.equal(await invoke(adminFeatureGate,'/results',['CBT Tests']),undefined);
});

test('direct module guards use platform plan features',async()=>{
  assert.equal((await invoke(requireFeature('library'),'/'))?.status,403);
  assert.equal((await invoke(requireFeature('communications'),'/'))?.status,403);
  assert.equal(await invoke(requireFeature('communications'),'/', ['Communication hub']),undefined);
});
