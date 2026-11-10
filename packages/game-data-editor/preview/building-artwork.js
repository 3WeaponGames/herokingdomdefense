'use strict';
const WeaponPose=require('../../../assets/_script/BuildingWeaponPose');

// Read-only composition. Coordinates match Cocos' bottom-left sprite anchors;
// aiming this preview never writes a draft or starts a gameplay scene.
function finite(value,fallback){return typeof value==='number'&&Number.isFinite(value)?value:fallback;}
function positive(value,fallback){return typeof value==='number'&&Number.isFinite(value)&&value>0?value:fallback;}
function rotate(point,angle){const radians=angle*Math.PI/180,c=Math.cos(radians),s=Math.sin(radians);return{x:point.x*c-point.y*s,y:point.x*s+point.y*c};}
function geometry(appearance,targetAngle){
    const value=appearance||{},base={width:positive(value.width,160),height:positive(value.height,200),x:finite(value.offsetX,0),y:finite(value.offsetY,0)};
    const corners=[{x:base.x-base.width/2,y:base.y},{x:base.x+base.width/2,y:base.y+base.height}];
    let weapon=null;
    if(value.weapon&&typeof value.weapon==='object'&&!Array.isArray(value.weapon)){
        const raw=value.weapon,pose=WeaponPose.pose(raw,targetAngle),{width,height,pivotX,pivotY,x,y,muzzleX,muzzleY,reference,flipX,angle}=pose;
        const muzzle=rotate({x:flipX*muzzleX,y:muzzleY},angle);muzzle.x+=x;muzzle.y+=y;
        for(const px of [-pivotX*width,(1-pivotX)*width])for(const py of [-pivotY*height,(1-pivotY)*height]){const p=rotate({x:px*flipX,y:py},angle);corners.push({x:p.x+x,y:p.y+y});}
        corners.push({x,y},muzzle);weapon={width,height,pivotX,pivotY,x,y,angle,flipX,muzzle,reference,muzzleRadius:Math.hypot(muzzleX,muzzleY),view:pose.view,sprite:pose.sprite};
    }
    const minX=Math.min(...corners.map(p=>p.x)),minY=Math.min(...corners.map(p=>p.y)),maxX=Math.max(...corners.map(p=>p.x)),maxY=Math.max(...corners.map(p=>p.y));
    let frameBounds={minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY};
    if(weapon){
        const w=weapon,views=WeaponPose.views(value.weapon),radius=Math.max(...Object.keys(views).map(name=>{
            const angle=name==='north'?90:name==='south'?-90:name==='southeast'?-45:name==='northeast'?45:value.weapon.views&&value.weapon.views.northeast?0:null,p=WeaponPose.pose(value.weapon,angle);
            return Math.max(Math.hypot(p.pivotX*p.width,p.pivotY*p.height),Math.hypot((1-p.pivotX)*p.width,p.pivotY*p.height),Math.hypot(p.pivotX*p.width,(1-p.pivotY)*p.height),Math.hypot((1-p.pivotX)*p.width,(1-p.pivotY)*p.height),Math.hypot(p.muzzleX,p.muzzleY));
        }));
        const left=Math.min(base.x-base.width/2,w.x-radius),bottom=Math.min(base.y,w.y-radius),right=Math.max(base.x+base.width/2,w.x+radius),top=Math.max(base.y+base.height,w.y+radius);
        frameBounds={minX:left,minY:bottom,maxX:right,maxY:top,width:right-left,height:top-bottom};
    }
    return{base,weapon,bounds:{minX,minY,maxX,maxY,width:maxX-minX,height:maxY-minY},frameBounds};
}
function mount(container){
    function el(tag,parent){const node=document.createElement(tag);if(parent)parent.appendChild(node);return node;}
    const root=el('div',container);root.className='hkd-building-artwork';root.hidden=true;
    const stage=el('div',root);stage.style.cssText='position:relative;height:270px;overflow:hidden';
    const base=el('img',stage),weapon=el('img',stage),line=el('div',stage),pivot=el('div',stage),muzzle=el('div',stage);
    base.alt='Fixed building base';weapon.alt='Aiming weapon';
    const controls=el('div',root),label=el('label',controls);label.textContent='Preview aim (degrees)';
    const aim=el('input',label);aim.type='range';aim.min=-180;aim.max=180;aim.step=1;
    const caption=el('p',controls);caption.className='preview-help';caption.textContent='Gold: pivot · blue: muzzle. Aim is preview-only.';
    const reset=el('button',controls);reset.type='button';reset.textContent='Reset reference pose';
    let description=null,targetAngle=null,last=null;
    function render(){
        if(!description)return;
        if(!description.appearance){base.src=description.image||'';base.hidden=!description.image;base.style.cssText='display:block;width:100%;height:250px;object-fit:contain';stage.style.width='100%';weapon.hidden=line.hidden=pivot.hidden=muzzle.hidden=controls.hidden=true;last=null;return;}
        const data=geometry(description.appearance,targetAngle);last=data;
        const viewport=Math.max(220,Math.min(320,(container.clientWidth||320)-8));
        const b=data.frameBounds,scale=Math.min(1.1,240/Math.max(1,b.height),(viewport-24)/Math.max(1,b.width)),left=(viewport-b.width*scale)/2,top=(270-b.height*scale)/2;
        stage.style.width=viewport+'px';stage.style.maxWidth='100%';stage.style.margin='0 auto';
        const x=world=>left+(world-b.minX)*scale,y=world=>top+(b.maxY-world)*scale;
        base.src=description.image||'';base.hidden=!description.image;
        base.style.cssText='position:absolute;object-fit:fill;left:'+x(data.base.x-data.base.width/2)+'px;top:'+y(data.base.y+data.base.height)+'px;width:'+data.base.width*scale+'px;height:'+data.base.height*scale+'px';
        const w=data.weapon,image=w&&w.view!=='side'?description.weaponImages&&description.weaponImages[w.view]:description.weaponImage;
        controls.hidden=!w;weapon.hidden=!w||!image;line.hidden=pivot.hidden=muzzle.hidden=!w;
        if(w){
            weapon.src=image||'';
            weapon.style.cssText='position:absolute;object-fit:fill;left:'+x(w.x-w.pivotX*w.width)+'px;top:'+y(w.y+(1-w.pivotY)*w.height)+'px;width:'+w.width*scale+'px;height:'+w.height*scale+'px;transform-origin:'+(w.pivotX*100)+'% '+((1-w.pivotY)*100)+'%;transform:rotate('+(-w.angle)+'deg) scaleX('+w.flipX+')';
            const px=x(w.x),py=y(w.y),mx=x(w.muzzle.x),my=y(w.muzzle.y),dx=mx-px,dy=my-py;
            line.style.cssText='position:absolute;pointer-events:none;height:1px;background:#5fdcf0;opacity:.65;left:'+px+'px;top:'+py+'px;width:'+Math.hypot(dx,dy)+'px;transform-origin:0 50%;transform:rotate('+Math.atan2(dy,dx)*180/Math.PI+'deg)';
            pivot.style.cssText='position:absolute;pointer-events:none;width:8px;height:8px;border:2px solid #ffd166;border-radius:50%;left:'+(px-4)+'px;top:'+(py-4)+'px';
            muzzle.style.cssText='position:absolute;pointer-events:none;width:8px;height:8px;border:2px solid #5fdcf0;border-radius:50%;left:'+(mx-4)+'px;top:'+(my-4)+'px';
            aim.value=targetAngle===null?Math.round(w.reference):targetAngle;
            caption.textContent='Gold: pivot · blue: muzzle · '+Math.round(Number(aim.value))+'°. Aim is preview-only.';
        }
    }
    aim.oninput=()=>{targetAngle=Number(aim.value);render();};reset.onclick=()=>{targetAngle=null;render();};
    return{set(data){description=data;targetAngle=null;root.hidden=false;render();},hide(){root.hidden=true;},destroy(){root.remove();},getState(){return{targetAngle,geometry:last};}};
}
module.exports={geometry,mount};
