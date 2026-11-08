'use strict';

// Display defaults are read-only. A field is authored only after an explicit edit.
const ATTACK_TYPES = [{value:'arrow',label:'Arrow — original projectile'},{value:'cannon',label:'Cannon — splash impact'},{value:'sniper',label:'Sniper — single target'}];
const TARGETING = [{value:'nearest',label:'Nearest enemy'},{value:'highestHp',label:'Highest current HP'},{value:'lowestHp',label:'Lowest current HP'},{value:'farthest',label:'Farthest enemy'}];
function towerFields(value) {
    const mode=value&&value.attackType||'arrow';
    return [
        {key:'attackType',label:'Tower attack type',value:mode,options:ATTACK_TYPES},
        {key:'targeting',label:'Tower targeting',value:mode==='sniper'?'highestHp':'nearest',options:TARGETING},
        {key:'projectileSpeed',label:'Projectile speed',value:mode==='sniper'?1000:mode==='cannon'?300:550,min:.001,help:'World units per second. Damage, firing rate and range are edited above.'},
        {key:'splashRadius',label:'Splash radius',value:mode==='cannon'?90:0,min:0,help:'Cannon impact radius in world units. Other attack types do not apply splash damage.'},
        {key:'splashFalloff',label:'Splash edge damage multiplier',value:1,min:0,max:1,help:'1 keeps full damage at the edge; 0 falls to zero at the edge.'},
        {key:'projectileLook',label:'Projectile appearance key',value:'',help:'Optional key in the projectiles appearance catalog. Empty uses this attack type’s default.'}
    ].map(field=>Object.assign({},field,{value:value&&Object.prototype.hasOwnProperty.call(value,field.key)?value[field.key]:field.value}));
}
const APPEARANCE_FIELDS=[
    {key:'width',label:'Artwork width',value:160,min:.001},
    {key:'height',label:'Artwork height',value:200,min:.001},
    {key:'offsetX',label:'Artwork offset X',value:0},
    {key:'offsetY',label:'Artwork offset Y',value:0},
    {key:'muzzleX',label:'Muzzle offset X',value:0},
    {key:'muzzleY',label:'Muzzle offset Y',value:100}
];
const WEAPON_FIELDS=[
    {key:'width',label:'Weapon width',value:120,min:.001},
    {key:'height',label:'Weapon height',value:80,min:.001},
    {key:'pivotX',label:'Weapon pivot X',value:.5,min:0,max:1,help:'Normalized anchor from the image’s left edge: 0 left, 0.5 center, 1 right.'},
    {key:'pivotY',label:'Weapon pivot Y',value:.5,min:0,max:1,help:'Normalized anchor from the image’s bottom edge: 0 bottom, 0.5 center, 1 top.'},
    {key:'offsetX',label:'Weapon pivot position X',value:0},
    {key:'offsetY',label:'Weapon pivot position Y',value:150},
    {key:'muzzleX',label:'Weapon muzzle offset X',value:90},
    {key:'muzzleY',label:'Weapon muzzle offset Y',value:0}
];
module.exports={ATTACK_TYPES,TARGETING,towerFields,APPEARANCE_FIELDS,WEAPON_FIELDS};
