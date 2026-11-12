'use strict';
const skinTones=[
  {value:'#ffbdab',label:'Default'},
  {value:'#f6debd',label:'Light'},
  {value:'#f3c89f',label:'Warm'},
  {value:'#cc9a70',label:'Tan'},
  {value:'#a87650',label:'Brown'},
  {value:'#704a34',label:'Deep'},
  {value:'#ffffff',label:'Original white'}
];
function libraryParts(parts){return parts.filter(part=>!(part.sourcePack==='character-maker'&&/\/Common\/Sprites\/Other\//.test(part.image||'')));}
function characterParts(parts){return libraryParts(parts).filter(part=>!part.sourcePack||['character-maker','original-mounts'].includes(part.sourcePack));}
// Library groups describe equipment, not its source pack. Keep the asset's
// original category intact for fitting, saved references and future imports.
function partCategory(part){
  let category=part.category||'';
  if(category.startsWith('Character Maker/')){
    category=category.slice('Character Maker/'.length);
    if(category.startsWith('assets/')){
      const match=/\/Common\/Sprites\/([^/]+)(?:\/|$)/.exec(part.image||'');
      category=match?match[1]:'Other';
    }
    category=category.replace(/\/\.$/,'');
  }
  category=category.replace(/^Hand(?:Left|Right)\//,'');
  return category==='Sub_Item'?'Sub Items':category;
}
function characterSources(sources,current){return sources.filter(source=>source.pack==='character-maker'||source.id===current);}
function layerLabel(layer){return {wqyl_lead_ma:'Mount',wqyl_lead_shenti:'Body',wqyl_lead_doupeng:'Chest',wqyl_lead_tou:'Head',wqyl_lead_gong:'Main weapon',wqyl_lead_jian:'Sub-weapon / bonus',wqyl_lead_shou:'Cape'}[layer.name]||layer.name;}
function skinValue(layer,value){return /^(?:(?:lv|vip)\d+|lv_blue)$/.test(value)&&(layer.skins||[]).includes('skirmisher_'+value)?'skirmisher_'+value:value;}
function skinLabel(value,layer){
  const tiers=layer&&layer.json&&layer.json._equipmentTiers,match=/^(?:(skirmisher|fighter|vanguard|mystic|bruiser|guardian)_)?(lv_blue|lv\d+)$/.exec(value);
  if(tiers&&match&&tiers[match[2]])return (match[1]?match[1][0].toUpperCase()+match[1].slice(1)+' ':'Tier ')+tiers[match[2]];
  const style=/^(skirmisher|fighter|vanguard|mystic|bruiser|guardian)_(lv|vip)(\d+)$/.exec(value);
  if(style)return style[1][0].toUpperCase()+style[1].slice(1)+(style[2]==='vip'?' VIP':'')+' '+style[3];
  const tier=/^(lv|vip)(\d+)$/.exec(value);return tier?(tier[1]==='vip'?'VIP ':'Level ')+tier[2]:value==='default'?'Default':value;
}
function skinOptions(layer){return (layer.skins||[]).filter(value=>skinValue(layer,value)===value).map(value=>({value,label:skinLabel(value,layer)}));}
module.exports={skinTones,libraryParts,characterParts,partCategory,characterSources,layerLabel,skinValue,skinOptions};
