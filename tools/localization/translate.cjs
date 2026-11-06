const fs=require('fs');
const dict=Object.fromEntries(fs.readFileSync(__dirname+'/translations.tsv','utf8').trimEnd().split(/\r?\n/).map(l=>{let i=l.indexOf('|');return [l.slice(0,i).replace(/\\n/g,'\n'),l.slice(i+1).replace(/\\n/g,'\n')]}));
const levels=['First Plains','Silent Forest','Arid Desert','Pristine Snowfield','Peaceful Plains','Verdant Forest','Blazing Desert','Pure Snowfield','Rolling Plains','Vast Forest','Barren Desert','White Snowfield','Open Plains','Ancient Forest','Lifeless Desert','Frozen Snowfield','Boundless Plains','Shadow Forest','Endless Desert','High Snowfield'];
function translate(v){
 if(Object.hasOwn(dict,v))return dict[v];let m;
 if(m=v.match(/^(\d+)\.[\u3400-\u9fff]+$/))return m[1]+'. '+levels[Number(m[1])-1];
 if(m=v.match(/^(建造|升级)1[座次](.+)$/))return (m[1]==='建造'?'Build 1 ':'Upgrade 1 ')+(dict[m[2]]||m[2]);
 const patterns=[[/^登录(.+)天$/,'Log in for $1 days'],[/^挑战(.+)关卡$/,'Attempt $1 stages'],[/^完成第(.+)关$/,'Clear stage $1'],[/^拥有(.+)至宝$/,'Own $1 relics'],[/^强化(.+)次至宝$/,'Upgrade relics $1 times'],[/^解锁(.+)次天赋$/,'Unlock $1 talents'],[/^升级(.+)次装备$/,'Upgrade equipment $1 times'],[/^获得(.+)金币$/,'Earn $1 gold'],[/^获得(.+)钻石$/,'Earn $1 gems'],[/^击杀(.+)名敌人$/,'Defeat $1 enemies'],[/^获得(.+)枚银币$/,'Earn $1 silver'],[/^观看(.+)次视频$/,'Watch $1 videos']];
 for(const [re,t] of patterns)if(re.test(v))return v.replace(re,t);
 return null;
}
module.exports={translate,dict};
