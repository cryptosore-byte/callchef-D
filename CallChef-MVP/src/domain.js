import {randomUUID} from 'node:crypto';
export class DomainError extends Error {constructor(message,status=422){super(message);this.status=status;}}
export function assert(condition,message,status){if(!condition)throw new DomainError(message,status);}
export function isOpen(settings,now=new Date()) {
 if(!settings.acceptingOrders) return false;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:settings.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
 const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);const t=parts.hour+':'+parts.minute;
 return (settings.openingHours[String(day)]||[]).some(([a,b])=>t>=a&&t<b);
}
export function priceCart(data,products,settings,{complete=false}={}) {
 const lines=data.items.map(item=>{
  const p=products.find(p=>p.id===item.productId);assert(p&&p.available,'Produit indisponible');
  assert(Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=30,'Quantité invalide');
  const chosen=item.optionIds||[];assert(new Set(chosen).size===chosen.length,'Option en double');
  const all=p.options.flatMap(g=>g.options);assert(chosen.every(id=>all.some(o=>o.id===id&&o.available!==false)),'Option inconnue ou indisponible');
  for(const g of p.options){const count=g.options.filter(o=>chosen.includes(o.id)).length;assert(count<=g.max,'Trop de choix pour '+g.name);if(complete)assert(count>=g.min,'Choix requis : '+g.name);}
  const options=all.filter(o=>chosen.includes(o.id));const unitCents=p.price_cents+options.reduce((s,o)=>s+o.priceCents,0);
  return {...item,name:p.name,options,unitCents,totalCents:unitCents*item.quantity};
 });
 const subtotalCents=lines.reduce((s,l)=>s+l.totalCents,0);let deliveryFeeCents=0;
 if(data.fulfillment==='DELIVERY') {assert(settings.deliveryEnabled,'Livraison désactivée');if(complete){assert(settings.deliveryPostcodes.includes(data.customer?.postcode),'Code postal hors zone');assert(data.customer?.address?.trim().length>=6,'Adresse obligatoire');assert(subtotalCents>=settings.minimumOrderCents,'Minimum de livraison non atteint');}deliveryFeeCents=settings.deliveryFeeCents;}
 if(complete){assert(lines.length>0,'Panier vide');assert(data.customer?.name?.trim().length>=2,'Nom obligatoire');assert(/^\+[1-9]\d{7,14}$/.test(data.customer?.phone||''),'Téléphone requis au format +336…');assert(isOpen(settings),'Le restaurant ne prend pas de commandes à cette heure');}
 return {items:lines,subtotalCents,deliveryFeeCents,totalCents:subtotalCents+deliveryFeeCents,currency:'EUR',fulfillment:data.fulfillment,customer:data.customer};
}
export function mutateCart(data,action,args) {
 const d=structuredClone(data);
 if(action==='addItemToCart'){assert(d.items.length<50,'Limite du panier atteinte');d.items.push({id:randomUUID(),productId:args.productId,quantity:args.quantity,optionIds:args.optionIds||[]});}
 if(action==='updateCartItem'){const item=d.items.find(i=>i.id===args.itemId);assert(item,'Ligne inconnue');if(args.quantity!==undefined)item.quantity=args.quantity;if(args.optionIds!==undefined)item.optionIds=args.optionIds;if(args.productId!==undefined)item.productId=args.productId;}
 if(action==='removeCartItem'){assert(d.items.some(i=>i.id===args.itemId),'Ligne inconnue');d.items=d.items.filter(i=>i.id!==args.itemId);}
 if(action==='setCustomer'){d.customer={...d.customer,...args.customer};if(args.fulfillment)d.fulfillment=args.fulfillment;}
 return d;
}
export const euro=n=>(n/100).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
export function recap(cart){return cart.items.map(l=>`${l.quantity} ${l.name}${l.options.length?' avec '+l.options.map(o=>o.name).join(', '):''}`).join('; ')+`. ${cart.fulfillment==='DELIVERY'?'Livraison à '+cart.customer.address+', '+cart.customer.postcode:'Retrait sur place'}. Au nom de ${cart.customer.name}. Total ${euro(cart.totalCents)}${cart.deliveryFeeCents?' dont livraison '+euro(cart.deliveryFeeCents):''}. Confirmez-vous cette commande ?`;}
