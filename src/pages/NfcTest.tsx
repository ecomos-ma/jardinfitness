import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {CheckCircle2,ChevronRight,CreditCard,Leaf,LockKeyhole,Nfc,Radio,ShieldCheck,Smartphone,UserPlus,XCircle} from 'lucide-react';
import {useApp} from '../store';
import {activeSubscription,currentSubscription,dateLabel,fullName,money} from '../data';
import {PhysicalNfcDevice,nfcError} from '../webNfc';
import type {PhysicalAccessResult} from '../physicalNfcStore';
import {Badge,Button,Card,Field,Modal,PageHead} from '../ui';
import '../styles-nfc-test.css';

type Operation='idle'|'writing'|'verifying'|'reading';
export function NfcTest(){
  const d=useApp(s=>s.data),[memberId,setMemberId]=useState(''),[search,setSearch]=useState(''),[create,setCreate]=useState(false);
  const [operation,setOperation]=useState<Operation>('idle'),[message,setMessage]=useState(''),[error,setError]=useState(''),[result,setResult]=useState<PhysicalAccessResult>();
  const [permission,setPermission]=useState('À demander'),[visible,setVisible]=useState(document.visibilityState==='visible'),[ready,setReady]=useState(false),[overwrite,setOverwrite]=useState(false);
  const device=useRef<PhysicalNfcDevice|null>(null),generation=useRef(0),mounted=useRef(true);
  const pending=d.pendingNfcWrites?.find(p=>p.memberId===memberId),member=d.members.find(m=>m.id===memberId);
  const secure=window.isSecureContext&&window.location.protocol==='https:',supported=typeof window.NDEFReader==='function',topLevel=window.self===window.top;
  const busy=operation!=='idle',hardwareReady=secure&&supported&&topLevel&&visible&&ready;
  const resultMember=d.members.find(m=>m.id===result?.memberId),sub=resultMember&&(activeSubscription(d,resultMember.id)||currentSubscription(d,resultMember.id)),plan=d.plans.find(p=>p.id===sub?.planId);
  const days=sub?Math.max(0,Math.ceil((new Date(sub.end).getTime()-Date.now())/86400000)):0;
  const matches=d.members.filter(m=>`${fullName(m)} ${m.phone} ${m.id}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(()=>{
    mounted.current=true;device.current=new PhysicalNfcDevice();
    const stop=()=>{generation.current++;device.current?.cancel();setOperation('idle');setMessage('');setError('Opération interrompue : gardez cette page visible et le téléphone déverrouillé, puis recommencez.')};
    const visibility=()=>{setVisible(document.visibilityState==='visible');if(document.visibilityState!=='visible')stop()};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',stop);
    let permissionStatus:PermissionStatus|undefined;
    if(navigator.permissions&&secure&&supported){
      navigator.permissions.query({name:'nfc' as PermissionName}).then(status=>{
        if(!mounted.current)return;
        permissionStatus=status;
        const refresh=()=>setPermission(status.state==='granted'?'Accordée':status.state==='denied'?'Refusée dans Chrome':'À demander lors du geste NFC');
        refresh();status.onchange=refresh;
      }).catch(()=>{if(mounted.current)setPermission('Vérifiée par Chrome au lancement')});
    }
    return()=>{mounted.current=false;generation.current++;device.current?.cancel();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',stop);if(permissionStatus)permissionStatus.onchange=null};
  },[secure,supported]);

  function start(kind:Operation){
    if(busy||!hardwareReady||!device.current)return null;
    setOperation(kind);setError('');setResult(undefined);setMessage('Approchez votre carte du téléphone');
    return ++generation.current;
  }
  function current(id:number){return mounted.current&&generation.current===id}
  function cancel(){generation.current++;device.current?.cancel();setOperation('idle');setMessage('');setError('Opération annulée. Une éventuelle écriture doit toujours être vérifiée séparément.')}
  async function write(){
    const id=start('writing');if(id===null)return;
    try{
      const prepared=useApp.getState().preparePhysicalWrite(memberId);
      await device.current!.write(prepared.token,overwrite);
      if(!current(id))return;
      useApp.getState().confirmPhysicalWrite(prepared.token);
      setMessage('Écriture terminée');
    }catch(err){if(current(id)){setError(nfcError(err));setMessage('')}}
    finally{if(current(id))setOperation('idle')}
  }
  async function verify(){
    if(!pending?.writtenAt)return;
    const expected={...pending},id=start('verifying');if(id===null)return;
    try{
      const actual=await device.current!.read(()=>{if(current(id))setMessage('Vérification en attente : présentez de nouveau la carte écrite.')});
      if(!current(id))return;
      const response=useApp.getState().verifyPhysicalAssignment(expected.token,actual.token,expected.memberId,actual.serialNumber);
      if(response.ok)setMessage(response.message);else{setMessage('');setError(response.message)}
    }catch(err){if(current(id)){setError(nfcError(err));setMessage('')}}
    finally{if(current(id))setOperation('idle')}
  }
  async function read(){
    const id=start('reading');if(id===null)return;
    try{
      const actual=await device.current!.read(()=>{if(current(id))setMessage('Lecture démarrée. En attente d’une carte physique…')});
      if(!current(id))return;
      setResult(useApp.getState().readPhysicalCredential(actual.token));setMessage('');
    }catch(err){if(current(id)){setError(nfcError(err));setMessage('')}}
    finally{if(current(id))setOperation('idle')}
  }

  return <div className="physical-nfc"><PageHead eyebrow="JARDIN FITNESS · WEB NFC" title="Test NFC" description="Écrire, vérifier et lire une vraie carte, depuis votre téléphone Android." actions={<Badge tone="gold"><Smartphone size={13}/> NFC physique</Badge>}/>
    <section className="physical-nfc-banner"><div className="physical-nfc-emblem"><Nfc size={35} strokeWidth={1.2}/></div><div><span>UNE CARTE RÉELLE. UNE IDENTITÉ VÉRIFIÉE.</span><h2>Le geste devient accès.</h2><p>Aucun résultat ne s’affiche sans une réponse NFC du téléphone.</p></div><Leaf size={47} strokeWidth={1}/></section>
    <Card className="physical-device-check"><div className="physical-section-title"><h2>Avant le premier contact</h2><ShieldCheck size={20}/></div><div className="physical-check-grid">
      <div><span>Connexion sécurisée</span><strong className={secure?'good':'bad'}>{secure?'HTTPS actif':'HTTPS requis'}</strong></div>
      <div><span>Web NFC</span><strong className={supported?'good':'bad'}>{supported?'API disponible · matériel à tester':'Indisponible sur ce navigateur'}</strong></div>
      <div><span>Autorisation NFC</span><strong>{permission}</strong></div>
      <div><span>Page ouverte directement</span><strong className={topLevel&&visible?'good':'bad'}>{!topLevel?'Ouvrir hors iframe':visible?'Page visible':'Page masquée'}</strong></div>
    </div>{(!secure||!supported||!topLevel)&&<div className="physical-device-error" role="alert">{!secure?<p>Cette adresse HTTP ne permet pas le test NFC. Après le déploiement Vercel, ouvrez <strong>https://votre-domaine/nfc-test</strong> dans Chrome sur Android.</p>:!supported?<p>Ce navigateur n’expose pas Web NFC. Ouvrez cette page dans Chrome sur un téléphone Android équipé du NFC. Aucun lecteur virtuel ne remplace le matériel.</p>:<p>Ouvrez la page directement dans Chrome, en dehors de tout aperçu intégré.</p>}</div>}
    <label className="physical-ready"><input type="checkbox" checked={ready} onChange={e=>setReady(e.target.checked)} disabled={busy}/><span>J’ai activé le NFC dans Android, déverrouillé le téléphone et préparé une carte NDEF réinscriptible.</span></label><p className="physical-small">Le navigateur ne peut pas contrôler directement l’interrupteur NFC, le verrouillage ou le format d’une carte absente. Le format est validé lors du contact. Gardez Chrome visible et la carte immobile contre l’antenne.</p></Card>
    <div className="physical-workspace"><Card className="physical-identity"><div className="physical-section-title"><div><span className="physical-overline">01 · CLIENT</span><h2>Choisir son identité.</h2></div><UserPlus size={23}/></div><Button variant="outline" onClick={()=>setCreate(true)} disabled={busy}><UserPlus size={16}/> Créer un client</Button><Field label="Rechercher un client"><input value={search} onChange={e=>setSearch(e.target.value)} disabled={busy} placeholder="Nom, téléphone ou identifiant"/></Field><Field label="Client à associer"><select value={memberId} onChange={e=>{setMemberId(e.target.value);setMessage('');setError('');setResult(undefined)}} disabled={busy}><option value="">Sélectionner un client</option>{d.members.filter(m=>m.id===memberId||matches.includes(m)).map(m=><option key={m.id} value={m.id}>{fullName(m)} · {m.id}</option>)}</select></Field>{member?<div className="physical-client"><div className="physical-initials">{member.firstName[0]}{member.lastName[0]}</div><div><strong>{fullName(member)}</strong><span>{member.phone}</span><small>{member.id}</small></div><Link to={`/members/${member.id}`} aria-label="Ouvrir le dossier membre"><ChevronRight size={18}/></Link></div>:<p className="physical-small">Créez un client ou sélectionnez son dossier existant avant l’écriture.</p>}<div className="physical-local-note"><LockKeyhole size={16}/><p>Les dossiers et attributions sont enregistrés dans ce navigateur, sur cette adresse. Les données de votre ordinateur ne sont pas automatiquement présentes sur votre téléphone.</p></div></Card>
    <div className="physical-operations"><Card><div className="physical-section-title"><div><span className="physical-overline">02 · ÉCRITURE & VÉRIFICATION</span><h2>Écrire une carte NFC</h2></div><CreditCard size={23}/></div><p>Seul un jeton aléatoire et versionné est inscrit sur la carte. Aucune coordonnée personnelle.</p><label className="physical-ready"><input type="checkbox" checked={overwrite} onChange={e=>setOverwrite(e.target.checked)} disabled={busy}/><span>Autoriser le remplacement du contenu déjà présent sur la carte.</span></label>{overwrite&&<p className="physical-overwrite">Le contenu NDEF existant sera écrasé. Utilisez uniquement une carte destinée à ce test.</p>}<div className="physical-actions"><Button onClick={write} disabled={busy||!hardwareReady||!member}><Radio size={16}/> Écrire NFC</Button><Button variant="outline" onClick={verify} disabled={busy||!hardwareReady||!pending?.writtenAt}><ShieldCheck size={16}/> Vérifier</Button></div>{pending?.writtenAt&&<div className="physical-verify-next"><CheckCircle2 size={19}/><div><strong>Écriture terminée</strong><p>Retirez la carte. Cliquez sur « Vérifier », puis présentez à nouveau la même carte. L’attribution n’est pas encore enregistrée.</p></div></div>}<p className="physical-small">Une nouvelle écriture remplace la préparation précédente de ce client. Si l’écriture réussit mais que la page est interrompue avant sa confirmation, recommencez avec l’écrasement autorisé puis vérifiez.</p></Card>
    <Card><div className="physical-section-title"><div><span className="physical-overline">03 · ACCÈS AU CLUB</span><h2>Lire une carte NFC</h2></div><Nfc size={24}/></div><p>Le client est identifié uniquement à partir du jeton réellement lu sur la carte.</p><Button onClick={read} disabled={busy||!hardwareReady}><Nfc size={17}/> Lire NFC</Button></Card></div></div>
    {(busy||message||error)&&<Card className={`physical-operation-status ${error?'is-error':''}`} role="status" aria-live="polite">{error?<XCircle size={26}/>:busy?<Radio size={26}/>:<CheckCircle2 size={26}/>}<div><strong>{error||message}</strong>{busy&&<p>{operation==='writing'?'Attente de la confirmation matérielle d’écriture.':'Le démarrage du lecteur ne signifie pas qu’une carte a été lue.'}</p>}{message==='Carte vérifiée et attribuée'&&<p>{member?fullName(member):''} · attribution enregistrée. Retirez la carte, puis cliquez sur « Lire NFC ».</p>}</div>{busy&&<Button variant="outline" onClick={cancel}>Annuler</Button>}</Card>}
    {result&&<section className={`physical-access ${result.ok?'granted':'denied'}`} role="status" aria-live="polite">{result.ok?<CheckCircle2 size={35}/>:<XCircle size={35}/>}<div className="physical-access-body"><span>RÉSULTAT DE LA LECTURE PHYSIQUE</span><h2>{result.ok?'ACCÈS AUTORISÉ':'ACCÈS REFUSÉ'}</h2><p>{result.message}</p>{resultMember&&<><h3>{fullName(resultMember)}</h3><dl><div><dt>Abonnement</dt><dd>{plan?.name||'Aucun'}</dd></div><div><dt>Téléphone</dt><dd>{resultMember.phone}</dd></div><div><dt>Identifiant membre</dt><dd>{resultMember.id}</dd></div><div><dt>Expiration</dt><dd>{sub?dateLabel(sub.end):'—'}</dd></div><div><dt>Jours restants</dt><dd>{days}</dd></div><div><dt>Lecture</dt><dd>{result.at?new Date(result.at).toLocaleTimeString('fr-MA'):'—'}</dd></div></dl><Link to={`/members/${resultMember.id}`}>Ouvrir le dossier membre <ChevronRight size={14}/></Link></>}<strong className="physical-attendance">{result.attendanceRecorded?'Présence enregistrée dans le club.':result.duplicate?'Aucun doublon : la présence récente est conservée.':'Aucune présence acceptée ajoutée.'}</strong></div></section>}
    <details className="physical-checklist"><summary>Checklist du test physique</summary><ol><li>Sur Android Chrome, ouvrez l’adresse HTTPS Vercel et activez le NFC.</li><li>Créez le client avec son abonnement, puis sélectionnez-le.</li><li>Cliquez sur « Écrire NFC », autorisez Chrome et présentez une carte NDEF réinscriptible. Attendez « Écriture terminée ».</li><li>Retirez la carte. Cliquez sur « Vérifier », puis touchez de nouveau la carte. Attendez « Carte vérifiée et attribuée ».</li><li>Retirez-la, cliquez sur « Lire NFC » et présentez-la. Vérifiez le nom, le téléphone, l’abonnement et le résultat vert.</li><li>Rechargez cette même adresse et lisez la carte à nouveau. Une relecture sous dix minutes identifie le membre sans doubler sa présence.</li><li>Dans le dossier membre, expirez ou suspendez l’abonnement. Revenez lire la même carte : le résultat doit être rouge. Renouvelez et relisez pour rétablir l’accès.</li></ol><p>La validation matérielle reste à confirmer par vous sur votre téléphone et votre carte.</p></details>
    <Modal open={create} onOpenChange={setCreate} title="Créer un client"><CreateClient onCreated={id=>{setMemberId(id);setSearch('');setCreate(false);setMessage('Client et abonnement enregistrés.');setError('');setResult(undefined)}}/></Modal>
  </div>;
}

function CreateClient({onCreated}:{onCreated:(id:string)=>void}){
  const plans=useApp(s=>s.data.plans),[firstName,setFirstName]=useState(''),[lastName,setLastName]=useState(''),[phone,setPhone]=useState(''),[email,setEmail]=useState(''),[planId,setPlanId]=useState('month-gym'),[paid,setPaid]=useState(true),[error,setError]=useState('');
  function save(e:React.FormEvent){
    e.preventDefault();
    if(!firstName.trim()||!lastName.trim()||!phone.trim()||!plans.some(p=>p.id===planId&&p.active)){setError('Complétez le nom, le téléphone et une formule active.');return}
    try{
      const id=useApp.getState().createPhysicalClient({firstName,lastName,phone,email,planId,paid});
      onCreated(id);
    }catch{setError('Impossible d’enregistrer le dossier localement. Vérifiez le stockage du navigateur avant de continuer.')}
  }
  return <form className="physical-client-form" onSubmit={save}><Field label="Prénom"><input required value={firstName} onChange={e=>setFirstName(e.target.value)} autoComplete="given-name"/></Field><Field label="Nom"><input required value={lastName} onChange={e=>setLastName(e.target.value)} autoComplete="family-name"/></Field><Field label="Téléphone"><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} autoComplete="tel"/></Field><Field label="E-mail (facultatif)"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email"/></Field><Field label="Abonnement"><select value={planId} onChange={e=>setPlanId(e.target.value)}>{plans.filter(p=>p.active).map(p=><option key={p.id} value={p.id}>{p.name} · {money(p.price)}</option>)}</select></Field><Field label="Paiement"><select value={paid?'paid':'pending'} onChange={e=>setPaid(e.target.value==='paid')}><option value="paid">Payé · Carte</option><option value="pending">En attente · Virement</option></select></Field><p>L’abonnement commence aujourd’hui pour la durée de la formule. Un paiement en attente bloque l’accès jusqu’à sa confirmation.</p>{error&&<p role="alert">{error}</p>}<Button type="submit">Enregistrer le client</Button></form>;
}
