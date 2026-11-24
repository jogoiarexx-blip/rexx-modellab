import decode from '../vendor/jpeg/decoder.cjs';
import encode from '../vendor/jpeg/encoder.cjs';

export const JPEG_PREFIX='data:image/jpeg;base64,';
export function jpegBytes(uri){
  const str=atob(uri.slice(JPEG_PREFIX.length));
  return Uint8Array.from(str,c=>c.charCodeAt(0));
}
export function jpegURI(bytes){
  let str='';
  for(let offset=0;offset<bytes.length;offset+=8192)str+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return JPEG_PREFIX+btoa(str);
}
const decoded=new Map();
export function pixels(uri){
  if(decoded.has(uri))return decoded.get(uri);
  if(typeof uri!=='string'||!uri.startsWith(JPEG_PREFIX+'/9j/')||uri.length>6000000)throw Error('Textura JPEG incorporada inválida.');
  const image=decode(jpegBytes(uri),{useTArray:true,maxResolutionInMP:4.3,maxMemoryUsageInMB:112,tolerantDecoding:false});
  if(image.width>2048||image.height>2048)throw Error('A imagem deve ter até 2.048 pixels por lado.');
  if(decoded.size>=3)decoded.delete(decoded.keys().next().value);
  decoded.set(uri,image);return image;
}
export const compress=image=>jpegURI(encode(image,94).data);
export function pixelOffset(image,x,y){
  return 4*(Math.min(image.height-1,Math.max(0,Math.round(y)))*image.width+Math.min(image.width-1,Math.max(0,Math.round(x))));
}
