'use strict';
const fs=require('node:fs'),path=require('node:path');
const data=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../assets/resources/gui-pro/loading/loading-bar.prefab'),'utf8'));
function asset(){return{data,refs:0,releases:0,addRef(){this.refs++;},decRef(){this.refs--;this.releases++;}};}
function instantiate(cc,prefab){
 const nodes=new Map();for(const [id,value]of prefab.data.entries())if(value.__type__==='cc.Node')nodes.set(id,new cc.Node(value._name));
 for(const [id,node]of nodes){const value=prefab.data[id];node.active=value._active;node.anchorX=value._anchorPoint.x;node.anchorY=value._anchorPoint.y;node.x=value._trs.array[0];node.y=value._trs.array[1];for(const ref of value._children||[])nodes.get(ref.__id__).parent=node;
  for(const ref of value._components||[]){const component=prefab.data[ref.__id__],Type=cc[component.__type__.slice(3)],c=node.addComponent(Type);for(const [key,v]of Object.entries(component)){if(key==='node'||key==='__type__')continue;const name=key.startsWith('_N$')?key.slice(3):key.startsWith('_')?key.slice(1):key;c[name]=v;}if(component.__type__==='cc.Label'){c.string=component._string;c.overflow=component['_N$overflow'];}}
  node.setContentSize(value._contentSize.width,value._contentSize.height);
 }
 return nodes.get(prefab.data[0].data.__id__);
}
function root(panel){return panel.getChildByName('GUI PRO loading bar').getChildByName('Slider_LoadingBar');}
const progress=panel=>root(panel).getChildByName('Progress'),fill=panel=>root(panel).getChildByName('Fill');
module.exports={asset,instantiate,root,progress,fill,data};
