'use strict';
const rows=[['legacy-cavalry','hong','Original cavalry · Red'],['legacy-cavalry','lan','Original cavalry · Blue'],...['lv1','lv2','lv3','lv4','vip1','vip2'].map((skin,index)=>['hero-horse',skin,'Original horse · '+(index<4?'Tier '+(index+1):'VIP '+(index-3))])];
function assets(){return rows.map(([mount,skin,name])=>({id:'original-mount/'+mount+'/'+skin,name,category:'Mount',sourcePack:'original-mounts',mount,skin,width:128,height:128,image:'assets/resources/unit-library/mount-icons/'+mount+'-'+skin+'.png',thumbnail:'assets/resources/unit-library/mount-icons/'+mount+'-'+skin+'.png'}));}
module.exports={assets};
