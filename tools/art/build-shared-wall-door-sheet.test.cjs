'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const PNG=require('../../packages/hkd-characters/lib/png-atlas'),B=require('./build-shared-wall-door-sheet.cjs');
function fixture(){
 const image={width:64,height:64,rgba:Buffer.alloc(64*64*4,255)},regions={},primary=[];
 for(let n=0;n<9;n++){const name='rts_door_'+['closed','inward','outward'][n%3]+'_'+(Math.floor(n/3)+1),x=2+n%3*20,y=2+Math.floor(n/3)*20;regions[name]=[x,y,12,12];primary.push(name);for(let yy=y;yy<y+12;yy++)for(let xx=x;xx<x+12;xx++)image.rgba.set([90+n,55,25,255],(yy*64+xx)*4);}
 return{image,review:{version:3,doors:{version:2},primary,regions}};
}
test('approved sheet import keeps layout, interior colors and source bytes while clearing only the white matte',()=>{
 const {image,review}=fixture(),bytes=PNG.encode(image),before=Buffer.from(bytes),result=B.build(bytes,review),out=PNG.decode(result.png);
 assert.deepEqual(bytes,before);assert.equal(out.rgba[3],0);assert.deepEqual([out.width,out.height],[64,64]);
 for(const [i,r]of Object.values(review.regions).entries()){const [x,y]=r,k=((y+5)*64+x+5)*4;assert.deepEqual([...out.rgba.subarray(k,k+4)],[90+i,55,25,255]);assert(result.atlas.includes('xy: '+x+', '+y));}
 assert.deepEqual(result.metadata.doors,review.doors);
});
test('sheet import rejects stale inputs, missing artwork and overlapping primary crops',()=>{
 const {image,review}=fixture(),bytes=PNG.encode(image),clone=()=>JSON.parse(JSON.stringify(review));
 const stale=clone();stale.sourceSha256='0'.repeat(64);assert.throws(()=>B.build(bytes,stale),/differs/);
 const missing=clone();missing.regions[missing.primary[0]]=[0,0,1,1];assert.throws(()=>B.build(bytes,missing),/omit or duplicate/);
 const overlap=clone();overlap.regions[overlap.primary[0]]=[0,0,40,40];assert.throws(()=>B.build(bytes,overlap),/omit or duplicate/);
});
test('an already transparent sheet preserves every RGBA byte',()=>{
 const {image}=fixture();image.rgba[3]=0;const before=Buffer.from(image.rgba),out=B.transparentWhite(image);assert.deepEqual(out.rgba,before);
});
