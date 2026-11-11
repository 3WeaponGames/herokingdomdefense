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
function resolve(category,row,variant) {
  var first=root(category,row),sources=[first&&first.PurchaseField,row!==first&&row&&row.PurchaseField].filter(Boolean);
  if(!sources.length)return null;
  var result={southwest:false,x:0,y:0};
  sources.forEach(function (source) {
    [source,owns(source.variants,variant)&&source.variants[variant]].filter(Boolean).forEach(function (p) {['southwest','x','y'].forEach(function (k) {if(owns(p,k))result[k]=p[k];});});
  });return result;
}
function setting(value) {return !!value&&typeof value==='object'&&!Array.isArray(value)&&(!owns(value,'southwest')||typeof value.southwest==='boolean')&&['x','y'].every(function (k) {return !owns(value,k)||typeof value[k]==='number'&&isFinite(value[k])&&Math.abs(value[k])<=10000;});}
function valid(value) {return setting(value)&&(!owns(value,'variants')||!!value.variants&&typeof value.variants==='object'&&!Array.isArray(value.variants)&&Object.keys(value.variants).every(function (k) {return /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(k)&&['constructor','prototype'].indexOf(k)<0&&setting(value.variants[k]);}));}
exports.variants=variants;exports.resolve=resolve;exports.valid=valid;exports.validVariants=validVariants;
