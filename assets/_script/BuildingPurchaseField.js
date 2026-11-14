"use strict";
var owns=function (o,k) {return Object.prototype.hasOwnProperty.call(o||{},k);};
var FACES=[{id:"NE",label:"Northeast"},{id:"NW",label:"Northwest"},{id:"SE",label:"Southeast"},{id:"SW",label:"Southwest"}];
function variants(category) {return category&&Array.isArray(category.PlacementVariants)?category.PlacementVariants:category&&category.enumValue===6?FACES:[];}
function validVariants(value) {var ids=[];return Array.isArray(value)&&value.length>0&&value.length<=32&&value.every(function (p) {if(!p||typeof p.id!=="string"||!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(p.id)||["constructor","prototype"].indexOf(p.id)>=0||ids.indexOf(p.id)>=0||typeof p.label!=="string"||!p.label.trim())return false;ids.push(p.id);return true;});}
function root(category,row) {
  var rows=category&&category.levelList||[],choices=category&&category.InitialChoices||[rows[0]&&rows[0].index];
  function reaches(index,seen) {if(!row||index===row.index)return true;if(seen.indexOf(index)>=0)return false;seen.push(index);var parent=rows.find(function (r) {return r.index===index;});return !!parent&&(parent.BranchBuild||[]).some(function (next) {return reaches(next,seen);});}
  return rows.find(function (r) {return choices.indexOf(r.index)>=0&&reaches(r.index,[]);})||rows[0];
}
function resolve(category,row,variant,basis) {
  var first=root(category,row),sources=[first&&first.PurchaseField,row!==first&&row&&row.PurchaseField].filter(Boolean);
  if(!sources.length)return null;
  var result={southwest:false,x:0,y:0};
  sources.forEach(function (source) {
    [source,owns(source.variants,variant)&&source.variants[variant]].filter(Boolean).forEach(function (p) {['southwest','x','y'].forEach(function (k) {if(owns(p,k))result[k]=p[k];});});
  });
  var ownSource=row&&row.PurchaseField,link=ownSource&&ownSource.TierOneLink;
  if(ownSource&&ownSource.variants&&ownSource.variants[variant]&&owns(ownSource.variants[variant],'TierOneLink'))link=ownSource.variants[variant].TierOneLink;
  // Untouched tiers inherit the first tier's world position, not merely its
  // numeric offset. Their body sizes may differ, but their pad must not drift.
  var ownVariant=ownSource&&ownSource.variants&&ownSource.variants[variant],manual=[ownSource,ownVariant].some(function(p){return p&&['x','y','southwest'].some(function(k){return owns(p,k);});});
  if(row!==first&&!validLink(link)&&!manual&&basis)link={version:1,sourceIndex:first.index,sourceMatrix:basis.matrix,targetMatrix:basis.matrix,sourceCenters:basis.centers,targetCenters:basis.centers};
  if(row!==first&&validLink(link)&&first&&first.index===link.sourceIndex){
    var source=resolve(category,first,variant)||{southwest:false,x:0,y:0},side=source.southwest?'southwest':'southeast',a=link.sourceCenters[side],b=link.targetCenters[side],m=link.sourceMatrix,n=link.targetMatrix,fa=worldScale(first),fb=worldScale(row),x=(a.x+m[0]*source.x+m[2]*source.y)*fa/fb-b.x,y=(a.y+m[1]*source.x+m[3]*source.y)*fa/fb-b.y,det=n[0]*n[3]-n[1]*n[2];
    result.southwest=source.southwest;result.x=(n[3]*x-n[2]*y)/det;result.y=(-n[1]*x+n[0]*y)/det;
  }
  return result;
}
function reference(category,row,variant){var first=root(category,row),result=null;[first&&first.PurchaseField,row!==first&&row&&row.PurchaseField].filter(Boolean).forEach(function(source){[source,source.variants&&source.variants[variant]].filter(Boolean).forEach(function(p){if(validReference(p.Reference))result=p.Reference;});});return result;}
function validReference(p){return !!p&&p.version===1&&typeof p.distance==='number'&&isFinite(p.distance)&&p.distance>0&&p.distance<=10000;}
function worldScale(row){var n=row&&row.WorldScale;return typeof n==='number'&&isFinite(n)&&n>=.05&&n<=10?n:1;}
function validLink(link){return !!link&&link.version===1&&Number.isInteger(link.sourceIndex)&&['sourceMatrix','targetMatrix'].every(function(k){var m=link[k];return Array.isArray(m)&&m.length===4&&m.every(function(n){return typeof n==='number'&&isFinite(n);})&&Math.abs(m[0]*m[3]-m[1]*m[2])>1e-9;})&&['sourceCenters','targetCenters'].every(function(k){return link[k]&&['southeast','southwest'].every(function(side){var p=link[k][side];return p&&typeof p.x==='number'&&isFinite(p.x)&&typeof p.y==='number'&&isFinite(p.y);});});}
function setting(value) {return !!value&&typeof value==='object'&&!Array.isArray(value)&&(!owns(value,'Reference')||validReference(value.Reference))&&(!owns(value,'southwest')||typeof value.southwest==='boolean')&&['x','y'].every(function (k) {return !owns(value,k)||typeof value[k]==='number'&&isFinite(value[k])&&Math.abs(value[k])<=10000;});}
function valid(value) {return setting(value)&&(!owns(value,'variants')||!!value.variants&&typeof value.variants==='object'&&!Array.isArray(value.variants)&&Object.keys(value.variants).every(function (k) {return /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(k)&&['constructor','prototype'].indexOf(k)<0&&setting(value.variants[k]);}));}
function unbuilt(category,variant){var p=category&&category.UnbuiltPad;if(!p)return null;var v=p.variants&&p.variants[variant]||p;return typeof v.x==='number'&&typeof v.y==='number'&&isFinite(v.x)&&isFinite(v.y)?{x:v.x,y:v.y}:null;}
exports.unbuilt=unbuilt;exports.reference=reference;exports.validReference=validReference;exports.root=root;exports.variants=variants;exports.resolve=resolve;exports.valid=valid;exports.validVariants=validVariants;exports.validLink=validLink;
