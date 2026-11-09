'use strict';
const assert=require('node:assert/strict'),{test}=require('node:test');
const Renderer=require('../../packages/game-data-editor/preview/spine-renderer');
class RegionAttachment{
  constructor(image,vertices=[0,0,10,0,10,10,0,10]){this.region={texture:{getImage:()=>image}};this.vertices=vertices;this.uvs=[0,0,1,0,1,1,0,1];this.color={r:1,g:1,b:1,a:1};}
  computeWorldVertices(_bone,vertices){vertices.set(this.vertices);}
}
class SkeletonClipping{clipEndWithSlot(){}clipEnd(){}isClipping(){return false;}}
const spine={RegionAttachment,MeshAttachment:class{},ClippingAttachment:class{},SkeletonClipping};
function image(alpha=[255,255,255,255]){const pixels=new Uint8ClampedArray(16);alpha.forEach((a,i)=>pixels.set([255,255,255,a],i*4));return{width:2,height:2,pixels};}
function slot(name,picture=image(),alpha=1,vertices){const attachment=new RegionAttachment(picture,vertices);return{data:{name,blendMode:0},bone:{active:true},color:{r:1,g:1,b:1,a:alpha},getAttachment:()=>attachment};}
function layer(slots,description={}){return{description:{uuid:'layer',x:0,y:0,scaleX:1,scaleY:1,...description},skeleton:{drawOrder:slots,color:{r:1,g:1,b:1,a:1}}};}
function pixels(t){const previous=global.document;t.after(()=>{if(previous===undefined)delete global.document;else global.document=previous;});global.document={createElement:()=>({getContext:()=>({drawImage(value){this.image=value;},getImageData(){return{data:this.image.pixels};}})})};}

test('preview picking respects draw order and transparent sprite padding',t=>{
  pixels(t);const scene=layer([slot('body'),slot('helmet',image([0,255,255,255]))]);
  assert.equal(Renderer.hitTest(spine,[scene],{x:2,y:2}).slot,'body');
  assert.equal(Renderer.hitTest(spine,[scene],{x:8,y:8}).slot,'helmet');
  assert.equal(Renderer.hitTest(spine,[scene],{x:12,y:2}),null);
});
test('preview picking uses mirrored, rotated, scaled and mounted layer coordinates',t=>{
  pixels(t);const back=layer([slot('body')]),front=layer([slot('weapon')],{uuid:'front',x:18,y:-6,scaleX:-2,scaleY:.7,rotation:35,_mountMotion:{a:1.1,b:.2,c:-.3,d:.9,x:7,y:12}});
  const point=Renderer.transformPoint(front.description,5,5),hit=Renderer.hitTest(spine,[back,front],point);
  assert.equal(hit.layer,front);assert.equal(hit.slot,'weapon');
});
test('hidden layers, invisible slots and degenerate geometry cannot steal preview selection',t=>{
  pixels(t);const back=layer([slot('body')]),front=layer([slot('hidden',image(),0),slot('collapsed',image(),1,[0,0,1,1,2,2,3,3])]);
  assert.equal(Renderer.hitTest(spine,[back,front],{x:5,y:5}).slot,'body');
  const hiddenLayer=layer([slot('hidden')],{opacity:0});assert.equal(Renderer.hitTest(spine,[back,hiddenLayer],{x:5,y:5}).slot,'body');
});
test('Canvas preview pan is a screen translation and defaults preserve the existing camera',()=>{
  const translations=[],ctx={save(){},restore(){},scale(){},translate:(x,y)=>translations.push([x,y])},options={width:500,height:400,bounds:{minX:0,minY:0,maxX:10,maxY:10,width:10,height:10},zoom:2,facing:-1};
  Renderer.draw(spine,ctx,[],options);assert.deepEqual(translations[0],[250,388]);
  translations.length=0;Renderer.draw(spine,ctx,[],{...options,panX:24,panY:-18});assert.deepEqual(translations[0],[274,370]);
});
test('mounted preview and picking interleave rider, left equipment, horse head and right equipment',t=>{
  pixels(t);const horse=layer([slot('body'),slot('mane'),slot('head')],{uuid:'horse',foregroundSlots:['head','mane']}),rider=layer([slot('Rider/Body'),slot('Rider/HandLeft/Shield'),slot('Rider/HandRight/Sword')],{uuid:'rider',followMount:{layer:'horse',bone:'saddle'}});
  const pieces=Renderer.renderPasses(spine,[horse,rider]).flatMap(pass=>pass.pieces.map(g=>g.slot));
  assert.deepEqual(pieces,['body','Rider/Body','Rider/HandLeft/Shield','head','mane','Rider/HandRight/Sword']);
  assert.equal(Renderer.hitTest(spine,[horse,rider],{x:5,y:5}).slot,'Rider/HandRight/Sword');
  rider.skeleton.drawOrder[2].color.a=0;assert.equal(Renderer.hitTest(spine,[horse,rider],{x:5,y:5}).slot,'mane');
  horse.skeleton.drawOrder[1].color.a=0;horse.skeleton.drawOrder[2].color.a=0;assert.equal(Renderer.hitTest(spine,[horse,rider],{x:5,y:5}).slot,'Rider/HandLeft/Shield');
});
