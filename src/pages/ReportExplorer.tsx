import {useMemo,useState} from 'react';
import {addDays,format,subDays} from 'date-fns';
import {fr} from 'date-fns/locale';
import {activeSubscription,dateLabel,fullName,money,renewalRate,today} from '../data';
import {useApp} from '../store';
import {Card,downloadCSV,Empty,Table,Button} from '../ui';

const reportNames=[
 'Revenus par mois','Revenus par service','Nouveaux membres','Abonnements à échéance','Renouvellements','Moyens de paiement','Présences par jour','Présences par heure','Membres inactifs','Participation aux cours','Utilisation recovery','Ventes Shake Bar','Alertes de stock','Dépenses','Répartition des abonnements','Fidélisation des membres','Conversion des pass journée','Paiements en attente'
];
type Row=(string|number)[];
type Report={headers:string[];rows:Row[];note:string};
const group=(items:{key:string;amount?:number}[])=>Object.values(items.reduce<Record<string,{key:string;count:number;amount:number}>>((acc,x)=>{const v=acc[x.key]||{key:x.key,count:0,amount:0};v.count++;v.amount+=x.amount||0;acc[x.key]=v;return acc},{}));
export function ReportExplorer({days}:{days:number}){
 const d=useApp(s=>s.data),[selected,setSelected]=useState(reportNames[0]);
 const report=useMemo<Report>(()=>{
  const start=subDays(today(),days),now=today();
  const paid=d.payments.filter(p=>p.status==='confirmed'&&new Date(p.at)>=start);
  const visits=d.checkIns.filter(c=>c.decision==='accepted'&&new Date(c.at)>=start);
  const member=(id?:string)=>d.members.find(m=>m.id===id);
  const plan=(id:string)=>d.plans.find(p=>p.id===id);
  switch(selected){
   case 'Revenus par mois': return {headers:['Mois','Transactions','Montant encaissé'],rows:group(paid.map(p=>({key:format(new Date(p.at),'yyyy-MM'),amount:p.amount}))).sort((a,b)=>b.key.localeCompare(a.key)).map(x=>[x.key,x.count,money(x.amount)]),note:'Transactions confirmées par mois ; remboursements suivis séparément dans les totaux nets.'};
   case 'Revenus par service': return {headers:['Service','Transactions','Montant encaissé'],rows:group(paid.map(p=>({key:({membership:'Abonnements',pos:'Shake Bar',recovery:'Récupération',class:'Cours'} as Record<string,string>)[p.kind],amount:p.amount}))).map(x=>[x.key,x.count,money(x.amount)]),note:'Répartition des encaissements confirmés par activité.'};
   case 'Nouveaux membres': return {headers:['Membre','Inscription','Origine'],rows:d.members.filter(m=>new Date(m.joinedAt)>=start).sort((a,b)=>b.joinedAt.localeCompare(a.joinedAt)).map(m=>[fullName(m),dateLabel(m.joinedAt),m.source]),note:'Inscriptions enregistrées sur la période.'};
   case 'Abonnements à échéance': return {headers:['Membre','Formule','Échéance','Potentiel'],rows:d.subscriptions.filter(s=>s.status==='active'&&new Date(s.end)>=now&&new Date(s.end)<=addDays(now,30)).sort((a,b)=>a.end.localeCompare(b.end)).map(s=>[fullName(member(s.memberId)!),plan(s.planId)?.name||'—',dateLabel(s.end),money(plan(s.planId)?.price||0)]),note:'Échéances dans les 30 prochains jours ; le potentiel ne constitue pas une recette acquise.'};
   case 'Renouvellements': return {headers:['Membre','Nouvelle formule','Début','Fin'],rows:d.subscriptions.filter(s=>new Date(s.start)>=start&&d.subscriptions.some(p=>p.memberId===s.memberId&&p.id!==s.id&&new Date(p.end)<=new Date(s.start))).map(s=>[fullName(member(s.memberId)!),plan(s.planId)?.name||'—',dateLabel(s.start),dateLabel(s.end)]),note:'Nouvel abonnement après une adhésion antérieure.'};
   case 'Moyens de paiement': return {headers:['Moyen','Transactions','Montant'],rows:group(paid.map(p=>({key:p.method,amount:p.amount}))).map(x=>[x.key,x.count,money(x.amount)]),note:'Paiements confirmés uniquement.'};
   case 'Présences par jour': return {headers:['Jour','Passages validés'],rows:group(visits.map(c=>({key:format(new Date(c.at),'yyyy-MM-dd')}))).sort((a,b)=>b.key.localeCompare(a.key)).map(x=>[x.key,x.count]),note:'Nombre d’entrées, sans estimation de présence physique dans le club.'};
   case 'Présences par heure': return {headers:['Créneau','Passages validés'],rows:group(visits.map(c=>({key:format(new Date(c.at),'HH:00')}))).sort((a,b)=>a.key.localeCompare(b.key)).map(x=>[x.key,x.count]),note:'Volume d’entrées par heure sur la période.'};
   case 'Membres inactifs': return {headers:['Membre','Dernière visite','Abonnement'],rows:d.members.filter(m=>activeSubscription(d,m.id)).map(m=>({m,last:d.checkIns.filter(c=>c.memberId===m.id&&c.decision==='accepted').sort((a,b)=>b.at.localeCompare(a.at))[0]})).filter(x=>!x.last||new Date(x.last.at)<subDays(now,30)).map(x=>[fullName(x.m),x.last?dateLabel(x.last.at):'Aucune visite',plan(activeSubscription(d,x.m.id)!.planId)?.name||'—']),note:'Membres avec accès valide et aucune visite depuis au moins 30 jours.'};
   case 'Participation aux cours': return {headers:['Cours','Date','Réservations','Capacité'],rows:d.sessions.filter(s=>new Date(s.at)>=start).sort((a,b)=>b.at.localeCompare(a.at)).map(s=>[s.title,dateLabel(s.at),d.bookings.filter(b=>b.sessionId===s.id&&b.status==='booked').length,s.capacity]),note:'Réservations actives par séance.'};
   case 'Utilisation recovery': return {headers:['Service','Réservations','Valeur affichée'],rows:group(d.recoveries.filter(r=>new Date(r.at)>=start&&r.status!=='canceled').map(r=>({key:r.service,amount:r.price}))).map(x=>[x.key,x.count,money(x.amount)]),note:'Valeur des rendez-vous, distincte des recettes effectivement encaissées.'};
   case 'Ventes Shake Bar': return {headers:['Produit','Quantité','Ventes'],rows:group(d.orders.filter(o=>new Date(o.at)>=start).flatMap(o=>o.items.flatMap(i=>Array.from({length:i.qty},()=>({key:d.products.find(p=>p.id===i.productId)?.name||i.productId,amount:i.price}))))).sort((a,b)=>b.amount-a.amount).map(x=>[x.key,x.count,money(x.amount)]),note:'Ventes au comptoir enregistrées sur la période.'};
   case 'Alertes de stock': return {headers:['Produit','Stock','Seuil','État'],rows:d.products.filter(p=>p.stock<=p.threshold).map(p=>[p.name,p.stock,p.threshold,p.stock===0?'Rupture':'À commander']),note:'Produits au niveau ou sous leur seuil configuré.'};
   case 'Dépenses': return {headers:['Date','Libellé','Catégorie','Montant'],rows:d.expenses.filter(e=>new Date(e.at)>=start).sort((a,b)=>b.at.localeCompare(a.at)).map(e=>[dateLabel(e.at),e.label,e.category,money(e.amount)]),note:'Charges enregistrées sur la période.'};
   case 'Répartition des abonnements': return {headers:['Formule','Abonnements actifs','Prix actuel'],rows:d.plans.map(p=>[p.name,d.subscriptions.filter(s=>s.planId===p.id&&s.status==='active'&&new Date(s.start)<=now&&new Date(s.end)>=now).length,money(p.price)]),note:'Statut contractuel et dates ; les accès réellement valides peuvent aussi dépendre du paiement.'};
   case 'Fidélisation des membres': return {headers:['Indicateur','Valeur'],rows:[['Taux de renouvellement',`${renewalRate(d)} %`],['Relations de parrainage',d.referrals.length],['Récompenses échangées',d.loyalty.filter(l=>l.points<0).length]],note:'Taux calculé sur les adhésions échues durant les 90 derniers jours et renouvelées dans les 30 jours.'};
   case 'Conversion des pass journée': {const pass=d.subscriptions.filter(s=>s.planId.startsWith('day-'));const converted=pass.filter(s=>d.subscriptions.some(n=>n.memberId===s.memberId&&!n.planId.startsWith('day-')&&new Date(n.start)>new Date(s.end)));return {headers:['Pass journée','Conversions','Taux'],rows:[[pass.length,converted.length,pass.length?`${Math.round(converted.length/pass.length*100)} %`:'—']],note:'Membres ayant acheté une formule après un pass journée.'}};
   case 'Paiements en attente': return {headers:['Référence','Membre','Date','Montant','Moyen'],rows:d.payments.filter(p=>p.status==='pending').map(p=>[p.reference,member(p.memberId)?fullName(member(p.memberId)!):'Vente libre',dateLabel(p.at),money(p.amount),p.method]),note:'Ces montants sont exclus des recettes encaissées.'};
  }
  return {headers:[],rows:[],note:''};
 },[d,days,selected]);
 return <Card className="mt-card"><div className="card-heading"><div><span className="eyebrow">BIBLIOTHÈQUE DE RAPPORTS</span><h2>{selected}</h2></div><div className="report-tools"><select aria-label="Type de rapport" value={selected} onChange={e=>setSelected(e.target.value)}>{reportNames.map(n=><option key={n}>{n}</option>)}</select><Button variant="outline" onClick={()=>downloadCSV(`jardin-${selected.toLowerCase().replaceAll(' ','-')}.csv`,[report.headers,...report.rows])}>Export CSV</Button></div></div><p className="report-note">{report.note}</p>{report.rows.length?<Table headers={report.headers}>{report.rows.slice(0,100).map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</Table>:<Empty title="Aucune donnée sur cette période" body="Essayez une plage de dates plus large ou une autre catégorie de rapport."/>}</Card>
}
