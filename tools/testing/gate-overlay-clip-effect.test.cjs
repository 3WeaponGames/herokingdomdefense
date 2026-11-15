'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const file=path.resolve(__dirname,'../../assets/resources/GateOverlayClip.effect'),source=fs.readFileSync(file,'utf8'),meta=JSON.parse(fs.readFileSync(file+'.meta','utf8'));
function program(name){const match=new RegExp('CCProgram\\s+'+name+'\\s+%\\{([\\s\\S]*?)\\n\\}%').exec(source);assert(match,'Effect contains '+name);return match[1];}

test('clip effect uses Creator 2.4 uniform blocks and exposes the Sprite texture define',()=>{
  const vertex=program('vs'),fragment=program('fs');assert.match(vertex,/uniform\s+ClipMap\s*\{\s*vec4\s+maskMap\s*;/);assert.match(fragment,/uniform\s+ClipParams\s*\{[\s\S]*vec4\s+maskRect\s*;[\s\S]*float\s+maskOpacity\s*;[\s\S]*float\s+alphaThreshold\s*;/);
  assert.match(vertex,/#if\s+USE_TEXTURE[\s\S]*in\s+vec2\s+a_uv0/,'Material.define(USE_TEXTURE) must be a declared compiler define');
  for(const stage of [vertex,fragment])assert.doesNotMatch(stage.replace(/uniform\s+\w+\s*\{[\s\S]*?\};/g,''),/uniform\s+(?:float|vec[234]|mat[234])\s+/,'Non-sampler uniforms must be in blocks, avoiding EFX2201');
});

test('CCTexture multiplicative destinations initialize to white in both source and compiled GLSL variants',()=>{
  assert(Array.isArray(meta.compiledShaders)&&meta.compiledShaders.length,'Creator metadata contains the imported shader variants');
  for(const fragment of [program('fs'),...meta.compiledShaders.flatMap(shader=>[shader.glsl1.frag,shader.glsl3.frag])]){
    for(const name of ['stencil','o'])assert.match(fragment,new RegExp('vec4\\s+'+name+'\\s*=\\s*vec4\\(1(?:\\.0)?\\)\\s*;'),'CCTexture multiplies its destination; an uninitialized vec4 produces undefined alpha/RGB');
  }
  for(const shader of meta.compiledShaders){assert.match(shader.glsl1.frag,/stencil\s*\*=\s*maskTexture_tmp/);assert.match(shader.glsl1.frag,/o\s*\*=\s*texture_tmp/);assert.match(shader.glsl3.vert,/#if\s+USE_TEXTURE/);}
});

test('mask threshold and crop guard leave original paint RGBA and opacity independent',()=>{
  const fragment=program('fs');assert.match(fragment,/v_maskUV\.x\s*<\s*maskRect\.x/);assert.match(fragment,/v_maskUV\.y\s*<\s*maskRect\.y/);assert.match(fragment,/v_maskUV\.x\s*>\s*maskRect\.z/);assert.match(fragment,/v_maskUV\.y\s*>\s*maskRect\.w/);
  assert.match(fragment,/if\s*\(stencil\.a\s*\*\s*maskOpacity\s*<\s*alphaThreshold\)\s*discard/,'Threshold uses independent mask opacity with the engine strict-less-than boundary');
  const paint=fragment.slice(fragment.indexOf('vec4 o'));assert.match(paint,/CCTexture\(texture,\s*v_uv0,\s*o\)/);assert.match(paint,/o\s*\*=\s*v_color/);assert.doesNotMatch(paint,/maskOpacity|stencil|maskRect/,'Mask alpha gates pixels; it must not multiply paint alpha, tint, or RGB');
  assert.match(source,/blend:\s*true/);
});
