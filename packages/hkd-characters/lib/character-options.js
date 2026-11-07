'use strict';
const skinTones=[
  {value:'#f6debd',label:'Light'},
  {value:'#f3c89f',label:'Warm'},
  {value:'#cc9a70',label:'Tan'},
  {value:'#a87650',label:'Brown'},
  {value:'#704a34',label:'Deep'},
  {value:'#ffffff',label:'Original white'}
];
function characterParts(parts){return parts.filter(part=>!/^monster\d+$/.test(part.sourcePack||'')&&!/^Monster Pack \d+\//.test(part.category||''));}
function characterSources(sources,current){return sources.filter(source=>source.pack==='character-maker'||source.id===current);}
module.exports={skinTones,characterParts,characterSources};
