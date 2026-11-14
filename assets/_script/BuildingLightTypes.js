"use strict";
// All three textures retain the original atlas pixels. The extracted rays are padded
// to a square, so the same UV-space transform and brush tools fit every light.
// Archer: jt.png / jt_1_1 (659,151,68,116), padded 24px on either side.
// Circle: mf.png / td_4 (487,197,79,70), padded 4px above and 5px below.
var types=[
 {id:"full",label:"Full light (window)",sprite:"buildings/lighting/native-window-ray",core:[{x:-29,y:23},{x:-9,y:34},{x:-9,y:22},{x:-29,y:11}]},
 {id:"dim",label:"Dim light (Archer)",sprite:"buildings/lighting/native-archer-dim-ray",core:[{x:-20.5172413793,y:6.0344827586},{x:0,y:17.5},{x:0,y:13.8793103448},{x:-20.5172413793,y:2.4137931034}]},
 {id:"circle",label:"Circle light (mill)",sprite:"buildings/lighting/native-mill-circle-ray",core:[{x:-28,y:31},{x:-8,y:31},{x:-8,y:15},{x:-28,y:15}]}
];
function get(value){var id=typeof value==="string"?value:value&&value.type;return types.find(function(t){return t.id===id;})||types[0];}
function valid(value){return value===undefined||types.some(function(t){return t.id===value;});}
exports.list=types;exports.get=get;exports.valid=valid;
