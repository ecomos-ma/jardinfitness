import assert from 'node:assert/strict';
import {PhysicalNfcDevice,decodeCredential,generatePhysicalToken,validPhysicalToken,nfcError,createBrowserReader,type NdefReader} from '../src/webNfc';
import {useApp} from '../src/store';
import {activeSubscription,day,today} from '../src/data';

let count=0;
function check(value:unknown,label:string){assert.ok(value,label);count++}
async function rejects(action:()=>unknown,match:RegExp,label:string){await assert.rejects(async()=>action(),match,label);count++}
const token=generatePhysicalToken(),otherToken=generatePhysicalToken();
check(validPhysicalToken(token)&&token!==otherToken,'256-bit versioned tokens');
check(!validPhysicalToken(token.toUpperCase()),'strict canonical token');
const bytes=new TextEncoder().encode(token);
const record={recordType:'text',encoding:'utf-8',data:new DataView(bytes.buffer)};
check(decodeCredential([record])===token,'UTF-8 NDEF text decoded');
const padded=new Uint8Array(bytes.length+8);padded.set(bytes,4);
check(decodeCredential([{...record,data:new DataView(padded.buffer,4,bytes.length)}])===token,'DataView offset respected');
const utf16=new Uint8Array(token.length*2);for(let i=0;i<token.length;i++)utf16[i*2+1]=token.charCodeAt(i);
check(decodeCredential([{recordType:'text',encoding:'utf-16',data:new DataView(utf16.buffer)}])===token,'UTF-16 big endian NDEF decoded');
const futurePayload=new TextEncoder().encode(token.replace(':v1:',':v2:'));
await rejects(()=>decodeCredential([{...record,data:new DataView(futurePayload.buffer)}]),/Version/,'unsupported token version');
await rejects(()=>decodeCredential([]),/Format/,'empty tag');
await rejects(()=>decodeCredential([record,record]),/Format/,'ambiguous multiple records');
await rejects(()=>decodeCredential([{...record,recordType:'url'}]),/Format/,'URL tag not accepted');
await rejects(()=>decodeCredential([{...record,data:new DataView(new Uint8Array([255]).buffer)}]),/illisible/,'malformed encoding');

function deferred(){let resolve!:()=>void,reject!:(e:Error)=>void;const promise=new Promise<void>((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}}
class Reader extends EventTarget implements NdefReader{
  scanResult=deferred();writeResult=deferred();scanSignal?:AbortSignal;writeSignal?:AbortSignal;message?:unknown;overwrite?:boolean;listeners=0;
  addEventListener(...args:Parameters<EventTarget['addEventListener']>){this.listeners++;super.addEventListener(...args)}
  removeEventListener(...args:Parameters<EventTarget['removeEventListener']>){this.listeners--;super.removeEventListener(...args)}
  scan({signal}:{signal:AbortSignal}){this.scanSignal=signal;return this.scanResult.promise}
  write(message:unknown,options:{signal:AbortSignal;overwrite:boolean}){this.message=message;this.overwrite=options.overwrite;this.writeSignal=options.signal;return this.writeResult.promise}
  tag(records=[record],serialNumber='04:aa:bb'){const e=new Event('reading');Object.assign(e,{message:{records},serialNumber});this.dispatchEvent(e)}
}
let r=new Reader(),device=new PhysicalNfcDevice(()=>r),done=false;
const written=device.write(token).then(()=>{done=true});
await Promise.resolve();check(!done,'writing never completes before write() resolves');
check(JSON.stringify(r.message)===JSON.stringify({records:[{recordType:'text',data:token,lang:'en',encoding:'utf-8'}]}),'only opaque token written, no PII');
check(r.overwrite===false,'existing content protected by default');
r.writeResult.resolve();await written;check(done&&r.writeSignal?.aborted,'confirmed write cleans operation');
r=new Reader();device=new PhysicalNfcDevice(()=>r);done=false;
const failedWrite=device.write(token).then(()=>{done=true});r.writeResult.reject(new DOMException('Tag lost','NetworkError'));
await rejects(()=>failedWrite,/Tag lost/,'write failure propagates');check(!done&&r.writeSignal?.aborted,'failed writing does not report success');
r=new Reader();device=new PhysicalNfcDevice(()=>r);
const canceledWrite=device.write(token,true);device.cancel();r.writeResult.resolve();
await rejects(()=>canceledWrite,/annulée/,'late write resolution after abort rejected');check(r.overwrite,'explicit overwrite passed to hardware');
r=new Reader();device=new PhysicalNfcDevice(()=>r);done=false;let listening=false;
const read=device.read(()=>{listening=true}).then(value=>{done=true;return value});r.scanResult.resolve();await Promise.resolve();
check(listening&&!done,'scan() resolution only starts listening');
await rejects(()=>device.write(token),/en cours/,'concurrent operations blocked');
r.tag();const actual=await read;check(actual.token===token&&actual.serialNumber==='04:aa:bb','actual reading event provides token and serial');
check(r.scanSignal?.aborted&&r.listeners===0,'listeners and scan cleaned after reading');
r.tag([{...record,data:new DataView(new TextEncoder().encode(otherToken).buffer)}]);check(actual.token===token,'extra events cannot replace completed read');
r=new Reader();device=new PhysicalNfcDevice(()=>r);const cancelRead=device.read();device.cancel();
await rejects(()=>cancelRead,/annulée/,'reading abort rejects');check(r.listeners===0&&r.scanSignal?.aborted,'aborted listeners cleaned');
r=new Reader();device=new PhysicalNfcDevice(()=>r);const scanFail=device.read();r.scanResult.reject(new DOMException('Denied','NotAllowedError'));
await rejects(()=>scanFail,/Denied/,'permission refusal handled');check(r.listeners===0,'startup failure cleans listeners');
r=new Reader();device=new PhysicalNfcDevice(()=>r);const badTag=device.read();r.dispatchEvent(new Event('readingerror'));
await rejects(()=>badTag,/illisible/,'readingerror handled');check(r.listeners===0,'readingerror cleans listeners');
r=new Reader();device=new PhysicalNfcDevice(()=>r);const wrongFormat=device.read();r.tag([]);
await rejects(()=>wrongFormat,/Format/,'invalid physical payload rejected');
for(const name of ['NotAllowedError','SecurityError','NotSupportedError','NotReadableError','NetworkError','AbortError','InvalidStateError','InvalidModificationError'])check(nfcError(new DOMException('',name)).length>20,`${name} guidance`);
Object.assign(window,{isSecureContext:false,location:{protocol:'http:'}});
await rejects(()=>createBrowserReader(),/HTTPS/,'HTTP blocked');
Object.assign(window,{isSecureContext:true,location:{protocol:'https:'}});Object.assign(window,{self:window,top:window});
await rejects(()=>createBrowserReader(),/indisponible/,'unsupported browser blocked');

const app=()=>useApp.getState(),accepted=()=>app().data.checkIns.filter(c=>c.decision==='accepted').length;
const clientInput={firstName:'Client',lastName:'Sans email',phone:'0600000000',email:'',planId:'month-gym',paid:true};
const createdClient=app().createPhysicalClient(clientInput);
check(app().data.members.some(m=>m.id===createdClient&&m.email==='')&&!!activeSubscription(app().data,createdClient),'physical client form saves into shared member and subscription state without fabricated email');
const newMember=app().enrollMember({firstName:'Yassine',lastName:'Physical Test',phone:'0600000000',email:'hardware-test@example.test',planId:'month-gym',start:day(today()),end:day(new Date(Date.now()+30*86400000)),paymentStatus:'confirmed'});
const id=newMember.memberId!;check(newMember.ok&&!!activeSubscription(app().data,id),'existing member and subscription store');
const preparation=app().preparePhysicalWrite(id);check(!app().data.credentials.some(c=>c.code===preparation.token),'preparation does not assign credential');
check(!app().verifyPhysicalAssignment(preparation.token,preparation.token,id,'serial-one').ok,'verification forbidden before confirmed write');
app().confirmPhysicalWrite(preparation.token);check(!app().readPhysicalCredential(preparation.token).ok,'written but unverified card cannot enter');
check(!app().verifyPhysicalAssignment(preparation.token,otherToken,id,'serial-one').ok,'wrong physical readback rejected');
check(!app().verifyPhysicalAssignment(preparation.token,preparation.token,'m-002','serial-one').ok,'intended client enforced');
check(app().verifyPhysicalAssignment(preparation.token,preparation.token,id,'serial-one').ok,'matching separate readback assigns');
check(app().data.credentials.filter(c=>c.code===preparation.token).length===1,'one token one assignment');
check(!app().verifyPhysicalAssignment(preparation.token,preparation.token,id,'serial-one').ok,'verification cannot be replayed');
const baseline=accepted();const first=app().readPhysicalCredential(preparation.token);
check(first.ok&&first.memberId===id&&first.attendanceRecorded,'physical credential identifies correct member');
check(accepted()===baseline+1,'attendance increments exactly once');
const repeat=app().readPhysicalCredential(preparation.token);
check(repeat.ok&&repeat.duplicate&&!repeat.attendanceRecorded&&accepted()===baseline+1,'rapid reread identifies active client without duplicate attendance');
const membership=activeSubscription(app().data,id)!;
app().setSubscriptionStatus(membership.id,'suspended');check(!app().readPhysicalCredential(preparation.token).ok,'suspension refuses real read');
app().setSubscriptionStatus(membership.id,'expired');check(app().readPhysicalCredential(preparation.token).message==='Abonnement expiré','expiry refuses same credential');
check(accepted()===baseline+1,'refusals never count as accepted');
app().subscribe(id,'month-gym','Carte',true);check(app().readPhysicalCredential(preparation.token).ok,'renewal restores same credential');
check(!app().readPhysicalCredential(otherToken).ok,'unknown physical token denied');
check(!app().readPhysicalCredential('JF100001').ok,'simulated/legacy token cannot masquerade as verified physical credential');
const second=app().preparePhysicalWrite('m-002');app().confirmPhysicalWrite(second.token);
check(!app().verifyPhysicalAssignment(second.token,second.token,'m-002','serial-one').ok,'same physical serial cannot have two active owners');
const card=app().data.credentials.find(c=>c.code===preparation.token)!;app().revokeCard(card.id,'revoked');
check(app().readPhysicalCredential(preparation.token).message==='Carte révoquée','revoked credential denied');
const noSerial=app().preparePhysicalWrite(id);app().confirmPhysicalWrite(noSerial.token);
check(app().verifyPhysicalAssignment(noSerial.token,noSerial.token,id,'').ok,'token matching works when hardware does not expose a serial');
const stored=localStorage.getItem('jardin-fitness-os-v2')!;await useApp.persist.rehydrate();
check(JSON.stringify(app().data)===JSON.stringify(JSON.parse(stored).state.data),'verified assignment and history survive rehydration');
check(app().readPhysicalCredential(noSerial.token).memberId===id,'credential resolves after refresh');
check(app().data.nfcEvents!.some(e=>e.action==='Lecture NFC physique'&&e.memberId===id),'physical journal does not claim virtual events');
const future=app().enrollMember({firstName:'Future',lastName:'Member',phone:'0600000001',email:'future@example.test',planId:'month-gym',start:day(new Date(Date.now()+86400000)),end:day(new Date(Date.now()+31*86400000)),paymentStatus:'confirmed'});
const futureCard=app().preparePhysicalWrite(future.memberId!);app().confirmPhysicalWrite(futureCard.token);app().verifyPhysicalAssignment(futureCard.token,futureCard.token,future.memberId!,'');
check(app().readPhysicalCredential(futureCard.token).message==='Abonnement pas encore commencé','future subscription denied');
const unpaid=app().enrollMember({firstName:'Pending',lastName:'Member',phone:'0600000002',email:'pending@example.test',planId:'month-gym',start:day(today()),end:day(new Date(Date.now()+30*86400000)),paymentStatus:'pending'});
const unpaidCard=app().preparePhysicalWrite(unpaid.memberId!);app().confirmPhysicalWrite(unpaidCard.token);app().verifyPhysicalAssignment(unpaidCard.token,unpaidCard.token,unpaid.memberId!,'');
check(app().readPhysicalCredential(unpaidCard.token).message.includes('Paiement'),'pending payment denied');
const before=JSON.stringify(app().data);(globalThis as any).failNfcTestStorage(true);
await rejects(()=>app().preparePhysicalWrite(id),/Enregistrement local impossible/,'storage failure surfaced');
check(JSON.stringify(app().data)===before,'storage failure rolls back memory');
(globalThis as any).failNfcTestStorage(false);
const toVerify=app().preparePhysicalWrite(id);app().confirmPhysicalWrite(toVerify.token);
const beforeVerification=JSON.stringify(app().data);
(globalThis as any).failNfcTestStorage(true);
await rejects(()=>app().verifyPhysicalAssignment(toVerify.token,toVerify.token,id,''),/Enregistrement local impossible/,'verification cannot claim assignment when persistence fails');
check(JSON.stringify(app().data)===beforeVerification,'failed assignment rolls back');
await rejects(()=>app().createPhysicalClient(clientInput),/Full/,'client creation reports storage failure');
check(JSON.stringify(app().data)===beforeVerification,'failed client creation rolls back');
(globalThis as any).failNfcTestStorage(false);
console.log(count+' physical NFC code checks passed. No physical hardware was tested.');
