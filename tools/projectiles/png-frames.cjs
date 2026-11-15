'use strict';
// Inspect imported atlas alpha without modifying the PNG or requiring an image
// package. Blank capture cells must not make a looping projectile disappear.
const fs=require('node:fs'),zlib=require('node:zlib');
function inspectFrames(file,descriptor){
  const invalid=message=>Error(message+' '+file);
  if(!descriptor||!['frames','columns','cell'].every(key=>Number.isSafeInteger(descriptor[key])&&descriptor[key]>0))throw invalid('Invalid projectile atlas grid');
  const png=fs.readFileSync(file),signature=Buffer.from([137,80,78,71,13,10,26,10]);
  if(png.length<8||!png.subarray(0,8).equals(signature))throw invalid('Invalid projectile PNG');
  let width,height,depth,type,interlace,paletteAlpha,ended=false,idat=[];
  for(let offset=8;offset<png.length;){
    if(offset+12>png.length)throw invalid('Truncated projectile PNG chunk');
    const length=png.readUInt32BE(offset),name=png.toString('ascii',offset+4,offset+8);
    if(length>png.length-offset-12)throw invalid('Truncated projectile PNG chunk');
    const data=png.subarray(offset+8,offset+8+length);offset+=length+12;
    if(name==='IHDR'){
      if(width!==undefined||length!==13)throw invalid('Invalid projectile PNG header');
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];interlace=data[12];
      if(!width||!height||data[10]||data[11])throw invalid('Invalid projectile PNG header');
    }
    if(name==='IDAT')idat.push(data);if(name==='tRNS')paletteAlpha=data;
    if(name==='IEND'){if(length)throw invalid('Invalid projectile PNG end');ended=true;break;}
  }
  const channels={0:1,2:3,3:1,4:2,6:4}[type];
  if(!ended||!idat.length)throw invalid('Incomplete projectile PNG');
  if(depth!==8||interlace||!channels)throw invalid('Unsupported projectile atlas encoding');
  if(descriptor.columns*descriptor.cell>width||Math.ceil(descriptor.frames/descriptor.columns)*descriptor.cell>height)throw invalid('Projectile atlas grid exceeds image');
  if(paletteAlpha&&((type===0&&paletteAlpha.length!==2)||(type===2&&paletteAlpha.length!==6)))throw invalid('Invalid projectile PNG transparency');
  const stride=width*channels,decodedLength=height*(stride+1);
  if(!Number.isSafeInteger(decodedLength)||decodedLength>0x7fffffff)throw invalid('Projectile atlas is too large');
  const raw=zlib.inflateSync(Buffer.concat(idat),{maxOutputLength:decodedLength});
  if(raw.length!==decodedLength)throw invalid('Truncated projectile PNG pixels');
  const pixels=Buffer.alloc(height*stride);let offset=0;
  function paeth(a,b,c){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
  for(let y=0;y<height;y++){const filter=raw[offset++];if(filter>4)throw invalid('Invalid projectile PNG filter');
    for(let x=0;x<stride;x++){const at=y*stride+x,left=x>=channels?pixels[at-channels]:0,up=y?pixels[at-stride]:0,corner=y&&x>=channels?pixels[at-stride-channels]:0,predictor=[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter];pixels[at]=(raw[offset++]+predictor)&255;}
  }
  const transparentGray=type===0&&paletteAlpha?paletteAlpha.readUInt16BE(0):-1,transparentRgb=type===2&&paletteAlpha?[0,2,4].map(at=>paletteAlpha.readUInt16BE(at)):null;
  const frames=[];
  for(let frame=0;frame<descriptor.frames;frame++){
    const cell=descriptor.cell,originX=frame%descriptor.columns*cell,originY=Math.floor(frame/descriptor.columns)*cell,xMass=Array(cell).fill(0),yMass=Array(cell).fill(0);let mass=0,minX=cell,minY=cell,maxX=0,maxY=0;
    for(let y=originY;y<originY+cell;y++)for(let x=originX;x<originX+cell;x++){
      const at=y*stride+x*channels,alpha=type===6?pixels[at+3]:type===4?pixels[at+1]:type===3&&paletteAlpha?(paletteAlpha[pixels[at]]===undefined?255:paletteAlpha[pixels[at]]):type===0&&pixels[at]===transparentGray?0:transparentRgb&&transparentRgb.every((channel,index)=>channel===pixels[at+index])?0:255;
      if(alpha){const px=x-originX,py=y-originY;xMass[px]+=alpha;yMass[py]+=alpha;mass+=alpha;minX=Math.min(minX,px);minY=Math.min(minY,py);maxX=Math.max(maxX,px+1);maxY=Math.max(maxY,py+1);}
    }
    if(!mass){frames.push(null);continue;}
    function quantile(values,fraction){let cumulative=0;for(let index=0;index<values.length;index++){cumulative+=values[index];if(cumulative>=mass*fraction)return index;}return values.length-1;}
    const centerX=xMass.reduce((sum,value,index)=>sum+(index+.5)*value,0)/mass,centerY=yMass.reduce((sum,value,index)=>sum+(index+.5)*value,0)/mass;
    frames.push({frame,bounds:{minX,minY,maxX,maxY},center:{x:centerX,y:centerY},energyExtent:Math.max(quantile(xMass,.9)-quantile(xMass,.1)+1,quantile(yMass,.9)-quantile(yMass,.1)+1),mass});
  }
  const visible=frames.filter(Boolean),median=values=>{const sorted=values.slice().sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
  return {frames,visibleFrames:visible.map(frame=>frame.frame),medianEnergyExtent:visible.length?median(visible.map(frame=>frame.energyExtent)):0,medianCenter:visible.length?{x:median(visible.map(frame=>frame.center.x)),y:median(visible.map(frame=>frame.center.y))}:{x:descriptor.cell/2,y:descriptor.cell/2}};
}
function visibleFrames(file,descriptor){return inspectFrames(file,descriptor).visibleFrames;}
module.exports={visibleFrames,inspectFrames};
