'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Settings=require('../../assets/_script/HeroSkillSettings'),Layout=require('../../assets/_script/HeroSkillVFXLayout'),{Model}=require('../../packages/hkd-skills/preview-model');

test('Fighter wind and active aura and Vanguard charging and locked momentum use the ground emitter rather than body or overhead anchors',()=>{
  for(const style of ['fighter','vanguard'])for(const facing of [-1,1])for(const slot of ['passive','buff']){
    const settings=Settings.defaults(style),visual=settings.visual;assert.equal(visual[slot+'OffsetY'],0);const hero={x:125,y:-34},frame={entities:[{key:slot,slot,style,phase:'loop',age:.2,scale:1,opacity:1}]},context={style,facing,hero,heroBody:{x:400,y:800}},placed=Layout.entities(frame,visual,context);assert.equal(placed.length,1);assert.equal(placed[0].x,hero.x);assert.equal(placed[0].y,hero.y);assert.equal(placed[0].anchorX,placed[0].clip.anchorX);assert.equal(placed[0].anchorY,placed[0].clip.anchorY);
    hero.x+=77;hero.y-=15;context.heroBody.y=2000;const moved=Layout.entities(frame,visual,context)[0];assert.equal(moved.x,hero.x);assert.equal(moved.y,hero.y);assert.equal(moved.scaleX,facing);assert.equal(moved.behind,style!=='fighter','Fighter stack and skill auras render in front without changing their ground pivot');
  }
});

test('grounded defaults preserve explicit saved offsets and do not rewrite authoring or change their simulation clocks',()=>{
  for(const style of ['fighter','vanguard']){
    const config={HeroSkills:{[style]:{visual:{passiveOffsetX:12,passiveOffsetY:65,buffOffsetX:-7,buffOffsetY:25,customFuture:{enabled:true}}}}},before=JSON.stringify(config),settings=Settings.effective(style,config),model=new Model(style,settings,{mode:'active',attackRate:0,targetDistance:100,heroBodyOffset:{x:900,y:1500}});assert.equal(settings.visual.passiveOffsetY,65);assert.equal(settings.visual.buffOffsetY,25);
    model.advance(.7);const frame={entities:['passive','buff'].map(slot=>({key:slot,slot,style,phase:'loop',age:.7,scale:1,opacity:1}))},placed=Layout.entities(frame,settings.visual,model.vfxContext);assert.deepEqual(placed.map(row=>({x:row.x,y:row.y})),[{x:model.hero.x+12,y:model.hero.y+65},{x:model.hero.x-7,y:model.hero.y+25}]);assert.equal(JSON.stringify(config),before);
  }
});
