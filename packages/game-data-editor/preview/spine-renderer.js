'use strict';
// Render-only adapter for the Spine runtime shipped with Creator. It never
// instantiates a gameplay prefab, starts a director, dispatches events, or audio.
function loadImage(source) {
    return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error('Cannot load preview texture: ' + source)); image.src = source; });
}
async function createLayers(spine, descriptions) {
    return Promise.all(descriptions.map(async description => {
        const images = {};
        await Promise.all(Object.keys(description.pages).map(async name => { images[name] = await loadImage(description.pages[name]); }));
        const atlas = new spine.TextureAtlas(description.atlas, name => new spine.FakeTexture(images[name]));
        const reader = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas));
        const data = reader.readSkeletonData(description.json), skeleton = new spine.Skeleton(data);
        if (description.skin && data.findSkin(description.skin)) skeleton.setSkinByName(description.skin);
        skeleton.setToSetupPose(); skeleton.updateWorldTransform();
        const restBones={};skeleton.bones.forEach(b=>{restBones[b.data.name]={a:b.a,b:b.b,c:b.c,d:b.d,x:b.worldX,y:b.worldY};});
        return { description, data, skeleton, atlas, restBones };
    }));
}
function seek(spine, layers, animation, time, loop) {
    layers.forEach(layer => {
        const skeleton = layer.skeleton;
        skeleton.setToSetupPose();
        // In the game the horse keeps its idle pose while the hero fires.
        const name = layer.description.name === 'wqyl_lead_ma' && animation === 'attack' ? 'idle' : animation;
        const clip = layer.data.findAnimation(name) || layer.data.findAnimation('idle');
        if (clip) clip.apply(skeleton, 0, Math.max(0, time), !!loop, null, 1, spine.MixBlend.replace, spine.MixDirection.mixIn);
        skeleton.updateWorldTransform();
    });
    layers.forEach(layer=>{
        const follow=layer.description.followMount;if(!follow)return;
        const mount=layers.find(l=>l.description.uuid===follow.layer),bone=mount&&mount.skeleton.findBone(follow.bone),rest=mount&&mount.restBones[follow.bone];if(!bone||!rest)return;
        const md=mount.description,angle=(md.rotation||0)*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle),sx=md.scaleX,sy=md.scaleY;
        const world=b=>({a:cos*sx*b.a-sin*sy*b.c,b:cos*sx*b.b-sin*sy*b.d,c:sin*sx*b.a+cos*sy*b.c,d:sin*sx*b.b+cos*sy*b.d,x:cos*sx*b.x-sin*sy*b.y+md.x,y:sin*sx*b.x+cos*sy*b.y+md.y});
        const p=world(rest),q=world({a:bone.a,b:bone.b,c:bone.c,d:bone.d,x:bone.worldX,y:bone.worldY}),det=p.a*p.d-p.b*p.c;
        const a=(q.a*p.d-q.b*p.c)/det,b=(-q.a*p.b+q.b*p.a)/det,c=(q.c*p.d-q.d*p.c)/det,d=(-q.c*p.b+q.d*p.a)/det;
        layer.description._mountMotion={a,b,c,d,x:q.x-a*p.x-b*p.y,y:q.y-c*p.x-d*p.y};
    });
}
function geometry(spine, layer) {
    const result = [], clipper = new spine.SkeletonClipping();
    layer.skeleton.drawOrder.forEach(slot => {
        const attachment = slot.getAttachment();
        if (!attachment || !slot.bone.active) { clipper.clipEndWithSlot(slot); return; }
        if (attachment instanceof spine.ClippingAttachment) { clipper.clipStart(slot, attachment); return; }
        let vertices, triangles;
        if (attachment instanceof spine.RegionAttachment) {
            vertices = new Float32Array(8); attachment.computeWorldVertices(slot.bone, vertices, 0, 2); triangles = [0,1,2,2,3,0];
        } else if (attachment instanceof spine.MeshAttachment) {
            vertices = new Float32Array(attachment.worldVerticesLength); attachment.computeWorldVertices(slot, 0, vertices.length, vertices, 0, 2); triangles = attachment.triangles;
        } else { clipper.clipEndWithSlot(slot); return; }
        let uvs = attachment.uvs;
        const color = { r: slot.color.r * attachment.color.r * layer.skeleton.color.r, g: slot.color.g * attachment.color.g * layer.skeleton.color.g, b: slot.color.b * attachment.color.b * layer.skeleton.color.b, a: slot.color.a * attachment.color.a * layer.skeleton.color.a };
        if (clipper.isClipping()) {
            clipper.clipTriangles(vertices, vertices.length, triangles, triangles.length, uvs, color, {r:0,g:0,b:0,a:0}, false, 2);
            const clipped = clipper.clippedVertices, outVertices = [], outUvs = [];
            for (let i = 0; i < clipped.length; i += 8) { outVertices.push(clipped[i], clipped[i+1]); outUvs.push(clipped[i+6], clipped[i+7]); }
            vertices = outVertices; uvs = outUvs; triangles = clipper.clippedTriangles.slice();
        }
        result.push({ vertices, uvs, triangles, image: attachment.region.texture.getImage(), color, blend: slot.data.blendMode });
        clipper.clipEndWithSlot(slot);
    });
    clipper.clipEnd(); return result;
}
function triangle(ctx, image, positions, texture) {
    const x0=positions[0],y0=positions[1],x1=positions[2],y1=positions[3],x2=positions[4],y2=positions[5];
    const u0=texture[0],v0=texture[1],u1=texture[2],v1=texture[3],u2=texture[4],v2=texture[5];
    const det=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1); if (Math.abs(det)<1e-8) return;
    const a=(x0*(v1-v2)+x1*(v2-v0)+x2*(v0-v1))/det, b=(y0*(v1-v2)+y1*(v2-v0)+y2*(v0-v1))/det;
    const c=(x0*(u2-u1)+x1*(u0-u2)+x2*(u1-u0))/det, d=(y0*(u2-u1)+y1*(u0-u2)+y2*(u1-u0))/det;
    const e=(x0*(u1*v2-u2*v1)+x1*(u2*v0-u0*v2)+x2*(u0*v1-u1*v0))/det;
    const f=(y0*(u1*v2-u2*v1)+y1*(u2*v0-u0*v2)+y2*(u0*v1-u1*v0))/det;
    // Adjacent Canvas clips otherwise leave hairline antialiasing seams along
    // mesh edges. Expand only the clip by a fraction of a display pixel; the
    // texture's affine mapping remains exact.
    const transform=ctx.getTransform(),padding=.35/Math.max(.001,Math.sqrt(transform.a*transform.a+transform.b*transform.b));
    const cx=(x0+x1+x2)/3,cy=(y0+y1+y2)/3;
    const edge=(x,y)=>{const length=Math.max(.001,Math.hypot(x-cx,y-cy));return[x+(x-cx)*padding/length,y+(y-cy)*padding/length];};
    const p0=edge(x0,y0),p1=edge(x1,y1),p2=edge(x2,y2);
    ctx.save();ctx.beginPath();ctx.moveTo(p0[0],p0[1]);ctx.lineTo(p1[0],p1[1]);ctx.lineTo(p2[0],p2[1]);ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,e,f);ctx.drawImage(image,0,0);ctx.restore();
}
function bounds(spine, layers) {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    layers.forEach(layer => geometry(spine,layer).forEach(g => {for(let i=0;i<g.vertices.length;i+=2){const p=transformPoint(layer.description,g.vertices[i],g.vertices[i+1]);minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}}));
    return isFinite(minX) ? {minX,minY,maxX,maxY,width:Math.max(1,maxX-minX),height:Math.max(1,maxY-minY)} : {minX:-50,minY:0,maxX:50,maxY:100,width:100,height:100};
}
function transformPoint(d,x,y) {
    x*=d.scaleX;y*=d.scaleY;
    const a=(d.rotation||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),px=x*c-y*s+d.x,py=x*s+y*c+d.y,m=d._mountMotion;
    return m?{x:m.a*px+m.b*py+m.x,y:m.c*px+m.d*py+m.y}:{x:px,y:py};
}
function inversePoint(d,x,y) {
    const m=d._mountMotion;if(m){const px=x-m.x,py=y-m.y,det=m.a*m.d-m.b*m.c;x=(m.d*px-m.b*py)/det;y=(-m.c*px+m.a*py)/det;}
    x-=d.x;y-=d.y;
    if(d.rotation){const a=-d.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a),px=x;x=px*c-y*s;y=px*s+y*c;}
    return{x:x/d.scaleX,y:y/d.scaleY};
}
const tintCache=new WeakMap();
function tintedImage(image,color) {
    const r=Math.round(color.r*255),g=Math.round(color.g*255),b=Math.round(color.b*255);
    if(r===255&&g===255&&b===255)return image;
    const key=r+','+g+','+b;let cache=tintCache.get(image);if(!cache){cache=new Map();tintCache.set(image,cache);}if(cache.has(key))return cache.get(key);
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);ctx.globalCompositeOperation='multiply';ctx.fillStyle='rgb('+key+')';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='destination-in';ctx.drawImage(image,0,0);
    if(cache.size>=24)cache.delete(cache.keys().next().value);cache.set(key,canvas);return canvas;
}
function draw(spine, ctx, layers, options) {
    const viewport=options.bounds || bounds(spine,layers), width=options.width, height=options.height;
    const scale=Math.min((width-32)/viewport.width,(height-24)/viewport.height)*(options.zoom||1), facing=options.facing||1;
    ctx.save();ctx.translate(width/2,height-12+viewport.minY*scale);ctx.scale(scale*facing,-scale);ctx.translate(-(viewport.minX+viewport.maxX)/2,0);
    layers.forEach(layer => {
        ctx.save();const m=layer.description._mountMotion;if(m)ctx.transform(m.a,m.c,m.b,m.d,m.x,m.y);ctx.translate(layer.description.x,layer.description.y);if(layer.description.rotation)ctx.rotate(layer.description.rotation*Math.PI/180);ctx.scale(layer.description.scaleX,layer.description.scaleY);
        geometry(spine,layer).forEach(g=>{
            ctx.globalAlpha=g.color.a*(layer.description.opacity===undefined?1:layer.description.opacity);
            ctx.globalCompositeOperation=['source-over','lighter','multiply','screen'][g.blend]||'source-over';
            const image=tintedImage(g.image,g.color);
            for(let i=0;i<g.triangles.length;i+=3){const positions=[],texture=[];for(let j=0;j<3;j++){const index=g.triangles[i+j]*2;positions.push(g.vertices[index],g.vertices[index+1]);texture.push(g.uvs[index]*g.image.width,g.uvs[index+1]*g.image.height);}triangle(ctx,image,positions,texture);}
        });
        ctx.restore();
    });
    ctx.restore();
}
const canvasStates=new WeakMap();
function shader(gl,type,source){const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(value));return value;}
function canvasState(canvas){
    if(canvasStates.has(canvas))return canvasStates.get(canvas);
    const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true});
    if(!gl){const fallback={ctx:canvas.getContext('2d')};canvasStates.set(canvas,fallback);return fallback;}
    const program=gl.createProgram(),vertex=shader(gl,gl.VERTEX_SHADER,'attribute vec2 a_position;attribute vec2 a_uv;varying vec2 v_uv;void main(){gl_Position=vec4(a_position,0.0,1.0);v_uv=a_uv;}'),fragment=shader(gl,gl.FRAGMENT_SHADER,'precision mediump float;uniform sampler2D u_texture;uniform vec4 u_color;varying vec2 v_uv;void main(){gl_FragColor=texture2D(u_texture,v_uv)*u_color;}');
    gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
    const state={gl,program,vertex,fragment,vertices:gl.createBuffer(),indices:gl.createBuffer(),position:gl.getAttribLocation(program,'a_position'),uv:gl.getAttribLocation(program,'a_uv'),color:gl.getUniformLocation(program,'u_color'),textures:new Map()};canvasStates.set(canvas,state);return state;
}
function drawCanvas(spine,canvas,layers,options){
    const state=canvasState(canvas);if(!state.gl){state.ctx.clearRect(0,0,canvas.width,canvas.height);draw(spine,state.ctx,layers,options);return;}
    const gl=state.gl,w=options.width,h=options.height,box=options.bounds||bounds(spine,layers),scale=Math.min((w-32)/box.width,(h-24)/box.height)*(options.zoom||1),facing=options.facing||1,cx=(box.minX+box.maxX)/2;
    gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(state.program);gl.enable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.activeTexture(gl.TEXTURE0);
    gl.bindBuffer(gl.ARRAY_BUFFER,state.vertices);gl.enableVertexAttribArray(state.position);gl.enableVertexAttribArray(state.uv);gl.vertexAttribPointer(state.position,2,gl.FLOAT,false,16,0);gl.vertexAttribPointer(state.uv,2,gl.FLOAT,false,16,8);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,state.indices);
    layers.forEach(layer=>geometry(spine,layer).forEach(g=>{
        if(!g.triangles.length)return;
        let texture=state.textures.get(g.image);if(!texture){texture=gl.createTexture();state.textures.set(g.image,texture);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,g.image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}else gl.bindTexture(gl.TEXTURE_2D,texture);
        const vertices=new Float32Array(g.vertices.length*2),d=layer.description;
        for(let i=0,j=0;i<g.vertices.length;i+=2,j+=4){const point=transformPoint(d,g.vertices[i],g.vertices[i+1]),x=(point.x-cx)*scale*facing+w/2,y=h-12+box.minY*scale-point.y*scale;vertices[j]=x/w*2-1;vertices[j+1]=1-y/h*2;vertices[j+2]=g.uvs[i];vertices[j+3]=g.uvs[i+1];}
        gl.bufferData(gl.ARRAY_BUFFER,vertices,gl.STREAM_DRAW);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(g.triangles),gl.STREAM_DRAW);gl.uniform4f(state.color,g.color.r,g.color.g,g.color.b,g.color.a*(d.opacity===undefined?1:d.opacity));
        if(g.blend===1)gl.blendFunc(gl.SRC_ALPHA,gl.ONE);else if(g.blend===2)gl.blendFunc(gl.DST_COLOR,gl.ONE_MINUS_SRC_ALPHA);else if(g.blend===3)gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_COLOR);else gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
        gl.drawElements(gl.TRIANGLES,g.triangles.length,gl.UNSIGNED_SHORT,0);
    }));
}
function destroyCanvas(canvas){const state=canvasStates.get(canvas);if(state&&state.gl){const gl=state.gl;state.textures.forEach(texture=>gl.deleteTexture(texture));gl.deleteBuffer(state.vertices);gl.deleteBuffer(state.indices);gl.deleteShader(state.vertex);gl.deleteShader(state.fragment);gl.deleteProgram(state.program);const extension=gl.getExtension('WEBGL_lose_context');if(extension)extension.loseContext();}canvasStates.delete(canvas);}
module.exports={createLayers,seek,geometry,bounds,draw,drawCanvas,destroyCanvas,transformPoint,inversePoint};
