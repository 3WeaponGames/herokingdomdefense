'use strict';
const Fighting=require('../lib/fighting-profiles');
const LABELS=['HP','Damage','Attack rate','Movement'];
function render(panel,node){
 const settings=panel._data('overrides'),profiles=settings.unitProfiles,issues=Fighting.balanceIssues(settings),available=profiles&&profiles.families,fields=panel._section('Enemy fighting-type balance'),table=node('table',undefined,'gt-enemy-balance');
 fields.appendChild(table);table.setAttribute('aria-label','Enemy fighting-type balance');const head=node('thead'),heading=node('tr');for(const label of ['Profile',...LABELS.map(label=>label+' (%)')])heading.appendChild(node('th',label));head.appendChild(heading);table.appendChild(head);const body=node('tbody');table.appendChild(body);
 for(const role of Fighting.ROLES){const row=node('tr'),name=settings.unitTypes&&settings.unitTypes[role]&&settings.unitTypes[role].name||role[0].toUpperCase()+role.slice(1);row.appendChild(node('th',name));body.appendChild(row);for(const [index,label]of LABELS.entries()){const cell=node('td');row.appendChild(cell);const input=panel._field(cell,name+' '+label+' (%)',Fighting.factors(settings,role)[index],value=>panel._change(()=>{
  const current=panel._data('overrides'),source=current.unitProfiles;if(!source||!source.families)throw Error('Enemy fighting profiles are not configured.');const invalid=Fighting.balanceIssues(current);if(invalid.length)throw Error(invalid.join(' '));if(value===Fighting.factors(current,role)[index])return[];const next=JSON.parse(JSON.stringify(source));next.balance=next.balance||{};next.balance[role]=Fighting.factors(current,role).slice();next.balance[role][index]=value;const errors=Fighting.balanceIssues({unitProfiles:next});if(errors.length)throw Error(errors.join(' '));return[{doc:'overrides',path:['unitProfiles'],value:next}];
 },{skipEmpty:true}).catch(()=>{}),{percent:true,min:.1,max:4,readOnly:!available||issues.length>0});input.max='400';input.setAttribute('aria-label',name+' '+label+' (%)');}}
 panel._note('Enemy units only. 100% is each enemy unit’s baseline. Attack rate is attacks per second: 110% attacks faster. Save applies changes to inherited enemy profiles; explicit per-unit stat overrides are preserved. Allies, heroes, equipment and wave multipliers are unaffected.',false,fields);
 if(!available)panel._note('Enemy fighting profiles are not configured in this project.',true,fields);for(const issue of issues)panel._note(issue,true,fields);
}
module.exports={render};
