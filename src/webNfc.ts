/** Browser Web NFC adapter. No timers, emulation, or fallback reader. */
export type NdefRecord={recordType:string;encoding?:string;data?:DataView};
export type NdefReading=Event&{message:{records:readonly NdefRecord[]};serialNumber?:string};
export interface NdefReader extends EventTarget{
  scan(options:{signal:AbortSignal}):Promise<void>;
  write(message:{records:{recordType:'text';data:string;lang:string;encoding:'utf-8'}[]},options:{signal:AbortSignal;overwrite:boolean}):Promise<void>;
}
declare global{interface Window{NDEFReader?:new()=>NdefReader}}
export const TOKEN_PREFIX='jardin:nfc:v1:';
export function validPhysicalToken(token:string){return /^jardin:nfc:v1:[0-9a-f]{64}$/.test(token)}
export function generatePhysicalToken(){
  const bytes=new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return TOKEN_PREFIX+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export function decodeCredential(records:readonly NdefRecord[]):string{
  if(records.length!==1||records[0].recordType!=='text'||!records[0].data)throw new Error('Format de carte incompatible : un seul enregistrement NDEF texte Jardin est attendu.');
  const record=records[0];
  let text:string;
  try{
    let encoding=(record.encoding||'utf-8').toLowerCase();
    if(encoding==='utf-16'){
      // NDEF uses big endian without a BOM; TextDecoder("utf-16") defaults to LE.
      const data=record.data!;
      encoding=data.byteLength>=2&&data.getUint8(0)===0xff&&data.getUint8(1)===0xfe?'utf-16le':'utf-16be';
    }
    text=new TextDecoder(encoding,{fatal:true}).decode(record.data);
  }catch{throw new Error('Le texte NDEF est illisible ou son encodage n’est pas pris en charge.')}
  if(text.startsWith('jardin:nfc:')&&!text.startsWith(TOKEN_PREFIX))throw new Error('Version de carte Jardin non prise en charge.');
  if(!validPhysicalToken(text))throw new Error('Cette carte ne contient pas un identifiant NFC Jardin valide.');
  return text;
}
export function nfcError(error:unknown):string{
  const name=error instanceof Error?error.name:'';
  switch(name){
    case 'NotAllowedError':return 'Accès NFC refusé, ou carte déjà remplie protégée contre l’écrasement. Vérifiez l’autorisation NFC de ce site dans Chrome. Pour remplacer le contenu d’une carte, cochez l’autorisation d’écrasement.';
    case 'SecurityError':return 'Web NFC exige une page HTTPS ouverte directement dans Chrome, hors iframe, avec votre autorisation.';
    case 'NotSupportedError':return 'NFC indisponible ou carte incompatible. Utilisez Chrome sur Android avec NFC activé et une carte NDEF réinscriptible.';
    case 'NotReadableError':return 'Impossible d’accéder au lecteur. Activez le NFC Android, déverrouillez le téléphone et fermez les autres applications NFC.';
    case 'NetworkError':return 'Échange NFC interrompu ou écriture impossible. Maintenez la carte contre l’antenne et vérifiez qu’elle est NDEF, réinscriptible et dispose de place.';
    case 'AbortError':return 'Opération annulée. Aucun succès NFC n’a été confirmé.';
    case 'InvalidStateError':return 'Une opération NFC est déjà en cours. Annulez-la avant de recommencer.';
    case 'InvalidModificationError':return 'Carte non réinscriptible ou capacité insuffisante. Essayez une carte NDEF réinscriptible.';
    default:return error instanceof Error?error.message:'Erreur NFC. Réessayez avec une carte NDEF compatible.';
  }
}
export function createBrowserReader():NdefReader{
  if(!window.isSecureContext||window.location.protocol!=='https:')throw new DOMException('HTTPS requis','SecurityError');
  if(window.self!==window.top)throw new DOMException('Ouvrez la page directement','SecurityError');
  if(!window.NDEFReader)throw new DOMException('Web NFC indisponible','NotSupportedError');
  if(document.visibilityState!=='visible')throw new DOMException('Gardez la page visible','NotReadableError');
  return new window.NDEFReader();
}

export class PhysicalNfcDevice{
  private active?:AbortController;
  constructor(private readonly createReader:()=>NdefReader=createBrowserReader){}
  cancel(){this.active?.abort()}
  private begin(){
    if(this.active)throw new DOMException('Opération NFC en cours','InvalidStateError');
    const reader=this.createReader(),controller=new AbortController();
    this.active=controller;
    return {reader,controller};
  }
  async write(token:string,overwrite=false):Promise<void>{
    if(!validPhysicalToken(token))throw new Error('Identifiant à écrire invalide.');
    const {reader,controller}=this.begin();
    try{
      await reader.write({records:[{recordType:'text',data:token,lang:'en',encoding:'utf-8'}]},{signal:controller.signal,overwrite});
      // A late promise resolution after cancellation must never report success.
      if(controller.signal.aborted)throw new DOMException('Écriture annulée','AbortError');
    }finally{controller.abort();if(this.active===controller)this.active=undefined}
  }
  read(onListening?:()=>void):Promise<{token:string;serialNumber:string}>{
    let operation:ReturnType<PhysicalNfcDevice['begin']>;
    try{operation=this.begin()}catch(error){return Promise.reject(error)}
    const {reader,controller}=operation;
    return new Promise((resolve,reject)=>{
      let settled=false;
      const cleanup=()=>{
        reader.removeEventListener('reading',reading);
        reader.removeEventListener('readingerror',readingError);
        controller.signal.removeEventListener('abort',aborted);
        controller.abort();
        if(this.active===controller)this.active=undefined;
      };
      const fail=(error:unknown)=>{if(settled)return;settled=true;cleanup();reject(error)};
      const reading=(event:Event)=>{
        if(settled)return;
        try{
          const actual=event as NdefReading;
          const token=decodeCredential(actual.message.records);
          settled=true;cleanup();resolve({token,serialNumber:actual.serialNumber||''});
        }catch(error){fail(error)}
      };
      const readingError=()=>fail(new Error('Carte détectée mais NDEF illisible. Retirez-la, puis essayez une carte compatible.'));
      const aborted=()=>fail(new DOMException('Lecture annulée','AbortError'));
      reader.addEventListener('reading',reading);
      reader.addEventListener('readingerror',readingError);
      controller.signal.addEventListener('abort',aborted,{once:true});
      try{
        // Resolving scan() is NOT a read. Only the reading event can resolve this promise.
        reader.scan({signal:controller.signal}).then(()=>{if(!settled)onListening?.()},fail);
      }catch(error){fail(error)}
    });
  }
}
