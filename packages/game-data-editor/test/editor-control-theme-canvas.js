'use strict';
// Computed colours in real shadow roots, including disabled native controls.
const fs=require('fs'),path=require('path'),Theme=require('../panel/control-theme');
function contrast(control){const s=getComputedStyle(control),rgb=v=>(v.match(/[\d.]+/g)||[]).slice(0,3).map(Number),luma=v=>rgb(v).map(n=>{n/=255;return n<=.04045?n/12.92:Math.pow((n+.055)/1.055,2.4);}).reduce((v,n,i)=>v+n*[.2126,.7152,.0722][i],0),a=luma(s.color),b=luma(s.backgroundColor);return{ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),foreground:s.color,background:s.backgroundColor,opacity:s.opacity};}
function check(control,label){const c=contrast(control);if(c.ratio<4.5||c.opacity!=='1')throw Error(label+' has unreadable control colours: '+JSON.stringify(c));return label;}
async function verify(){
 const root=path.resolve(__dirname,'../../..'),profiles=[
  ['Buildings','game-tools','packages/game-data-editor/panel/panel.css','packages/game-data-editor/buildings/style.css'],
  ['Maps & Stages','world-tool world-stages','packages/game-data-editor/worlds/style.css'],
  ['Map inspector','hkd-map','packages/game-data-editor/maps/style.css'],
  ['Walls','wall-adjustments','packages/game-data-editor/walls/style.css'],
  ['Testing','hkd-testing','packages/game-data-editor/testing/style.css'],
  ['Characters & Items','character-editor','packages/hkd-characters/style.css'],
  ['Sounds','sound-tool','packages/hkd-sounds/style.css'],
  ['Skills','skills-editor','packages/hkd-skills/style.css'],
  ['Projectiles','projectile-tool','packages/hkd-projectiles/style.css'],
  ['Localization','localization','packages/localization-editor/panel/panel.css']
 ],checks=[];
 for(const [title,classes,...files]of profiles){const host=document.createElement('div');document.body.appendChild(host);const shadow=host.attachShadow({mode:'open'}),style=document.createElement('style');style.textContent=Theme(files.map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n'));shadow.appendChild(style);const panel=document.createElement('div');panel.className=classes;shadow.appendChild(panel);
  for(const markup of ['<select><option>Ground projection</option><option>Window light</option></select>','<select disabled><option>No lights — use Add Light</option></select>','<input type="text" value="Window light">','<input type="number" value="100">','<input type="search" placeholder="Search">','<input type="number" disabled value="100">','<textarea>Light settings</textarea>','<textarea disabled>Read-only value</textarea>']){const wrap=document.createElement('label');wrap.className='gt-field';wrap.innerHTML=markup;panel.appendChild(wrap);const control=wrap.firstChild;checks.push(check(control,title+' '+control.tagName+(control.disabled?' disabled':'')));if(control.tagName==='SELECT')for(const option of control.options)checks.push(check(option,title+' popup option'));}
  host.remove();
 }
 return{checks};
}
module.exports={verify,check};
