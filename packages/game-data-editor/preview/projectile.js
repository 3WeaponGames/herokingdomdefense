'use strict';
// Stationary-target scenario using the existing controller's integration rules.
// Enemy 08 deliberately retains its existing fixed .01 movement per update.
function simulate(settings, distance, fps) {
    if (!settings) return null;
    const dt=1/(fps||60), points=[{time:0,x:0,y:0}];let x=0,y=0,angle=settings.straight?0:settings.angle*Math.PI/180,turn=settings.angleSpeed;
    for(let frame=0;frame<3600;frame++) {
        const dx=distance-x,dy=-y;
        if(Math.sqrt(dx*dx+dy*dy)<settings.arrivalRadius)return{time:frame*dt,points,fps:fps||60};
        if(settings.fixedStep){angle=Math.atan2(dy,dx);}else{
            let difference=Math.atan2(dy,dx)-angle;while(difference>Math.PI)difference-=2*Math.PI;while(difference<-Math.PI)difference+=2*Math.PI;
            const step=turn*dt*Math.PI/180;angle+=Math.abs(difference)>step?Math.sign(difference)*step:difference;turn+=settings.addAngleSpeed*dt;
        }
        const stepTime=settings.fixedStep||dt;x+=Math.cos(angle)*settings.speed*stepTime;y+=Math.sin(angle)*settings.speed*stepTime;
        points.push({time:(frame+1)*dt,x,y});
    }
    return{time:null,points,fps:fps||60};
}
module.exports={simulate};
