// Dependency-free CPU Z-buffer of the triangle projections in our diagnostic SVG.
// Arbitrary fixed light and orthographic camera; never a browser/GPU acceptance.
import { deflateSync } from 'node:zlib';
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),body=Buffer.concat([name,data]),result=Buffer.alloc(body.length+8);result.writeUInt32BE(data.length);body.copy(result,4);result.writeUInt32BE(crc32(body),body.length+4);return result;}
function png(pixels,width,height){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=2;const rows=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++)pixels.copy(rows,y*(width*3+1)+1,y*width*3,(y+1)*width*3);return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
export function rasterSvg(svg,width=1200,height=760){
  const pixels=Buffer.alloc(width*height*3),depths=new Float64Array(width*height).fill(Infinity);for(let i=0;i<pixels.length;i+=3){pixels[i]=212;pixels[i+1]=220;pixels[i+2]=229;}
  for(const match of svg.matchAll(/<polygon points="([^"]+)" fill="rgb\(([^)]+)\)" data-depth="([^"]+)"\/>/g)){
    const p=match[1].split(' ').map(v=>v.split(',').map(Number)),color=match[2].split(',').map(Number),z=match[3].split(',').map(Number);
    const minx=Math.max(0,Math.floor(Math.min(...p.map(v=>v[0])))),maxx=Math.min(width-1,Math.ceil(Math.max(...p.map(v=>v[0])))),miny=Math.max(0,Math.floor(Math.min(...p.map(v=>v[1])))),maxy=Math.min(height-1,Math.ceil(Math.max(...p.map(v=>v[1]))));
    const edge=(a,b,x,y)=>(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]),area=edge(p[0],p[1],...p[2]);
    for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){const e=p.map((a,i)=>edge(a,p[(i+1)%3],x+.5,y+.5));if(e.every(v=>v>=0)||e.every(v=>v<=0)){const depth=(e[1]*z[0]+e[2]*z[1]+e[0]*z[2])/area,index=y*width+x;if(depth>depths[index])continue;depths[index]=depth;pixels[index*3]=color[0];pixels[index*3+1]=color[1];pixels[index*3+2]=color[2];}}
  }
  return png(pixels,width,height);
}
