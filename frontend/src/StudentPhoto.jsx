import React,{useEffect,useRef,useState} from 'react';

export function StudentPhoto({file,onChange}){
 const video=useRef(null),stream=useRef(null),[camera,setCamera]=useState(false),[error,setError]=useState('');
 const stop=()=>{stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setCamera(false)};
 useEffect(()=>stop,[]);
 const start=async()=>{setError('');try{stream.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});setCamera(true);setTimeout(()=>{if(video.current)video.current.srcObject=stream.current},0)}catch{setError('Camera access is unavailable. You can upload a picture instead.')}};
 const capture=()=>{const v=video.current,canvas=document.createElement('canvas');canvas.width=v.videoWidth||640;canvas.height=v.videoHeight||480;canvas.getContext('2d').drawImage(v,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{if(blob)onChange(new File([blob],`student-${Date.now()}.jpg`,{type:'image/jpeg'}));stop()},'image/jpeg',.88)};
 const preview=file?URL.createObjectURL(file):null;
 useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview)},[preview]);
 return <div className="photo-picker"><div className="photo-preview">{camera?<video ref={video} autoPlay playsInline muted/>:preview?<img src={preview} alt="Student profile preview"/>:<span>♙</span>}</div><div className="photo-actions"><label className="button-link secondary">Upload image<input className="visually-hidden" type="file" accept="image/png,image/jpeg" onChange={e=>onChange(e.target.files?.[0]||null)}/></label>{camera?<button type="button" onClick={capture}>Capture photo</button>:<button type="button" className="secondary" onClick={start}>Use webcam</button>}{file&&<button type="button" className="text-button" onClick={()=>onChange(null)}>Remove</button>}</div>{error&&<small className="error-inline">{error}</small>}</div>;
}
