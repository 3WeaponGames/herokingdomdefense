'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test'),{selectSkin}=require('../../packages/hkd-characters/lib/native-bake');
function fixture(){return{skins:[{name:'default',attachments:{shadow:{shade:{path:'shadow'}},body:{mesh:{path:'plain'},shared:{path:'trim'}}}},{name:'blue',attachments:{body:{mesh:{path:'blue'}}}}],animations:{idle:{deform:{default:{shadow:{shade:[{time:0,vertices:[1,2]}]},body:{mesh:[{time:0,vertices:[10,20]}],shared:[{time:0,vertices:[3,4]}]}},blue:{body:{mesh:[{time:0,vertices:[5,6]}]}}}},attack:{deform:{default:{body:{mesh:[{time:0,vertices:[7,8]}]}}}}}};}
test('publishing a selected skin retains default-only attachments and their own deformation tracks',()=>{
 const rig=fixture();selectSkin(rig,'blue');assert.deepEqual(rig.skins[0].attachments,{shadow:{shade:{path:'shadow'}},body:{mesh:{path:'blue'},shared:{path:'trim'}}});assert.equal(rig.skins[0].name,'default');
 assert.deepEqual(rig.animations.idle.deform.default,{shadow:{shade:[{time:0,vertices:[1,2]}]},body:{mesh:[{time:0,vertices:[5,6]}],shared:[{time:0,vertices:[3,4]}]}});
 assert.deepEqual(rig.animations.attack.deform,{},'default mesh deformation cannot leak onto a different selected-skin mesh with the same name');
});
test('selecting the default skin or a missing skin keeps the original default attachments and deformations',()=>{
 for(const name of ['default','missing']){const rig=fixture(),before=structuredClone(rig);selectSkin(rig,name);assert.deepEqual(rig.skins,[before.skins[0]]);assert.deepEqual(rig.animations.idle.deform,{default:before.animations.idle.deform.default});}
});
