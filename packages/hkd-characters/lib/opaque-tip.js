'use strict';
// Normalized visible head of a vertical equipment PNG. The Spine attachment
// keeps its original rectangle; transparent padding must not move spell VFX.
function tip(image){
 const {width,height,rgba}=image||{};if(!width||!height||!rgba)return null;
 for(let y=0;y<height;y++){let sum=0,count=0;for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]>=16){sum+=x+.5;count++;}if(count)return{u:sum/count/width,v:(y+.5)/height};}return null;
}
function annotate(rig,pictures){
 for(const skin of rig.skins||[])for(const [slot,variants]of Object.entries(skin.attachments||{})){
  if(!/(?:^|\/)Staff$/.test(slot))continue;
  for(const [name,attachment]of Object.entries(variants)){const image=pictures[attachment.path||name],head=tip(image);if(head)attachment._skillTip=head;}
 }
}
exports.tip=tip;exports.annotate=annotate;
