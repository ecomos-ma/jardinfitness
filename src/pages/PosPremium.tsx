import {useState} from 'react';
import {Link} from 'react-router-dom';
import {motion} from 'framer-motion';
import {Minus,Plus} from 'lucide-react';
import {dateTime,fullName,money} from '../data';
import {useApp} from '../store';
import type {Product} from '../types';
import {Badge,Button,Card,Field,Modal,PageHead,Table} from '../ui';

const productPhotos:Record<string,string>={
  'shake-berry':'/assets/products/berry-glow.webp',
  'shake-green':'/assets/products/green-ritual.webp',
  'shake-cacao':'/assets/products/cacao-protein.webp',
  water:'/assets/products/eau-minerale.webp',
  bar:'/assets/products/barre-proteinee.webp',
  granola:'/assets/products/granola-maison.webp',
  mat:'/assets/products/tapis-yoga.webp'
};

export function Pos(){
  const d=useApp(s=>s.data),sell=useApp(s=>s.sell),toast=useApp(s=>s.showToast);
  const [cart,setCart]=useState<Record<string,number>>({}),[memberId,setMemberId]=useState(''),[method,setMethod]=useState('Carte'),[category,setCategory]=useState('Tous');
  const [detail,setDetail]=useState<Product|null>(null),[detailQty,setDetailQty]=useState(1),[lastAdded,setLastAdded]=useState('');
  const items=Object.entries(cart).filter(([,qty])=>qty>0).map(([productId,qty])=>({productId,qty}));
  const count=items.reduce((a,i)=>a+i.qty,0);
  const total=items.reduce((a,i)=>a+(d.products.find(p=>p.id===i.productId)?.price||0)*i.qty,0);
  function change(id:string,delta:number){
    const product=d.products.find(x=>x.id===id);
    if(!product)return;
    setCart(current=>({...current,[id]:Math.max(0,Math.min(product.stock,(current[id]||0)+delta))}));
    if(delta>0){setLastAdded(id);window.setTimeout(()=>setLastAdded(current=>current===id?'':current),280)}
  }
  function openDetail(product:Product){setDetail(product);setDetailQty(1)}
  const liveDetail=detail&&d.products.find(p=>p.id===detail.id);
  const detailAvailable=liveDetail?Math.max(0,liveDetail.stock-(cart[liveDetail.id]||0)):0;
  return <>
    <PageHead eyebrow="JARDIN SHAKE BAR" title="Point de vente" description="Un comptoir rapide pour les pauses qui font du bien." actions={<Link to="/inventory"><Button variant="outline">Voir l’inventaire</Button></Link>}/>
    <div className="pos-layout"><div>
      <div className="pos-categories">{['Tous','Shakes','Boissons','Snacks','Boutique'].map(c=><button className={category===c?'selected':''} key={c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
      <div className="product-grid">{d.products.filter(p=>category==='Tous'||p.category===category).map(p=><article className="product-card" key={p.id}>
        <button className="product-photo-button" type="button" onClick={()=>openDetail(p)} aria-label={`Voir ${p.name}`}><img src={productPhotos[p.id]} alt={p.name} loading="lazy" width="1000" height="1000"/></button>
        <div className="product-card-body"><button type="button" className="product-card-title" onClick={()=>openDetail(p)}>{p.name}</button><div className="product-card-meta"><span>{p.category}</span><span className={p.stock<=p.threshold?'low-stock':''}>{p.stock} en stock</span></div><div className="product-card-bottom"><strong className="product-card-price">{money(p.price)}</strong><button type="button" className={`product-add ${lastAdded===p.id?'product-add-feedback':''}`} disabled={p.stock===0||(cart[p.id]||0)>=p.stock} aria-label={`Ajouter ${p.name} au panier`} onClick={()=>change(p.id,1)}><Plus size={17}/></button></div></div>
      </article>)}</div>
    </div><Card className="cart-panel"><div className="card-heading"><h2>Commande</h2><Badge tone="neutral"><motion.span className="cart-quantity" key={count} initial={{scale:1.22}} animate={{scale:1}} transition={{duration:.22}}>{count}</motion.span> articles</Badge></div>
      <div className="cart-items">{items.length===0?<div className="cart-empty">Sélectionnez des produits pour commencer.</div>:items.map(i=>{const p=d.products.find(x=>x.id===i.productId)!;return <div className="cart-row" key={p.id}><div><strong>{p.name}</strong><small>{money(p.price)} / unité</small></div><div className="qty"><button onClick={()=>change(p.id,-1)} aria-label={`Retirer un ${p.name}`}><Minus size={13}/></button><span>{i.qty}</span><button onClick={()=>change(p.id,1)} disabled={i.qty>=p.stock} aria-label={`Ajouter un ${p.name}`}><Plus size={13}/></button></div><strong>{money(p.price*i.qty)}</strong></div>})}</div>
      <div className="cart-foot"><Field label="Membre (facultatif)"><select value={memberId} onChange={e=>setMemberId(e.target.value)}><option value="">Vente libre</option>{d.members.map(m=><option key={m.id} value={m.id}>{fullName(m)}</option>)}</select></Field><Field label="Moyen de paiement"><select value={method} onChange={e=>setMethod(e.target.value)}><option>Carte</option><option>Espèces</option></select></Field><div className="cart-total"><span>Total à encaisser</span><strong>{money(total)}</strong></div><Button disabled={items.length===0} onClick={()=>{const result=sell(items,memberId||undefined,method);toast(result.message);if(result.ok)setCart({})}}>Encaisser la commande</Button></div>
    </Card></div>
    <Card className="mt-card"><div className="card-heading"><h2>Dernières ventes</h2></div><Table headers={['Date','Articles','Membre','Montant']}>{d.orders.slice(0,12).map(o=>{const m=d.members.find(x=>x.id===o.memberId);return <tr key={o.id}><td>{dateTime(o.at)}</td><td>{o.items.map(i=>d.products.find(p=>p.id===i.productId)?.name).join(', ')}</td><td>{m?fullName(m):'Vente libre'}</td><td>{money(d.payments.find(p=>p.id===o.paymentId)?.amount||0)}</td></tr>})}</Table></Card>
    <Modal open={!!liveDetail} onOpenChange={open=>{if(!open)setDetail(null)}} title="Détail du produit" width="760px">{liveDetail&&<div className="product-detail"><img src={productPhotos[liveDetail.id]} alt={liveDetail.name} width="1000" height="1000"/><div><span className="product-detail-category">{liveDetail.category}</span><h3>{liveDetail.name}</h3><strong className="product-detail-price">{money(liveDetail.price)}</strong><div className="detail-line"><span>Disponibilité</span><strong>{liveDetail.stock} en stock</strong></div><div className="product-detail-quantity"><button type="button" aria-label="Diminuer la quantité" onClick={()=>setDetailQty(q=>Math.max(1,q-1))}><Minus size={15}/></button><strong>{Math.min(detailQty,Math.max(1,detailAvailable))}</strong><button type="button" aria-label="Augmenter la quantité" disabled={detailQty>=detailAvailable} onClick={()=>setDetailQty(q=>Math.min(detailAvailable,q+1))}><Plus size={15}/></button></div><Button disabled={detailAvailable===0} onClick={()=>{change(liveDetail.id,Math.min(detailQty,detailAvailable));setDetail(null)}}>Ajouter au panier · {money(liveDetail.price*Math.min(detailQty,detailAvailable))}</Button></div></div>}</Modal>
  </>;
}
