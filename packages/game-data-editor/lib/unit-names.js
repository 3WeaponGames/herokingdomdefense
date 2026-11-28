'use strict';
const Fighting=require('./fighting-profiles');
const Schema=require('./schema');

function target(config,settings,side,selectedId){
    const table=side==='ally'&&config.AllyCfg?'AllyCfg':'SoldierCfg';
    const profiles=table==='SoldierCfg'?settings.unitProfiles||{}:{};
    const selected=String(table==='SoldierCfg'?Fighting.canonicalId(settings,selectedId):selectedId);
    const entry=profiles.entries?.[selected];
    const linked=entry?.created||entry?.fightingProfile;
    const id=linked?String(entry.baseId):selected;
    const record=config[table]?.[id];
    return {table,id,selected,record,profiles};
}

function display(unit,catalog,language){
    const reference=unit.record?.Name,key=Schema.token(reference);
    if(key&&!catalog.entries?.[key])return 'Unit '+unit.id;
    return Schema.resolve(reference,catalog,language)||'Unit '+unit.id;
}

function renameEdits(state,side,id,language,value){
    const {A:config,overrides:settings,catalog}=state;
    const unit=target(config,settings,side,id);
    if(!unit.record)throw Error('This unit is no longer available.');
    const name=typeof value==='string'?value.trim():'';
    if(!name)throw Error('Enter a unit name.');
    if(name===display(unit,catalog,language))return [];

    const {table,profiles}=unit,family=profiles.families?.[unit.id];
    const members=new Set([unit.id,unit.selected,...Object.values(family?.profiles||{}).map(String)]);
    for(const [id,entry] of Object.entries(profiles.entries||{})){
        if(entry.created&&String(entry.baseId)===unit.id)members.add(id);
    }
    for(const [alias,canonical] of Object.entries(profiles.aliases||{})){
        if(members.has(String(canonical))&&config[table][alias])members.add(alias);
    }

    const oldReference=unit.record.Name,oldKey=Schema.token(oldReference),entries=catalog.entries||{};
    // A translation may be shared by unrelated records in an older catalog.
    const shared=oldKey&&['SoldierCfg','AllyCfg'].some(source=>Object.entries(config[source]||{}).some(([id,row])=>
        row?.Name===oldReference&&(source!==table||!members.has(id))));
    let key=oldKey;
    const edits=[];
    if(key&&entries[key]&&!shared){
        edits.push({doc:'catalog',path:['entries',key,language],value:name});
    }else{
        const prefix='data.unit-name.'+(table==='AllyCfg'?'ally':'enemy')+'.'+unit.id;
        key=prefix;
        for(let index=2;Object.prototype.hasOwnProperty.call(entries,key);index++)key=prefix+'.'+index;
        const entry=oldKey?{...entries[oldKey]}:{};
        for(const {code} of catalog.languages||[{code:'en'}]){
            if(!entry[code])entry[code]=display(unit,catalog,code);
        }
        entry[language]=name;
        edits.push({doc:'catalog',path:['entries',key],value:entry});
    }
    const reference='[[loc:'+key+']]';
    for(const id of members){
        if(config[table][id]&&config[table][id].Name!==reference){
            edits.push({doc:'A',path:[table,id,'Name'],value:reference});
        }
    }
    if(family&&family.name!==reference){
        edits.push({doc:'overrides',path:['unitProfiles','families',unit.id,'name'],value:reference});
    }
    return edits;
}

module.exports={target,display,renameEdits};
