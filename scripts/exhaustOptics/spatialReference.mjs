// Independent aircraft-plume validation path. No production field sampler,
// volume weights or transfer helper is called here. SI: metres, cd/m², cd/m³.
export function bilinearReference(field,u,v,values=field.rgba,channels=4) {
  if(u>=-1e-12&&u<=1+1e-12)u=Math.max(0,Math.min(1,u));if(v>=-1e-12&&v<=1+1e-12)v=Math.max(0,Math.min(1,v));
  if(!Number.isFinite(u)||!Number.isFinite(v)||u<0||u>1||v<0||v>1)return Array(channels).fill(0);
  const x=u*(field.width-1),y=v*(field.height-1),i=Math.min(field.width-2,Math.floor(x)),j=Math.min(field.height-2,Math.floor(y)),a=x-i,b=y-j,result=Array(channels).fill(0);
  for(const [dx,dy,w]of [[0,0,(1-a)*(1-b)],[1,0,a*(1-b)],[0,1,(1-a)*b],[1,1,a*b]])for(let c=0;c<channels;c++)result[c]+=w*values[((j+dy)*field.width+i+dx)*channels+c];
  return result;
}
export function volumeReference(field,radius,length,values=field.rgba,channels=4) {
  // Product Gauss quadrature: exact for bilinear data multiplied by cylindrical
  // v and the quadratic expanded-radius Jacobian on each table cell.
  const q=[.5-.5/Math.sqrt(3),.5+.5/Math.sqrt(3)],result=Array(channels).fill(0),du=1/(field.width-1),dv=1/(field.height-1);
  for(let y=0;y<field.height-1;y++)for(let x=0;x<field.width-1;x++)for(const a of q)for(const b of q){const u=(x+a)*du,v=(y+b)*dv,weight=Math.PI*radius*radius*length*v*(1+field.radiusExpansionRatio*u)**2*du*dv/2,local=bilinearReference(field,u,v,values,channels);for(let c=0;c<channels;c++)result[c]+=local[c]*weight;}
  return result;
}
const add=(a,b)=>a.map((v,i)=>v+b[i]),scale=(a,s)=>a.map(v=>v*s),sub=(a,b)=>a.map((v,i)=>v-b[i]);
export const unitVector=a=>scale(a,1/Math.hypot(...a));
export function volumeInterval(origin,direction,radius,length,expansion){const r=radius*(1+Math.max(0,expansion)),lo=[-r,-r,0],hi=[r,r,length];let enter=0,leave=Infinity;for(let k=0;k<3;k++){if(Math.abs(direction[k])<1e-14){if(origin[k]<lo[k]||origin[k]>hi[k])return null;continue;}const a=(lo[k]-origin[k])/direction[k],b=(hi[k]-origin[k])/direction[k];enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));}return leave>enter?[enter,leave]:null;}
function localSource(field,point,radius,length){const u=point[2]/length,v=Math.hypot(point[0],point[1])/(radius*(1+field.radiusExpansionRatio*u));return bilinearReference(field,u,v);}
/** Independent fourth-order ODE integration of dL/ds=j*T and dT/ds=-κT. */
export function rayReference(field,radius,length,origin,direction,steps=2048){const interval=volumeInterval(origin,direction,radius,length,field.radiusExpansionRatio);if(!interval)return{radiance:[0,0,0],transmittance:1};const h=(interval[1]-interval[0])/steps;let state=[0,0,0,1];const derivative=(distance,state)=>{const value=localSource(field,add(origin,scale(direction,distance)),radius,length);return[value[0]*state[3],value[1]*state[3],value[2]*state[3],-value[3]*state[3]];};for(let i=0;i<steps;i++){const s=interval[0]+i*h,a=derivative(s,state),b=derivative(s+h/2,add(state,scale(a,h/2))),c=derivative(s+h/2,add(state,scale(b,h/2))),d=derivative(s+h,add(state,scale(c,h)));state=state.map((v,k)=>v+h*(a[k]+2*b[k]+2*c[k]+d[k])/6);}return{radiance:state.slice(0,3),transmittance:state[3]};}
/** Midpoint constant-segment transfer, used to measure a renderer's sample budget. */
export function rayMidpoint(field,radius,length,origin,direction,steps=16,clustered=false){
  const interval=volumeInterval(origin,direction,radius,length,field.radiusExpansionRatio);if(!interval)return{radiance:[0,0,0],transmittance:1};
  const span=interval[1]-interval[0],axialSpan=Math.min(1,Math.abs(direction[2]*span/length)),sign=direction[2]>=0?-1:1,boundary=u=>interval[0]+span*(u+(clustered?sign*axialSpan*u*(1-u):0)),result=[0,0,0];let transmittance=1;
  for(let i=0;i<steps;i++){const a=boundary(i/steps),b=boundary((i+1)/steps),h=b-a,local=localSource(field,add(origin,scale(direction,(a+b)/2)),radius,length),tau=local[3]*h,effective=local[3]>0?-Math.expm1(-tau)/local[3]:h;for(let k=0;k<3;k++)result[k]+=transmittance*local[k]*effective;transmittance*=Math.exp(-tau);}return{radiance:result,transmittance};
}
export function cameraRay(view,x,y,radius,length){const center=[0,0,length*.45],origin=view==='rear'?[0,0,length+8]:[5,2,length*.75+4],forward=unitVector(sub(center,origin)),right=unitVector([forward[2],0,-forward[0]]),up=[right[1]*forward[2]-right[2]*forward[1],right[2]*forward[0]-right[0]*forward[2],right[0]*forward[1]-right[1]*forward[0]],span=view==='rear'?radius*1.65:Math.max(radius*2,length*.52),point=add(center,add(scale(right,x*span),scale(up,y*span)));return{origin,direction:unitVector(sub(point,origin))};}

/** Independent combined spectral integration, before one common gamut mapping. */
export function combinedSpectrumReference(observer,temperature,absorption,chPowerDensity,c2PowerDensity,bands) {
  const xyz=[0,0,0],h=6.62607015e-34,c=299792458,k=1.380649e-23,step=.25;
  const totals={};for(const band of bands)totals[band.species]=(totals[band.species]??0)+band.relativeEnergy;
  for(let index=0;index<=470/step;index++){
    const nm=360+index*step,frequency=c/(nm*1e-9),photon=h*frequency;
    const perHz=2*photon*frequency*frequency/(c*c)/(Math.exp(photon/(k*temperature))-1),thermalPerNm=perHz*frequency*frequency/c*1e-9*absorption;
    let source=thermalPerNm;
    for(const band of bands){const watts=band.species==='CH*'?chPowerDensity:c2PowerDensity,gaussian=Math.exp(-.5*((nm-band.centerNm)/band.sigmaNm)**2)/(Math.sqrt(2*Math.PI)*band.sigmaNm);source+=watts/(4*Math.PI)*gaussian*band.relativeEnergy/totals[band.species];}
    const p=nm-360,lo=Math.floor(p),hi=Math.min(470,lo+1),fraction=p-lo,weight=683*step*(index===0||index===470/step?.5:1);
    for(let channel=0;channel<3;channel++)xyz[channel]+=source*weight*(observer[lo][channel+1]*(1-fraction)+observer[hi][channel+1]*fraction);
  }
  const rawRgb=[[3.2404542,-1.5371385,-.4985314],[-.969266,1.8760108,.041556],[.0556434,-.2040259,1.0572252]].map(row=>row.reduce((sum,value,i)=>sum+value*xyz[i],0)),positive=rawRgb.map(v=>Math.max(0,v)),y=.2126729*positive[0]+.7151522*positive[1]+.072175*positive[2];
  return {xyz,rawRgb,rgb:positive.map(v=>y>0?v*xyz[1]/y:0),negativeChannels:rawRgb.filter(v=>v<0).length};
}
