import {iso,today,uid} from './data';
import {recordAccess,validateAccess,type AccessResult} from './nfc';
import {generatePhysicalToken,validPhysicalToken} from './webNfc';
import type {AppData,Credential,Member,NfcEvent} from './types';

export type PendingNfcWrite={token:string;memberId:string;createdAt:string;writtenAt?:string};
export type PhysicalAccessResult=AccessResult&{attendanceRecorded?:boolean;duplicate?:boolean};
export type PhysicalNfcActions={
  createPhysicalClient:(input:{firstName:string;lastName:string;phone:string;email:string;planId:string;paid:boolean})=>string;
  preparePhysicalWrite:(memberId:string)=>PendingNfcWrite;
  confirmPhysicalWrite:(token:string)=>void;
  verifyPhysicalAssignment:(expectedToken:string,actualToken:string,memberId:string,serialNumber:string)=>AccessResult;
  readPhysicalCredential:(token:string)=>PhysicalAccessResult;
};
type Store={data:AppData};
type ClientOperations={addMember:(input:Omit<Member,'id'|'joinedAt'>)=>string;subscribe:(memberId:string,planId:string,method:string,confirmed:boolean)=>AccessResult};
type Set=(update:(state:Store)=>{data:AppData})=>void;
const event=(action:string,token:string,message:string,ok:boolean,memberId?:string,credentialId?:string):NfcEvent=>({id:uid('nfc-real'),at:iso(today()),action,code:token,message,ok,memberId,credentialId});
export function physicalNfcActions(set:Set,get:()=>Store&ClientOperations):PhysicalNfcActions{
  // Zustand updates memory before persistence. Roll back if localStorage rejects the write.
  const commit=(next:AppData)=>{
    const previous=get().data;
    try{
      set(()=>({data:next}));
      const stored=JSON.parse(window.localStorage.getItem('jardin-fitness-os-v2')||'null');
      if(JSON.stringify(stored?.state?.data)!==JSON.stringify(next))throw new Error('Persistence not confirmed');
    }catch{
      try{set(()=>({data:previous}))}catch{/* The memory rollback already happened. */}
      throw new Error('Enregistrement local impossible. Libérez du stockage et réessayez ; aucune attribution ni présence n’a été confirmée.');
    }
  };
  return{
    createPhysicalClient:input=>{
      const previous=get().data;
      if(!input.firstName.trim()||!input.lastName.trim()||!input.phone.trim()||!previous.plans.some(p=>p.id===input.planId&&p.active))throw new Error('Complétez le nom, le téléphone et une formule active.');
      try{
        const id=get().addMember({firstName:input.firstName.trim(),lastName:input.lastName.trim(),phone:input.phone.trim(),email:input.email.trim(),birthDate:'',consent:false,notes:'',source:'Test NFC physique'});
        const response=get().subscribe(id,input.planId,input.paid?'Carte':'Virement',input.paid);
        if(!response.ok)throw new Error(response.message);
        commit(get().data);
        return id;
      }catch(error){
        try{set(()=>({data:previous}))}catch{/* Restore memory even if storage is unavailable. */}
        throw error;
      }
    },
    preparePhysicalWrite:memberId=>{
      const d=get().data;
      if(!d.members.some(m=>m.id===memberId))throw new Error('Sélectionnez un client enregistré.');
      let token:string;
      do{token=generatePhysicalToken()}while(d.credentials.some(c=>c.code.toLowerCase()===token)||(d.pendingNfcWrites||[]).some(p=>p.token===token));
      const pending={token,memberId,createdAt:iso(today())};
      commit({...d,pendingNfcWrites:[pending,...(d.pendingNfcWrites||[]).filter(p=>p.memberId!==memberId)]});
      return pending;
    },
    confirmPhysicalWrite:token=>{
      const d=get().data,pending=d.pendingNfcWrites?.find(p=>p.token===token);
      if(!pending)throw new Error('Préparation d’écriture introuvable. Recommencez l’écriture.');
      commit({...d,pendingNfcWrites:d.pendingNfcWrites!.map(p=>p.token===token?{...p,writtenAt:iso(today())}:p),nfcEvents:[event('Écriture NFC physique',token,'Écriture terminée · vérification requise',true,pending.memberId),...(d.nfcEvents||[])]});
    },
    verifyPhysicalAssignment:(expectedToken,actualToken,memberId,serialNumber)=>{
      const d=get().data,pending=d.pendingNfcWrites?.find(p=>p.token===expectedToken&&p.memberId===memberId);
      const deny=(message:string):AccessResult=>{
        commit({...d,nfcEvents:[event('Vérification NFC physique',actualToken,message,false),...(d.nfcEvents||[])]});
        return{ok:false,message};
      };
      if(!pending?.writtenAt)return deny('Aucune écriture physique terminée à vérifier pour ce client.');
      if(!validPhysicalToken(actualToken)||actualToken!==expectedToken)return deny('La carte lue ne correspond pas à la carte écrite pour ce client. Aucune attribution enregistrée.');
      if(!d.members.some(m=>m.id===memberId))return deny('Le client n’existe plus.');
      if(d.credentials.some(c=>c.code.toLowerCase()===actualToken))return deny('Cet identifiant possède déjà une attribution.');
      if(serialNumber&&d.credentials.some(c=>c.physicalSerial===serialNumber&&c.memberId!==memberId&&c.status==='active'))return deny('Ce support est déjà attribué à un autre client. Révoquez son ancienne attribution avant de réessayer.');
      const at=iso(today()),card:Credential={id:uid('physical-card'),memberId,code:actualToken,kind:'NFC',status:'active',programmed:true,issuedAt:at,writtenAt:pending.writtenAt,physicalVerifiedAt:at,physicalSerial:serialNumber||undefined,finish:'forest'};
      // Where available, a serial prevents two active assignments to a rewritten support.
      const credentials=d.credentials.map(c=>serialNumber&&c.physicalSerial===serialNumber&&c.status==='active'?{...c,status:'revoked' as const}:c);
      commit({...d,credentials:[card,...credentials],pendingNfcWrites:d.pendingNfcWrites!.filter(p=>p.token!==expectedToken),nfcEvents:[event('Vérification NFC physique',actualToken,'Carte vérifiée et attribuée',true,memberId,card.id),...(d.nfcEvents||[])],audit:[{id:uid('audit'),at,action:'Carte NFC physique vérifiée',detail:memberId},...d.audit]});
      return{ok:true,message:'Carte vérifiée et attribuée',memberId,credentialId:card.id,code:actualToken,at};
    },
    readPhysicalCredential:token=>{
      const d=get().data,c=d.credentials.find(c=>c.code===token&&!!c.physicalVerifiedAt);
      if(!validPhysicalToken(token)||!c){
        const message=d.pendingNfcWrites?.some(p=>p.token===token)?'Carte écrite mais non vérifiée. Terminez la vérification avant tout accès.':'Carte inconnue de ce navigateur : aucune attribution physique vérifiée sur cette adresse.';
        commit({...d,nfcEvents:[event('Lecture NFC physique',token,message,false),...(d.nfcEvents||[])]});
        return{ok:false,message,at:iso(today())};
      }
      const outcome=recordAccess(d,token);
      outcome.data.nfcEvents![0].action='Lecture NFC physique';
      const entitlement=validateAccess(d,token,{manual:false,attendance:false});
      const duplicate=entitlement.ok&&!outcome.result.ok;
      const result:PhysicalAccessResult=duplicate?{...entitlement,duplicate:true,attendanceRecorded:false,message:'Abonnement valide · passage déjà enregistré depuis moins de 10 minutes.'}:{...outcome.result,attendanceRecorded:outcome.result.ok};
      outcome.data.nfcEvents![0]={...outcome.data.nfcEvents![0],ok:result.ok,message:result.message};
      commit(outcome.data);
      return result;
    },
  };
}
