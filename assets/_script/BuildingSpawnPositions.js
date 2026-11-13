"use strict";
function point(p){return !!p&&typeof p==="object"&&["x","y"].every(function(k){return typeof p[k]==="number"&&isFinite(p[k])&&Math.abs(p[k])<=10000;});}
function get(row,index){var p=row&&row.SpawnPositions&&row.SpawnPositions[String(index+1)];return point(p)?p:null;}
function valid(value){return !!value&&typeof value==="object"&&!Array.isArray(value)&&Object.keys(value).every(function(k){return !/^\d+$/.test(k)||Number(k)>0&&Number(k)<=128&&point(value[k]);});}
exports.point=point;exports.get=get;exports.valid=valid;
