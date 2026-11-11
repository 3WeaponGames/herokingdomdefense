'use strict';
// Lossless PNG pixel copying for native Spine atlases. Uses Creator's bundled
// Node/zlib only, so saving a character does not need Python or Unity installed.
const zlib=require('zlib');
const table=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let value=0xffffffff;for(const byte of bytes)value=table[(value^byte)&255]^(value>>>8);return(value^0xffffffff)>>>0;}
function decode(bytes){
  if(bytes.toString('hex',0,8)!=='89504e470d0a1a0a')throw Error('Expected a PNG texture');
  let width,height,depth,type,interlace,palette,alpha;const chunks=[];
  for(let at=8;at+12<=bytes.length;){const length=bytes.readUInt32BE(at),name=bytes.toString('ascii',at+4,at+8),data=bytes.subarray(at+8,at+8+length);if(at+12+length>bytes.length)throw Error('Truncated PNG');
    if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];interlace=data[12];}
    if(name==='PLTE')palette=data;if(name==='tRNS')alpha=data;if(name==='IDAT')chunks.push(data);at+=length+12;
  }
  if(depth!==8||interlace||!width||!height||width*height>64*1024*1024)throw Error('Use a non-interlaced 8-bit PNG');
  const channels={0:1,2:3,3:1,4:2,6:4}[type];if(!channels)throw Error('Unsupported PNG color format');
  const stride=width*channels,raw=zlib.inflateSync(Buffer.concat(chunks)),rows=Buffer.alloc(stride*height);
  if(raw.length!==(stride+1)*height)throw Error('Invalid PNG scanlines');
  for(let y=0;y<height;y++){const filter=raw[y*(stride+1)];if(filter>4)throw Error('Invalid PNG filter');for(let x=0;x<stride;x++){
    const left=x>=channels?rows[y*stride+x-channels]:0,up=y?rows[(y-1)*stride+x]:0,corner=y&&x>=channels?rows[(y-1)*stride+x-channels]:0;
    let predictor=0;if(filter===1)predictor=left;else if(filter===2)predictor=up;else if(filter===3)predictor=(left+up)>>1;else if(filter===4){const p=left+up-corner,a=Math.abs(p-left),b=Math.abs(p-up),c=Math.abs(p-corner);predictor=a<=b&&a<=c?left:b<=c?up:corner;}
    rows[y*stride+x]=(raw[y*(stride+1)+x+1]+predictor)&255;
  }}
  const rgba=Buffer.alloc(width*height*4);for(let i=0;i<width*height;i++){
    const at=i*channels,to=i*4;
    if(type===6)rows.copy(rgba,to,at,at+4);
    else if(type===2){rows.copy(rgba,to,at,at+3);rgba[to+3]=255;}
    else if(type===3){const index=rows[at];if(!palette||index*3+2>=palette.length)throw Error('Invalid PNG palette');palette.copy(rgba,to,index*3,index*3+3);rgba[to+3]=alpha&&index<alpha.length?alpha[index]:255;}
    else{rgba[to]=rgba[to+1]=rgba[to+2]=rows[at];rgba[to+3]=type===4?rows[at+1]:255;}
  }
  return{width,height,rgba};
}
function chunk(name,data){const head=Buffer.alloc(8),tail=Buffer.alloc(4);head.writeUInt32BE(data.length);head.write(name,4);tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4),data])));return Buffer.concat([head,data,tail]);}
function encode(image){const header=Buffer.alloc(13);header.writeUInt32BE(image.width);header.writeUInt32BE(image.height,4);header[8]=8;header[9]=6;const rows=Buffer.alloc((image.width*4+1)*image.height);for(let y=0;y<image.height;y++)image.rgba.copy(rows,y*(image.width*4+1)+1,y*image.width*4,(y+1)*image.width*4);return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(rows,{level:6})),chunk('IEND',Buffer.alloc(0))]);}
function crop(image,x,y,width,height,rotate){
  const result={width:rotate?height:width,height:rotate?width:height,rgba:Buffer.alloc(width*height*4)};
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    // Spine's rotated UVs map logical (u,v) to atlas (v,1-u).
    // Undo that rotation before packing the region without rotation.
    const from=((y+row)*image.width+x+col)*4,to=rotate?(col*height+height-row-1)*4:(row*width+col)*4;
    image.rgba.copy(result.rgba,to,from,from+4);
  }return result;
}
function pack(images,maximum){
  // Character imports use packPages. The explicit 4096 allowance preserves the
  // existing single-page wall exporter until its separate atlas migration.
  maximum=maximum===undefined?2048:maximum;
  if(maximum!==2048&&maximum!==4096)throw Error('Unsupported atlas limit');
  const entries=Object.entries(images).sort((a,b)=>b[1].height-a[1].height||a[0].localeCompare(b[0])),positions={};let x=2,y=2,row=0,right=0;
  for(const [name,image]of entries){if(image.width+4>maximum||image.height+4>maximum)throw Error('Character texture is too large');if(x+image.width+2>maximum){x=2;y+=row+4;row=0;}if(y+image.height+2>maximum)throw Error('Character atlas exceeds '+maximum+' pixels');positions[name]={x,y,width:image.width,height:image.height};x+=image.width+4;row=Math.max(row,image.height);right=Math.max(right,x);}
  const power=n=>Math.pow(2,Math.ceil(Math.log2(Math.max(2,n)))),width=Math.min(maximum,power(right)),height=power(y+row+2),rgba=Buffer.alloc(width*height*4);
  for(const [name,image]of entries){const p=positions[name];for(let dy=-2;dy<image.height+2;dy++)for(let dx=-2;dx<image.width+2;dx++){const sx=Math.max(0,Math.min(image.width-1,dx)),sy=Math.max(0,Math.min(image.height-1,dy)),from=(sy*image.width+sx)*4,to=((p.y+dy)*width+p.x+dx)*4;image.rgba.copy(rgba,to,from,from+4);}}
  return{width,height,rgba,positions};
}
function packPages(images){
  const maximum=2048,entries=Object.entries(images).sort((a,b)=>b[1].height-a[1].height||a[0].localeCompare(b[0])),layouts=[{positions:{},right:2,bottom:4}];
  let layout=layouts[0],x=2,y=2,row=0;
  for(const [name,image]of entries){
    if(!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1||!Buffer.isBuffer(image.rgba)||image.rgba.length!==image.width*image.height*4)throw Error('Invalid character texture: '+name);
    if(image.width+4>maximum||image.height+4>maximum)throw Error('Character texture exceeds 2048 pixels including its sampling border: '+name);
    if(x+image.width+2>maximum){x=2;y+=row+4;row=0;}
    if(y+image.height+2>maximum){layout={positions:{},right:2,bottom:4};layouts.push(layout);x=y=2;row=0;}
    layout.positions[name]={x,y,width:image.width,height:image.height};
    layout.right=Math.max(layout.right,x+image.width+2);layout.bottom=Math.max(layout.bottom,y+image.height+2);
    x+=image.width+4;row=Math.max(row,image.height);
  }
  const power=n=>Math.pow(2,Math.ceil(Math.log2(Math.max(2,n))));
  return layouts.map(layout=>{
    const width=power(layout.right),height=power(layout.bottom),rgba=Buffer.alloc(width*height*4);
    for(const [name,p]of Object.entries(layout.positions)){
      const image=images[name],stride=image.width*4;
      // Copy complete source rows and their clamped two-pixel extrusion. This
      // retains even transparent RGB values without resampling any artwork.
      for(let dy=-2;dy<image.height+2;dy++){
        const sy=Math.max(0,Math.min(image.height-1,dy)),from=sy*stride,to=((p.y+dy)*width+p.x)*4;
        image.rgba.copy(rgba,to,from,from+stride);
        for(let border=1;border<=2;border++){
          image.rgba.copy(rgba,to-border*4,from,from+4);
          image.rgba.copy(rgba,to+stride+(border-1)*4,from+stride-4,from+stride);
        }
      }
    }
    return{width,height,rgba,positions:layout.positions};
  });
}
module.exports={decode,encode,crop,pack,packPages};
