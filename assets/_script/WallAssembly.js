"use strict";

// Native pack modules connect at a 60 x 40 pixel pitch. Keep every bitmap
// intact: the assembly chooses a module and translates it onto this grid.
// Coordinates here are model units (the existing Spine root has scale .5).
var STEP = {x:45,y:30}, SLOPE=2/3, OLD_SLOPE=Math.tan(Math.PI/6), DEFAULT_SPAN=113.5;
var POST=[[61,77],[60.5,91],[60.5,93]],TOP=[[68,77],[64.5,91],[66.5,93]],CORNER=[[68,77],[64.5,91],[67.5,93]];
var MAX_SIDE=256,MAX_TOTAL=512;
function clone(value){return JSON.parse(JSON.stringify(value));}
function finite(value){return typeof value==="number"&&isFinite(value);}
function route(run,side){return run.routes&&run.routes[side]||[{u:0,v:0},{u:side==="left"?-run[side]:run[side],v:0}];}
function routeLength(points){var length=0,visited={"0,0":true};if(!Array.isArray(points)||!points.length||!points[0]||points[0].u!==0||points[0].v!==0)return -1;for(var i=0;i<points.length;i++){var p=points[i];if(!p||!Number.isInteger(p.u)||!Number.isInteger(p.v)||Math.abs(p.u)>MAX_SIDE||Math.abs(p.v)>MAX_SIDE)return -1;if(!i)continue;var a=points[i-1],du=p.u-a.u,dv=p.v-a.v;if(du&&dv)return -1;var n=Math.abs(du)+Math.abs(dv);if(!n){if(points.length===2&&points[0].u===0&&points[0].v===0)return 0;return -1;}if(length+n>MAX_SIDE)return -1;for(var j=1;j<=n;j++){var key=(a.u+Math.sign(du)*j)+","+(a.v+Math.sign(dv)*j);if(visited[key])return -1;visited[key]=true;}length+=n;}return length;}
function segments(points,offset){var out=[];for(var i=1;i<points.length;i++){var a=points[i-1],b=points[i];if(a.u!==b.u||a.v!==b.v)out.push({a:{u:a.u+offset,v:a.v},b:{u:b.u+offset,v:b.v}});}return out;}
function intersection(a,b){var loU=Math.max(Math.min(a.a.u,a.b.u),Math.min(b.a.u,b.b.u)),hiU=Math.min(Math.max(a.a.u,a.b.u),Math.max(b.a.u,b.b.u)),loV=Math.max(Math.min(a.a.v,a.b.v),Math.min(b.a.v,b.b.v)),hiV=Math.min(Math.max(a.a.v,a.b.v),Math.max(b.a.v,b.b.v));return loU>hiU+1e-7||loV>hiV+1e-7?null:{u:loU,v:loV,overlap:hiU-loU>1e-7||hiV-loV>1e-7};}
function separated(run){var offset=run.gate?(run.nativeGateSpan||DEFAULT_SPAN)/STEP.x:0,left=segments(route(run,"left"),0),right=segments(route(run,"right"),offset),portal={a:{u:0,v:0},b:{u:offset,v:0}};
  for(var i=0;i<left.length;i++)for(var j=0;j<right.length;j++){var p=intersection(left[i],right[j]);if(p&&(run.gate||p.overlap||Math.abs(p.u)>1e-7||Math.abs(p.v)>1e-7))return false;}
  if(run.gate)for(var side of [left,right])for(var s of side){var p=intersection(s,portal),own=side===left?0:offset;if(p&&(p.overlap||Math.abs(p.u-own)>1e-7||Math.abs(p.v)>1e-7))return false;}
  return true;
}
function valid(run){
  if(!run||typeof run!=="object"||Array.isArray(run))return false;
  var native=run.nativeVersion===2,side=native?MAX_SIDE:32,total=native?MAX_TOTAL:48;
  if(run.nativeVersion!==undefined&&!native)return false;
  if(!Number.isInteger(run.left)||run.left<0||run.left>side||!Number.isInteger(run.right)||run.right<0||run.right>side||run.left+run.right>total||typeof run.gate!=="boolean"||!run.gate&&!run.left&&!run.right)return false;
  if(["post","shared"].indexOf(run.start)<0||["post","corner"].indexOf(run.end)<0||run.gate&&!run.left&&run.start!=="post"||run.gate&&!run.right&&run.end!=="post")return false;
  if(!native&&run.spacing!==undefined&&(!Number.isInteger(run.spacing)||run.spacing<1||run.spacing>4))return false;
  if(run.nativeOrigin!==undefined&&(!run.nativeOrigin||!finite(run.nativeOrigin.x)||!finite(run.nativeOrigin.y)||Math.abs(run.nativeOrigin.x)>10000||Math.abs(run.nativeOrigin.y)>10000))return false;
  if(run.nativeGateSpan!==undefined&&(!finite(run.nativeGateSpan)||run.nativeGateSpan<80||run.nativeGateSpan>20000))return false;
  if(!native&&run.sockets!==undefined&&(!run.sockets||["left","right","depth"].some(function(k){return !finite(run.sockets[k])||Math.abs(run.sockets[k])>20;})))return false;
  if(!native&&run.handles!==undefined){var h=run.handles;if(!h||!Array.isArray(h.left)||!Array.isArray(h.right)||h.left.length!==run.left+1||h.right.length!==run.right+1)return false;if(![h.left,h.right].every(function(a){return a.every(function(x,i){return finite(x)&&Math.abs(x)<=10000&&(!i||x-a[i-1]>=24);});}))return false;if(run.gate?h.right[0]-h.left[h.left.length-1]<80:Math.abs(h.right[0]-h.left[h.left.length-1])>=1e-6)return false;}
  if(native&&run.routes!==undefined){if(!run.routes||typeof run.routes!=="object"||Array.isArray(run.routes))return false;for(var side of ["left","right"])if(run.routes[side]!==undefined&&routeLength(run.routes[side])!==run[side])return false;if(!separated(run))return false;}
  return true;
}
function routePoints(points,origin){var result=[{x:origin.x,y:origin.y}],segments=[];for(var i=1;i<points.length;i++){var a=points[i-1],b=points[i],du=b.u-a.u,dv=b.v-a.v,n=Math.abs(du)+Math.abs(dv),start=result[result.length-1];for(var j=1;j<=n;j++)result.push({x:origin.x+STEP.x*(a.u+a.v+(Math.sign(du)+Math.sign(dv))*j),y:origin.y+STEP.y*(-a.u+a.v+(-Math.sign(du)+Math.sign(dv))*j)});if(n){var end=result[result.length-1],last=segments[segments.length-1],dx=end.x-start.x,dy=end.y-start.y;if(last&&Math.abs((last.b.x-last.a.x)*dy-(last.b.y-last.a.y)*dx)<1e-6&&(last.b.x-last.a.x)*dx+(last.b.y-last.a.y)*dy>0)last.b=clone(end);else segments.push({a:clone(start),b:clone(end)});}}return {points:result,segments:segments};}
function steps(length){return Math.max(0,Math.ceil((length-1e-7)/STEP.x));}
function layout(run,endpoints){
  if(run!==undefined&&run!==null&&!valid(run))throw Error("Invalid wall run: choose whole module counts and valid joins.");
  var oldLeft={x:-49,y:23.5},oldRight={x:64.5,y:23.5-DEFAULT_SPAN*OLD_SLOPE},center={x:(oldLeft.x+oldRight.x)/2,y:(oldLeft.y+oldRight.y)/2},span=DEFAULT_SPAN,gate=!run||run.gate,left,right;
  if(run&&run.nativeVersion===2){center=run.nativeOrigin?clone(run.nativeOrigin):center;span=run.nativeGateSpan||DEFAULT_SPAN;left=run.left;right=run.right;}
  else if(run){
    if(run.handles){var h=run.handles,l=h.left[h.left.length-1],r=h.right[0],intercept=oldLeft.y+OLD_SLOPE*oldLeft.x;center={x:(l+r)/2,y:intercept-OLD_SLOPE*(l+r)/2};if(gate)span=r-l;left=steps(l-h.left[0]);right=steps(h.right[h.right.length-1]-r);}
    else{left=steps(run.left*60*(run.spacing||1));right=steps(run.right*60*(run.spacing||1));}
  }else{
    var points=(endpoints||[]).filter(function(p){return p&&finite(p.x)&&finite(p.y);}),min=points.length?Math.min.apply(null,points.map(function(p){return p.x;})):-162.33,max=points.length?Math.max.apply(null,points.map(function(p){return p.x;})):177.67;
    left=steps(Math.max(0,oldLeft.x-min));right=steps(Math.max(0,max-oldRight.x));
  }
  if(left>MAX_SIDE||right>MAX_SIDE||left+right>MAX_TOTAL)throw Error("This wall exceeds the native module budget. Split it into separate wall runs.");
  var a=gate?span/2:0,result={nativeVersion:2,legacy:!run||run.nativeVersion!==2,axis:{x:STEP.x,y:STEP.y,slope:SLOPE},nativeOrigin:center,nativeGateSpan:span,gate:gate,start:run?run.start:"post",end:run?run.end:"post",leftCount:left,rightCount:right,left:{x:center.x-a,y:center.y+a*SLOPE},right:{x:center.x+a,y:center.y-a*SLOPE}};
  result.leftEnd={x:result.left.x-left*STEP.x,y:result.left.y+left*STEP.y};result.rightEnd={x:result.right.x+right*STEP.x,y:result.right.y-right*STEP.y};
  result.leftPoints=chain(result.leftEnd,result.left,left);result.rightPoints=chain(result.right,result.rightEnd,right);
  if(run&&run.nativeVersion===2&&run.routes){result.routes=clone(run.routes);var l=routePoints(route(run,"left"),result.left),r=routePoints(route(run,"right"),result.right);result.leftPoints=l.points.slice().reverse();result.rightPoints=r.points;result.leftEnd=clone(l.points[l.points.length-1]);result.rightEnd=clone(r.points[r.points.length-1]);result.leftSegments=l.segments;result.rightSegments=r.segments;}
  else{result.leftSegments=left?[{a:clone(result.left),b:clone(result.leftEnd)}]:[];result.rightSegments=right?[{a:clone(result.right),b:clone(result.rightEnd)}]:[];}
  return result;
}
function chain(a,b,count){var result=[];for(var i=0;i<=count;i++)result.push({x:a.x+i*STEP.x,y:a.y-i*STEP.y});return result;}
function canonical(run,endpoints){
  var plan=layout(run,endpoints),result=run?clone(run):{};if(!run||run.nativeVersion!==2)delete result.routes;result.nativeVersion=2;result.left=plan.leftCount;result.right=plan.rightCount;result.gate=plan.gate;result.start=plan.start;result.end=plan.end;result.nativeOrigin=clone(plan.nativeOrigin);result.nativeGateSpan=plan.nativeGateSpan;result.spacing=1;delete result.handles;delete result.sockets;return result;
}
function pieces(plan){
  var result=[],byPoint={};function key(p){return p.x.toFixed(6)+","+p.y.toFixed(6);}function add(points,side){points.forEach(function(p,i){var k=key(p),part=byPoint[k];if(!part){part={x:p.x,y:p.y,side:side,index:i,upperLeft:false,upperRight:false,gateway:plan.gate&&(side==="left"?i===points.length-1:i===0)?side:null};byPoint[k]=part;result.push(part);}if(i){var prior=points[i-1],front=p.y<prior.y?part:byPoint[key(prior)],back=p.y<prior.y?prior:p;if(back.x<front.x)front.upperLeft=true;else front.upperRight=true;}});}
  add(plan.leftPoints,"left");add(plan.rightPoints,"right");
  var last=byPoint[key(plan.rightEnd)];if(last&&plan.end==="corner")last.upperRight=true;
  return result.map(function(p){p.part=p.upperLeft?(p.upperRight?"corner":"top"):(p.upperRight?"right":"post");delete p.upperLeft;delete p.upperRight;return p;}).filter(function(p){return !(plan.start==="shared"&&p.part==="post"&&key(p)===key(plan.leftEnd));}).sort(function(a,b){return b.y-a.y||a.x-b.x;});
}
function attachment(piece,level,sizes,options){
  var mirrored=!!(options&&options.mirrorX),kind=mirrored?(piece.part==="top"?"right":piece.part==="right"?"top":piece.part):piece.part,path="rts_wall_"+kind+"_"+level,size=sizes[path],anchor=(kind==="top"?TOP:kind==="corner"?CORNER:POST)[level-1],sign=mirrored?-1:1;
  if(!size)throw Error("Missing native wall module "+path);
  return {path:path,x:piece.x*2+sign*(size[0]/2-anchor[0])*1.5,y:piece.y*2+(anchor[1]-size[1]/2)*1.5,width:size[0]*1.5,height:size[1]*1.5,scaleX:sign};
}
exports.step=STEP;exports.axis={x:STEP.x,y:STEP.y,slope:SLOPE};exports.maxPerSide=MAX_SIDE;exports.maxTotal=MAX_TOTAL;exports.valid=valid;exports.layout=layout;exports.chain=chain;exports.canonical=canonical;exports.pieces=pieces;exports.attachment=attachment;
