'use strict';

// Pure views over authored data. Opening the catalog never seeds defaults or
// rebuilds a branch record; every edit still targets the original storage path.
const Schema=require('../lib/schema');
const ALLIED_IDS=[90001,90002,90003,90004];
function name(value,catalog,language,fallback){return Schema.resolve(value,catalog,language)||fallback;}
function alliedUnits(base,catalog,language){
  const units=base.AllyCfg||base.SoldierCfg||{};
  return ALLIED_IDS.filter(id=>units[id]&&units[id].prefab).map(id=>({value:id,label:name(units[id].Name,catalog,language,'Unit '+id)+' · '+id,record:units[id]}));
}
function branchSummary(id,level,base,catalog,language){
  const data=Array.isArray(level.Data)?level.Data:[];
  switch(Number(id)){
    case 1:case 2:{const attack=Number(id)===2&&level.Tower;return (attack&&attack.attackType?attack.attackType+' · ':'')+data[0]+' damage · '+data[1]+' attacks/s · '+data[2]+' range'+(attack&&attack.attackType==='cannon'?' · '+(attack.splashRadius===undefined?90:attack.splashRadius)+' splash':'');}
    case 3:{const unit=(base.AllyCfg||base.SoldierCfg||{})[data[1]];return data[0]+' × '+name(unit&&unit.Name,catalog,language,'Unit '+data[1])+' · '+data[2]+'s respawn';}
    case 4:case 5:return data[0]+' silver / wave';
    default:return level.Hp+' HP';
  }
}
function branches(building,id,base,catalog,language){
  return (Array.isArray(building.levelList)?building.levelList:[]).map((record,position)=>({
    index:record.index,position,level:record.level,
    label:name(record.Name,catalog,language,'Branch #'+record.index),
    summary:branchSummary(id,record,base,catalog,language),record,
    next:Array.isArray(record.BranchBuild)?record.BranchBuild.slice():[],
    unit:Number(id)===3&&(base.AllyCfg||base.SoldierCfg||{})[(record.Data||[])[1]]||null
  }));
}
function catalog(base,translations,language){
  return Object.keys(base.BuildEnum||{}).filter(id=>id!=='0').map(id=>{
    const record=base.BuildEnum[id],levels=Array.isArray(record.levelList)?record.levelList:[],first=levels[0]||{};
    return {key:id,label:name(record.name,translations,language,Schema.BUILDINGS[id]||record.enumKey||'Building '+id),
      subtitle:'ID '+id+' · '+levels.length+' upgrade branches · '+(record.enumKey||''),record,
      path:['BuildEnum',id],doc:'A',icon:first.Icon};
  });
}

// Construction families are a view of the existing branch graph, not a new
// storage format. Branch positions (including alternatives at the same level)
// remain the original levelList positions used by the editor's draft paths.
function families(base,translations,language){
  const rows=[],diagnostics=[];
  Object.defineProperty(rows,'diagnostics',{value:diagnostics});
  const validIndex=value=>Number.isInteger(value)&&value>0;
  for(const typeID of Object.keys(base.BuildEnum||{}).filter(id=>id!=='0')){
    const building=base.BuildEnum[typeID];
    const issue=(code,path,message,extra={})=>{
      const diagnostic={code,typeID,path,message,...extra};
      diagnostics.push(diagnostic);
      return diagnostic;
    };
    const path=['BuildEnum',typeID];
    if(!building||typeof building!=='object'||Array.isArray(building)){
      issue('invalid-building',path,'Building data must be an object.');continue;
    }
    const categoryLabel=name(building.name,translations,language,Schema.BUILDINGS[typeID]||building.enumKey||'Building '+typeID);
    if(!Array.isArray(building.levelList)){
      issue('invalid-branches',path.concat('levelList'),'Building branches must be an array.');continue;
    }
    const descriptors=[],byIndex=new Map();
    building.levelList.forEach((record,position)=>{
      const branchPath=path.concat('levelList',position);
      if(!record||typeof record!=='object'||Array.isArray(record)){
        issue('invalid-branch',branchPath,'Branch data must be an object.',{position});return;
      }
      const branch=branches({levelList:[record]},typeID,base,translations,language)[0];
      branch.position=position;branch.path=branchPath;branch.doc='A';
      descriptors.push(branch);
      if(!validIndex(branch.index)){
        issue('invalid-index',branchPath.concat('index'),'Branch index must be a positive integer.',{position,index:branch.index});
      }else if(byIndex.has(branch.index)){
        issue('duplicate-index',branchPath.concat('index'),'Branch index '+branch.index+' is already used; references retain the first authored branch.',{position,index:branch.index});
      }else byIndex.set(branch.index,branch);
      if(!Number.isInteger(branch.level)||branch.level<1){
        issue('invalid-level',branchPath.concat('level'),'Building level must be a positive integer.',{position,index:branch.index});
      }
      if(Object.prototype.hasOwnProperty.call(record,'BranchBuild')&&!Array.isArray(record.BranchBuild)){
        issue('invalid-children',branchPath.concat('BranchBuild'),'Next upgrade branches must be an array.',{position,index:branch.index});
      }
    });
    let roots=[];
    const rootOrders=new Map();
    if(Object.prototype.hasOwnProperty.call(building,'InitialChoices')){
      const choices=building.InitialChoices;
      if(!Array.isArray(choices)||!choices.length){
        issue('invalid-initial-choices',path.concat('InitialChoices'),'Construction choices must be a non-empty array; no default has been inserted.');
      }else{
        const seen=new Set();let valid=true;
        choices.forEach((index,position)=>{
          let message;
          if(!validIndex(index))message='Construction choice must reference a positive integer branch index.';
          else if(seen.has(index))message='Construction choice '+index+' is duplicated.';
          else if(!byIndex.has(index))message='Construction choice '+index+' references a missing branch.';
          if(message){valid=false;issue('invalid-initial-choice',path.concat('InitialChoices',position),message,{index});}
          seen.add(index);
        });
        if(valid)choices.forEach((index,position)=>{
          const root=byIndex.get(index);
          if(root.level!==1){
            issue('invalid-initial-level',path.concat('InitialChoices',position),'Construction choice '+index+' is not level 1 and is omitted by gameplay.',{index});
          }else {roots.push(root);rootOrders.set(index,position);}
        });
      }
    }else{
      // Without an explicit list, gameplay constructs the first authored branch.
      // Do not assume that its identifier is 1 or its array position is index - 1.
      const first=descriptors.find(branch=>branch.position===0);
      if(first&&validIndex(first.index)&&byIndex.get(first.index)===first)roots=[first];
      else issue('missing-default-root',path.concat('levelList',0),'The first authored construction branch is missing or has an invalid index.');
    }
    const grouped=selected=>{
      const levels=new Map();
      for(const branch of selected){
        if(!levels.has(branch.level))levels.set(branch.level,[]);
        levels.get(branch.level).push(branch);
      }
      return Array.from(levels,([level,branches])=>({level,branches})).sort((a,b)=>{
        const av=Number.isInteger(a.level)&&a.level>0,bv=Number.isInteger(b.level)&&b.level>0;
        return av&&bv?a.level-b.level:av?-1:bv?1:0;
      });
    };
    roots.forEach((root,position)=>{
      const constructionOrder=rootOrders.has(root.index)?rootOrders.get(root.index):position;
      const key=typeID+':'+root.index,visited=new Set([root.position]),visiting=new Set([root.position]),familyDiagnostics=[];
      const stack=[{branch:root,edge:0}];
      while(stack.length){
        const frame=stack[stack.length-1],branch=frame.branch;
        if(frame.edge>=branch.next.length){visiting.delete(branch.position);stack.pop();continue;}
        const edge=frame.edge++,index=branch.next[edge],target=byIndex.get(index),edgePath=branch.path.concat('BranchBuild',edge);
        if(!validIndex(index)||!target){
          familyDiagnostics.push(issue('unknown-child',edgePath,'Upgrade branch '+String(index)+' does not reference an authored branch.',{familyKey:key,index,position:branch.position}));
        }else if(visiting.has(target.position)){
          familyDiagnostics.push(issue('cycle',edgePath,'Upgrade branch '+index+' creates a cycle.',{familyKey:key,index,position:branch.position}));
        }else if(!visited.has(target.position)){
          visited.add(target.position);visiting.add(target.position);stack.push({branch:target,edge:0});
        }
      }
      const selected=descriptors.filter(branch=>visited.has(branch.position)),levels=grouped(selected);
      let label=root.label.replace(/\s*(?:[·•:–—-]\s*)?(?:Lv(?:l)?\.?|Level)\s*\.?\s*\d+\s*$/i,'').trim()||root.label;
      if(typeID==='3'&&!/\bbarracks\b/i.test(label))label+=' Barracks';
      rows.push({key,typeID,rootIndex:root.index,rootPosition:root.position,root,record:building,
        path:path.slice(),doc:'A',categoryLabel,label,constructionOrder,icon:root.record.Icon,
        branches:selected,levels,diagnostics:familyDiagnostics,
        subtitle:categoryLabel+' · '+levels.length+' levels · '+selected.length+' upgrade branches'});
    });
  }
  return rows;
}
module.exports={ALLIED_IDS,catalog,branches,families,alliedUnits,branchSummary};
