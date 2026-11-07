'use strict';
// Stationary-target scenario using the existing controller's integration rules.
// Enemy 08 follows its live target directly and caps movement at that target.
function simulate(settings, distance, fps) {
    if (!settings) return null;
    const dt=1/(fps||60), points=[{time:0,x:0,y:0}];let x=0,y=0,angle=settings.straight?0:settings.angle*Math.PI/180,turn=settings.angleSpeed;
    for(let frame=0;frame<3600;frame++) {
        const dx=distance-x,dy=-y;
        if(Math.sqrt(dx*dx+dy*dy)<settings.arrivalRadius)return{time:frame*dt,points,fps:fps||60};
        if(settings.directHoming){angle=Math.atan2(dy,dx);}else{
            let difference=Math.atan2(dy,dx)-angle;while(difference>Math.PI)difference-=2*Math.PI;while(difference<-Math.PI)difference+=2*Math.PI;
            const step=turn*dt*Math.PI/180;angle+=Math.abs(difference)>step?Math.sign(difference)*step:difference;turn+=settings.addAngleSpeed*dt;
        }
        const directionX = Math.cos(angle), directionY = Math.sin(angle);
        let travel = settings.directHoming ? Math.min(Math.hypot(dx,dy), settings.speed * dt) : settings.speed * dt;
        const along = dx * directionX + dy * directionY;
        let crossed = false;
        if (!settings.directHoming && along > 0 && along < travel) {
            const offsetX = dx - along * directionX, offsetY = dy - along * directionY;
            const closestSq = offsetX * offsetX + offsetY * offsetY;
            const beyond = travel - along, radiusSq = settings.arrivalRadius * settings.arrivalRadius;
            if (closestSq < radiusSq && closestSq + beyond * beyond >= radiusSq) {
                travel = along;
                crossed = true;
            }
        }
        x += directionX * travel;
        y += directionY * travel;
        points.push({time:(frame+1)*dt,x,y});
        if (crossed) return { time: (frame+1)*dt, points, fps: fps || 60 };
    }
    return{time:null,points,fps:fps||60};
}
module.exports={simulate};
