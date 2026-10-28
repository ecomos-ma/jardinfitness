import {activeSubscription,currentSubscription,fullName,iso,today,uid} from './data';
import type {AppData,CardFinish,Credential,Member,NfcEvent,Payment} from './types';

export type AccessResult={ok:boolean;message:string;memberId?:string;credentialId?:string;subscriptionId?:string;at?:string;code?:string};
export type Enrollment=Omit<Member,'id'|'joinedAt'|'birthDate'|'consent'|'notes'|'source'>&{planId:string;start:string;end:string;paymentStatus:'confirmed'|'pending'};
export type NfcActions={
  enrollMember:(input:Enrollment)=>AccessResult;
  createBlankCard:()=>Credential;
  writeCard:(id:string,memberId:string,finish:CardFinish)=>AccessResult;
  reassignCard:(id:string,memberId:string)=>AccessResult;
  saveCardFinish:(id:string,finish:CardFinish)=>void;
  inspectCard:(code:string,mode:'read'|'verify')=>AccessResult;
  scanCard:(code:string)=>AccessResult;
};
type Store={data:AppData};
type Set=(update:(state:Store)=>{data:AppData})=>void;
const log=(action:string,message:string,ok:boolean,code:string,credentialId?:string,memberId?:string):NfcEvent=>({id:uid('nfc'),at:iso(today()),action,message,ok,code,credentialId,memberId});

// One access decision for both the existing reception and the virtual Studio.
export function validateAccess(d:AppData,code:string,options={manual:false,attendance:true}):AccessResult{
  const value=code.trim().toLowerCase();
  const c=d.credentials.find(x=>x.code.toLowerCase()===value);
  const m=d.members.find(x=>x.id===c?.memberId||(!c&&options.manual&&x.id.toLowerCase()===value));
  const sub=m?activeSubscription(d,m.id):undefined;
  const result={memberId:m?.id,credentialId:c?.id,subscriptionId:sub?.id,code,at:iso(today())};
  const deny=(message:string)=>({...result,ok:false,message});
  if(!c&&!m)return deny('Carte inconnue');
  if(c?.status==='revoked')return deny('Carte révoquée');
  if(c?.status==='lost')return deny('Carte déclarée perdue');
  if(c?.programmed===false||!m)return deny('Carte non attribuée ou non programmée');
  if(!sub){
    const latest=currentSubscription(d,m.id);
    if(!latest)return deny('Aucun abonnement');
    if(latest.status==='suspended')return deny('Abonnement suspendu');
    if(latest.status==='expired'||new Date(latest.end)<today())return deny('Abonnement expiré');
    if(latest.status==='pending'||(latest.paymentId&&d.payments.find(p=>p.id===latest.paymentId)?.status!=='confirmed'))return deny('Paiement en attente ou annulé');
    if(new Date(latest.start)>today())return deny('Abonnement pas encore commencé');
    return deny('Abonnement non valide');
  }
  // A renewal is a new entitlement. It must not be blocked by a visit on the old one.
  if(options.attendance&&d.checkIns.some(x=>x.memberId===m.id&&x.decision==='accepted'&&
    (x.subscriptionId?x.subscriptionId===sub.id:new Date(x.at)>=new Date(sub.start))&&
    today().getTime()-new Date(x.at).getTime()>=0&&today().getTime()-new Date(x.at).getTime()<600000))return deny('Passage déjà enregistré récemment (10 minutes)');
  return {...result,ok:true,message:`Bienvenue, ${m.firstName}`};
}

export function recordAccess(d:AppData,code:string,manual=false):{data:AppData;result:AccessResult}{
  const r=validateAccess(d,code,{manual,attendance:true});
  const at=r.at!;
  return {result:r,data:{...d,
    credentials:d.credentials.map(c=>c.id===r.credentialId?{...c,lastScanAt:at}:c),
    checkIns:[{id:uid('visit'),memberId:r.memberId||'inconnu',credentialId:r.credentialId,subscriptionId:r.subscriptionId,at,decision:r.ok?'accepted':'denied',reason:r.message},...d.checkIns],
    loyalty:r.ok&&r.memberId?[{id:uid('points'),memberId:r.memberId,points:10,label:'Visite au club',at},...d.loyalty]:d.loyalty,
    nfcEvents:[log(manual?'Contrôle à l’accueil':'Scan virtuel',r.message,r.ok,code,r.credentialId,r.memberId),...(d.nfcEvents||[])],
    audit:[{id:uid('audit'),at,action:'Contrôle d’accès',detail:r.message},...d.audit]}};
}

export function nfcActions(set:Set,get:()=>Store):NfcActions{
  return {
    enrollMember:input=>{
      const d=get().data,plan=d.plans.find(p=>p.id===input.planId&&p.active);
      if(!input.firstName.trim()||!input.lastName.trim()||!input.phone.trim()||!/^\S+@\S+\.\S+$/.test(input.email.trim()))return{ok:false,message:'Complétez les coordonnées du membre.'};
      if(!plan||!Number.isFinite(Date.parse(input.start))||!Number.isFinite(Date.parse(input.end))||input.end<input.start)return{ok:false,message:'Vérifiez la formule et les dates.'};
      const id=uid('m'),at=iso(today()),paymentId=uid('pay');
      const member:Member={id,firstName:input.firstName.trim(),lastName:input.lastName.trim(),phone:input.phone.trim(),email:input.email.trim(),joinedAt:at,birthDate:'',consent:false,notes:'',source:'Studio NFC'};
      const payment:Payment={id:paymentId,memberId:id,amount:plan.price,method:input.paymentStatus==='confirmed'?'Carte':'Virement',status:input.paymentStatus,kind:'membership',at,reference:`JF-${paymentId}`};
      set(s=>({data:{...s.data,members:[member,...s.data.members],payments:[payment,...s.data.payments],
        subscriptions:[{id:uid('sub'),memberId:id,planId:plan.id,start:iso(new Date(input.start+'T00:00:00')),end:iso(new Date(input.end+'T23:59:59')),status:input.paymentStatus==='confirmed'?'active':'pending',paymentId},...s.data.subscriptions],
        loyalty:[{id:uid('loy'),memberId:id,points:0,label:'Bienvenue',at},...s.data.loyalty],
        audit:[{id:uid('audit'),at,action:'Membre créé · Studio NFC',detail:fullName(member)},...s.data.audit]}}));
      return{ok:true,message:'Membre et abonnement créés',memberId:id};
    },
    createBlankCard:()=>{
      const d=get().data;let code:string;
      do{code=`JF-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`.toUpperCase()}while(d.credentials.some(c=>c.code.toUpperCase()===code));
      const card:Credential={id:`card-${code.slice(3).toLowerCase()}`,code,memberId:'',kind:'NFC',status:'active',programmed:false,issuedAt:iso(today()),finish:'forest'};
      set(s=>({data:{...s.data,credentials:[card,...s.data.credentials],nfcEvents:[log('Carte créée','Support vierge disponible',true,code,card.id),...(s.data.nfcEvents||[])]}}));return card;
    },
    writeCard:(id,memberId,finish)=>{
      const d=get().data,c=d.credentials.find(x=>x.id===id);
      if(!c||c.status!=='active'||c.programmed!==false)return{ok:false,message:'Cette carte ne peut plus être programmée.'};
      if(!d.members.some(m=>m.id===memberId))return{ok:false,message:'Membre introuvable'};
      if(c.memberId&&c.memberId!==memberId)return{ok:false,message:'Cette carte est réservée à un autre membre.'};
      set(s=>({data:{...s.data,credentials:s.data.credentials.map(x=>x.id===id?{...x,memberId,finish,programmed:true,writtenAt:iso(today())}:x),nfcEvents:[log('Écriture virtuelle','Carte programmée avec succès',true,c.code,id,memberId),...(s.data.nfcEvents||[])],audit:[{id:uid('audit'),at:iso(today()),action:'Carte programmée',detail:`${memberId} · ${c.code}`},...s.data.audit]}}));
      return{ok:true,message:'Carte programmée avec succès',memberId,credentialId:id,code:c.code};
    },
    reassignCard:(id,memberId)=>{
      const d=get().data,c=d.credentials.find(x=>x.id===id);
      if(!c||c.programmed!==false||c.status!=='active')return{ok:false,message:'Seule une carte vierge peut changer d’attribution.'};
      if(memberId&&!d.members.some(m=>m.id===memberId))return{ok:false,message:'Membre introuvable'};
      set(s=>({data:{...s.data,credentials:s.data.credentials.map(x=>x.id===id?{...x,memberId}:x),nfcEvents:[log('Attribution modifiée',memberId?'Carte réservée au membre':'Carte libérée',true,c.code,id,memberId),...(s.data.nfcEvents||[])]}}));
      return{ok:true,message:'Attribution enregistrée',memberId};
    },
    saveCardFinish:(id,finish)=>set(s=>({data:{...s.data,credentials:s.data.credentials.map(c=>c.id===id?{...c,finish}:c)}})),
    inspectCard:(code,mode)=>{
      const d=get().data,c=d.credentials.find(x=>x.code===code);
      const r=mode==='verify'?validateAccess(d,code,{manual:false,attendance:false}):{ok:!!c,message:c?'Identifiant lu dans le registre local':'Carte inconnue',memberId:c?.memberId,credentialId:c?.id,code};
      set(s=>({data:{...s.data,nfcEvents:[log(mode==='verify'?'Vérification':'Lecture virtuelle',r.message,r.ok,code,c?.id,c?.memberId),...(s.data.nfcEvents||[])]}}));return r;
    },
    scanCard:code=>{const outcome=recordAccess(get().data,code);set(()=>({data:outcome.data}));return outcome.result},
  };
}
