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
function characterParts(parts){return libraryParts(parts).filter(part=>!/^monster\d+$/.test(part.sourcePack||'')&&!/^Monster Pack \d+\//.test(part.category||''));}
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
module.exports={skinTones,libraryParts,characterParts,partCategory,characterSources};
