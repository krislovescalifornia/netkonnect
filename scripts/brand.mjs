// White and neon green are the netKonnect identity; ink keeps the N legible.
export const BRAND = Object.freeze({ white:'#ffffff', green:'#b6ff00', ink:'#20251b' });
export const ICON_SIZES = [16, 20, 24, 32, 48, 64, 128, 256];
const rgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const white = rgb(BRAND.white), green = rgb(BRAND.green), ink = rgb(BRAND.ink);
function rounded(x,y,left,top,right,bottom,radius) {
  return Math.hypot(Math.max(left+radius-x,0,x-(right-radius)),Math.max(top+radius-y,0,y-(bottom-radius))) <= radius;
}
// Supersampling keeps the white border and diagonal readable at tray sizes.
export function iconBitmap(size) {
  const out = Buffer.alloc(size*size*4), samples=4;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const sum=[0,0,0]; let visible=0;
    for(let sy=0;sy<samples;sy++) for(let sx=0;sx<samples;sx++) {
      const u=(x+(sx+.5)/samples)*256/size,v=(y+(sy+.5)/samples)*256/size;
      if(!rounded(u,v,2,2,254,254,46)) continue;
      let color=white;
      if(rounded(u,v,12,12,244,244,36)) color=green;
      const mark=(u>=63&&u<88&&v>=67&&v<193)||(u>=168&&u<193&&v>=67&&v<193)||(u>=82&&u<174&&Math.abs(v-(u+3))<17);
      if(mark) color=ink;
      for(let c=0;c<3;c++) sum[c]+=color[c]; visible++;
    }
    const i=(y*size+x)*4;
    for(let c=0;c<3;c++) out[i+c]=visible?Math.round(sum[c]/visible):0;
    out[i+3]=Math.round(visible*255/(samples*samples));
  }
  return out;
}
export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect x="2" y="2" width="252" height="252" rx="46" fill="${BRAND.white}"/><rect x="12" y="12" width="232" height="232" rx="36" fill="${BRAND.green}"/><path d="M63 67h25v126H63zM168 67h25v126h-25zM82 68l92 92v34l-92-92z" fill="${BRAND.ink}"/></svg>`;
