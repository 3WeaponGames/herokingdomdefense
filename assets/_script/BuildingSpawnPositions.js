"use strict";
function point(p){return !!p&&typeof p==="object"&&["x","y"].every(function(k){return typeof p[k]==="number"&&isFinite(p[k])&&Math.abs(p[k])<=10000;});}
function get(row,index){var p=row&&row.SpawnPositions&&row.SpawnPositions[String(index+1)];return point(p)?p:null;}
function valid(value){return !!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).every(function(k){return !/^\d+$/.test(k)||Number(k)>0&&Number(k)<=128&&point(value[k]);});}
function applyAd(owner){
 var node=owner.ndVideoSoldier,state=owner._adUnitPosition,row=owner.buildInfo&&owner.buildInfo.cfg,p=row&&row.AdUnitPosition;
 if(!node||cc.isValid&&!cc.isValid(node,true))return;
 if(!point(p)){if(state&&state.node===node){node.setPosition(state.x,state.y);delete owner._adUnitPosition;}return;}
 if(!state||state.node!==node)state=owner._adUnitPosition={node:node,x:node.x,y:node.y};
 var position=owner.node.convertToWorldSpaceAR(cc.v2(p.x,p.y));if(node.parent)position=node.parent.convertToNodeSpaceAR(position);node.setPosition(position);
}
exports.point=point;exports.get=get;exports.valid=valid;exports.applyAd=applyAd;
