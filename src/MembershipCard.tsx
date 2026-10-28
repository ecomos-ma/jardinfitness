import {useId,useRef,useState} from 'react';
import {motion,useReducedMotion} from 'framer-motion';
import {Download,Printer,Radio,ScanLine} from 'lucide-react';
import {QRCodeSVG} from 'qrcode.react';
import type {CardFinish,Credential,Member,Plan,Subscription} from './types';
import {dateLabel,fullName} from './data';
import {Button,Modal} from './ui';

type Props={
  member:Member;
  finish?:CardFinish;
  membership?:Subscription;
  plan?:Plan;
  credential?:Credential;
  size?:'compact'|'standard'|'large';
  interactive?:boolean;
  controls?:boolean;
  showBack?:boolean;
  showQR?:boolean;
};

function downloadPng(svg:SVGSVGElement,filename:string):Promise<void>{
  return new Promise((resolve,reject)=>{
  const copy=svg.cloneNode(true) as SVGSVGElement;
  copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
  copy.setAttribute('width','1712');
  copy.setAttribute('height','1080');
  const source=new XMLSerializer().serializeToString(copy);
  const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));
  const img=new Image();
  img.onload=()=>{try{
    const canvas=document.createElement('canvas');canvas.width=1712;canvas.height=1080;
    const context=canvas.getContext('2d');
    if(!context)throw new Error('Canvas indisponible');
    context.drawImage(img,0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{
      URL.revokeObjectURL(url);
      if(!blob){reject(new Error('PNG indisponible'));return}
      const pngUrl=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=pngUrl;a.download=filename;document.body.appendChild(a);a.click();a.remove();
      window.setTimeout(()=>URL.revokeObjectURL(pngUrl),60000);
      resolve();
    },'image/png');
  }catch(error){URL.revokeObjectURL(url);reject(error)}};
  img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image PNG indisponible'))};
  img.src=url;
  });
}

export function MembershipCard({member,membership,plan,credential,finish=credential?.finish||'forest',size='standard',interactive=true,controls=false,showBack=false,showQR=false}:Props){
  const [back,setBack]=useState(showBack),[qrOpen,setQrOpen]=useState(false),[exportMessage,setExportMessage]=useState('');
  const reduced=useReducedMotion(),frontRef=useRef<SVGSVGElement>(null),backRef=useRef<SVGSVGElement>(null),shellRef=useRef<HTMLDivElement>(null);
  const uid=useId().replace(/:/g,'');
  const actualPlan=plan?.name||'Aucune formule';
  const credentialCode=credential?.code||member.id;
  const credentialActive=!credential||(credential.status==='active'&&credential.programmed!==false);
  const signature=plan?.name.toLowerCase().includes('signature');
  const tone=signature?'signature':'essential';
  const name=fullName(member);
  const planFont=actualPlan.length>21?18:23;
  const memberFont=name.length>26?32:39;

  function moveLight(event:React.PointerEvent<HTMLDivElement>){
    if(!interactive||reduced||!shellRef.current)return;
    const box=shellRef.current.getBoundingClientRect();
    shellRef.current.style.setProperty('--card-x',`${((event.clientX-box.left)/box.width)*100}%`);
    shellRef.current.style.setProperty('--card-y',`${((event.clientY-box.top)/box.height)*100}%`);
  }
  function printCard(){
    const front=frontRef.current?.outerHTML,reverse=backRef.current?.outerHTML;
    if(!front||!reverse)return;
    const sheet=document.createElement('div');
    sheet.className='membership-print-sheet';
    sheet.innerHTML=`<h1>JARDIN FITNESS · CARTE DE MEMBRE</h1><div class="membership-print-side"><span>RECTO</span>${front}</div><div class="membership-print-side"><span>VERSO</span>${reverse}</div>`;
    document.body.appendChild(sheet);
    const cleanup=()=>sheet.remove();
    window.addEventListener('afterprint',cleanup,{once:true});
    window.print();
    window.setTimeout(cleanup,120000);
  }
  const palette=finish==='nocturne'?['#283635','#182322','#0a1715']:finish==='olive'?['#4c5741','#2d3d30','#16291f']:signature?['#1b4938','#102f28','#0b211d']:['#173c31','#102b25','#0b211d'];
  const sharedDefs=<defs>
    <linearGradient id={`${uid}-surface`} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor={palette[0]}/><stop offset=".48" stopColor={palette[1]}/><stop offset="1" stopColor={palette[2]}/></linearGradient>
    <linearGradient id={`${uid}-foil`} x1="0" x2="1"><stop offset="0" stopColor="#a39168"/><stop offset=".45" stopColor="#eadbb1"/><stop offset="1" stopColor="#b7a374"/></linearGradient>
    <linearGradient id={`${uid}-light`} x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".1"/><stop offset=".42" stopColor="#ffffff" stopOpacity="0"/><stop offset="1" stopColor="#ffffff" stopOpacity=".03"/></linearGradient>
    <pattern id={`${uid}-grain`} width="16" height="16" patternUnits="userSpaceOnUse"><path d="M0 16L16 0" stroke="#f8f7f2" strokeOpacity=".015" strokeWidth="1"/></pattern>
  </defs>;
  const brand=<g><circle cx="76" cy="78" r="25" fill="none" stroke={`url(#${uid}-foil)`} strokeWidth="1.3"/><path d="M63 88c18-2 23-13 27-25-13 2-25 8-27 25Zm2-1c7-8 15-13 24-17" fill="none" stroke={`url(#${uid}-foil)`} strokeWidth="2" strokeLinecap="round"/><text x="118" y="77" fill="#f8f7f2" fontFamily="Georgia,serif" fontSize="31" letterSpacing="3">JARDIN FITNESS</text><text x="119" y="98" fill="#c9b78b" fontFamily="Arial,sans-serif" fontSize="10" letterSpacing="4">PRIVATE MEMBERSHIP</text></g>;
  const surface=<><rect width="856" height="540" rx="28" fill={`url(#${uid}-surface)`}/><rect width="856" height="540" rx="28" fill={`url(#${uid}-grain)`}/><rect width="856" height="540" rx="28" fill={`url(#${uid}-light)`}/><rect x="18" y="18" width="820" height="504" rx="18" fill="none" stroke={`url(#${uid}-foil)`} strokeOpacity=".64" strokeWidth="1.3"/><path d="M37 113h782M37 425h782" stroke="#c9b78b" strokeOpacity=".18" strokeWidth="1"/></>;
  return <div className={`membership-card-component membership-card-${size} membership-card-${tone}`}>
    <motion.div className="membership-card-shell" ref={shellRef} onPointerMove={moveLight} onPointerLeave={()=>{shellRef.current?.style.setProperty('--card-x','50%');shellRef.current?.style.setProperty('--card-y','50%')}} whileHover={interactive&&!reduced?{y:-5}:undefined} transition={{duration:.25}}>
      <motion.div className="membership-card-flipper" animate={{rotateY:back?180:0}} transition={reduced?{duration:0}:{duration:.62,ease:[.22,1,.36,1]}}>
        <div className="membership-card-face membership-card-front">
          <svg ref={frontRef} viewBox="0 0 856 540" role="img" aria-label={`Recto de la carte de ${name}`} xmlns="http://www.w3.org/2000/svg">
            {sharedDefs}{surface}{brand}
            <g fill="none" stroke="#c9b78b" strokeWidth="2.8" strokeLinecap="round" opacity=".8"><path d="M739 71c8 5 8 14 0 19M752 62c16 10 16 28 0 38M765 54c23 15 23 39 0 54"/></g>
            <g fill="none" stroke="#c9b78b" strokeOpacity={signature?'.23':'.16'} strokeWidth="1.4">
              <path d="M447 368c24-65 43-128 35-207M477 300c62-53 113-61 186-46M464 318c-54-48-101-54-142-44M480 221c40-31 52-66 66-94"/>
              <path d="M477 281c-34-17-43-42-42-67 28 13 46 34 42 67ZM502 270c10-34 37-47 68-51-11 30-35 48-68 51ZM423 274c-28 5-51-8-70-30 30-8 53 3 70 30ZM508 206c-9-31 4-56 27-75 12 29 3 54-27 75ZM552 258c18-26 45-30 72-25-18 25-41 33-72 25Z"/>
              <circle cx="478" cy="223" r="112" strokeOpacity=".22"/><circle cx="478" cy="223" r="140" strokeOpacity=".1"/>
            </g>
            <text x="70" y="379" fill="#c9b78b" fontFamily="Arial,sans-serif" fontSize="12" letterSpacing="4">MEMBER ACCESS</text>
            <text x="69" y="423" fill="#f8f7f2" fontFamily="Georgia,serif" fontSize={memberFont} textLength={name.length>24?460:undefined} lengthAdjust="spacingAndGlyphs">{name}</text>
            <text x="71" y="462" fill="#cbd7ca" fontFamily="Arial,sans-serif" fontSize="15" letterSpacing="2">ID {member.id.toUpperCase()}</text>
            <text x="785" y="385" fill="#c9b78b" fontFamily="Arial,sans-serif" textAnchor="end" fontSize="11" letterSpacing="3">VOTRE FORMULE</text>
            <text x="785" y="424" fill="#f8f7f2" fontFamily="Georgia,serif" textAnchor="end" fontSize={planFont}>{actualPlan}</text>
            <text x="785" y="462" fill="#c9b78b" fontFamily="Arial,sans-serif" textAnchor="end" fontSize="11" letterSpacing="2">JARDIN FITNESS</text>
          </svg>
        </div>
        <div className="membership-card-face membership-card-back">
          <svg ref={backRef} viewBox="0 0 856 540" role="img" aria-label={`Verso de la carte de ${name}`} xmlns="http://www.w3.org/2000/svg">
            {sharedDefs}{surface}{brand}
            <path d="M72 126h712" stroke="#c9b78b" strokeOpacity=".26"/>
            <rect x="70" y="157" width="226" height="226" rx="12" fill="#f8f7f2"/>
            <QRCodeSVG x={85} y={172} size={196} value={credentialCode} fgColor="#102b25" bgColor="#f8f7f2" level="M" marginSize={0}/>
            <text x="70" y="409" fill="#c9b78b" fontFamily="Arial,sans-serif" fontSize="12" letterSpacing="2">SCANNER POUR ACCÉDER</text>
            <text x="355" y="190" fill="#c9b78b" fontFamily="Arial,sans-serif" fontSize="11" letterSpacing="3">IDENTIFIANT MEMBRE</text>
            <text x="355" y="225" fill="#f8f7f2" fontFamily="Arial,sans-serif" fontSize="22" letterSpacing="1">{member.id.toUpperCase()}</text>
            <text x="355" y="275" fill="#c9b78b" fontFamily="Arial,sans-serif" fontSize="11" letterSpacing="3">FORMULE</text>
            <text x="355" y="309" fill="#f8f7f2" fontFamily="Georgia,serif" fontSize="24">{actualPlan}</text>
            <text x="355" y="355" fill="#c9b78b" fontFamily="Arial,sans-serif" fontSize="11" letterSpacing="3">EXPIRATION</text>
            <text x="355" y="388" fill="#f8f7f2" fontFamily="Arial,sans-serif" fontSize="19">{membership?dateLabel(membership.end):'—'}</text>
            <path d="M70 445h714" stroke="#c9b78b" strokeOpacity=".25"/>
            <text x="70" y="477" fill="#c9b78b" fontFamily="Arial,sans-serif" fontSize="12" letterSpacing="2">PRÉSENTEZ VOTRE CARTE À L’ACCUEIL</text>
            <text x="784" y="477" fill="#cbd7ca" fontFamily="Arial,sans-serif" fontSize="11" textAnchor="end">{credentialActive?'ACCÈS MEMBRE':'CARTE DÉSACTIVÉE'}</text>
          </svg>
        </div>
      </motion.div>
      <div className="membership-card-sheen" aria-hidden="true"/>
    </motion.div>
    {controls&&<div className="membership-card-controls">
      <div className="membership-side-switch" role="group" aria-label="Face de la carte"><button type="button" className={!back?'active':''} onClick={()=>setBack(false)}>Voir le recto</button><button type="button" className={back?'active':''} onClick={()=>setBack(true)}>Voir le verso</button></div>
      <div className="membership-card-actions"><Button variant="outline" onClick={()=>{setBack(true);setQrOpen(true)}}><ScanLine size={16}/> Afficher mon QR</Button><Button variant="outline" onClick={async()=>{const svg=back?backRef.current:frontRef.current;if(!svg)return;try{await downloadPng(svg,`jardin-fitness-${member.id}-${back?'verso':'recto'}.png`);setExportMessage('Image PNG créée.')}catch{setExportMessage('Le téléchargement a échoué.')}}}><Download size={16}/> Télécharger ma carte</Button><Button variant="outline" onClick={printCard}><Printer size={16}/> Imprimer ma carte</Button></div>
      {exportMessage&&<small className="membership-export-status" role="status">{exportMessage}</small>}
    </div>}
    {showQR&&!controls&&<button className="membership-qr-shortcut" type="button" onClick={()=>setQrOpen(true)}><Radio size={15}/> Afficher le QR</button>}
    <Modal open={qrOpen} onOpenChange={setQrOpen} title="Votre code d’accès"><div className="membership-qr-modal"><QRCodeSVG value={credentialCode} size={232} fgColor="#102b25" bgColor="#fff" marginSize={2}/><strong>{member.id.toUpperCase()}</strong><p>Présentez ce code à l’accueil. L’accès reste soumis à la validité de votre abonnement et de votre carte.</p></div></Modal>
  </div>;
}
