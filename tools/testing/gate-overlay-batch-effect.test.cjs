'use strict';
const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const source=fs.readFileSync(process.env.HKD_GATE_BATCH_EFFECT_SOURCE||path.resolve(__dirname,'../../assets/resources/GateOverlayBatch.effect'),'utf8');
const vertex=source.split('CCProgram vs %{')[1].split('}%')[0],fragment=source.split('CCProgram fs %{')[1].split('}%')[0];

test('batch shader matches the native six-attribute format and keeps per-overlay parameters out of material uniforms',()=>{
  const attributes=Array.from(vertex.matchAll(/\bin\s+(vec[234]|float)\s+(a_\w+)\s*;/g),match=>[match[2],match[1]]);
  assert.deepEqual(attributes,[['a_position','vec3'],['a_wallUv','vec2'],['a_actorUv','vec2'],['a_color','vec4'],['a_clip','vec4'],['a_paintActor','float']]);
  const uniforms=Array.from(source.matchAll(/\buniform\s+(\w+)\s+(\w+)\s*;/g),match=>[match[2],match[1]]);
  assert.deepEqual(uniforms,[['texture','sampler2D'],['maskTexture','sampler2D']]);
  assert.match(vertex,/gl_Position\s*=\s*cc_matViewProj\s*\*\s*vec4\(a_position,\s*1\)/);
  assert.doesNotMatch(vertex,/cc_matWorld/,'Native generic assembler already transforms each local position');
});

test('canonical wall and actor samples are initialized for multiplicative CCTexture and expose USE_TEXTURE to the compiler',()=>{
  assert.match(fragment,/vec4\s+wall\s*=\s*vec4\(1\),\s*actor\s*=\s*vec4\(1\)/);
  assert.match(fragment,/#if USE_TEXTURE[\s\S]*CCTexture\(texture,\s*v_wallUv,\s*wall\)[\s\S]*CCTexture\(maskTexture,\s*v_actorUv,\s*actor\)/);
  assert.match(fragment,/vec4\s+stencil\s*=\s*mix\(actor,\s*wall,\s*v_paintActor\)/);
  assert.match(fragment,/vec4\s+o\s*=\s*mix\(wall,\s*actor,\s*v_paintActor\)\s*\*\s*v_color/);
});

test('clipping preserves independent mask opacity, strict native alpha threshold and original paint color output',()=>{
  assert.match(fragment,/if\s*\(v_clip\.x < 0\.0 \|\| v_clip\.y < 0\.0 \|\| v_clip\.x > 1\.0 \|\| v_clip\.y > 1\.0\) discard/);
  assert.match(fragment,/if\s*\(stencil\.a \* v_clip\.z < v_clip\.w\) discard/);
  assert.doesNotMatch(fragment,/stencil\.a\s*\*[^;\n]*v_color/,'Paint opacity must not change the binary mask test');
  assert.match(fragment,/#if USE_BGRA[\s\S]*gl_FragColor = o\.bgra;[\s\S]*#else[\s\S]*gl_FragColor = o\.rgba;/);
  assert.doesNotMatch(fragment,/o\s*\*=\s*stencil/,'The mask clips coverage without multiplying paint alpha');
});
