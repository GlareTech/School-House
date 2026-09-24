import React,{useEffect,useState} from 'react';

const initials=name=>String(name||'School').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase();

export function BrandImage({src,name,className='brand-image',alt='School logo'}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
 if(!src||failed)return <span className={`${className} brand-image-fallback`} aria-label={`${name||'School'} logo placeholder`}>{initials(name)}</span>;
 return <img className={className} src={src} alt={alt} onError={()=>setFailed(true)}/>;
}

export function OptionalImage({src,className,alt,fallback=null}){
 const [failed,setFailed]=useState(false);useEffect(()=>setFailed(false),[src]);
 return src&&!failed?<img className={className} src={src} alt={alt} onError={()=>setFailed(true)}/>:fallback;
}
