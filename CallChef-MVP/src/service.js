import {randomUUID,createHash} from 'node:crypto';
import {one} from './db.js';
import {assert,priceCart,mutateCart,recap} from './domain.js';
export const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export class RestaurantService {
 constructor(db,publish=()=>{}){this.db=db;this.publish=publish;}
 async restaurant(t,db=this.db){const r=await one(db,'SELECT * FROM restaurants WHERE id=$1',[t]);assert(r,'Restaurant inconnu',404);return r;}
 async menu(t,db=this.db){return (await db.query('SELECT * FROM products WHERE restaurant_id=$1 ORDER BY category,name',[t])).rows;}
 async event(t,callId,type,data={},db=this.db){await db.query('INSERT INTO call_events(restaurant_id,call_id,type,data) VALUES($1,$2,$3,$4)',[t,callId,type,JSON.stringify(data)]);}
 async createCart(t,callId=null){if(callId){const c=await one(this.db,'SELECT * FROM carts WHERE restaurant_id=$1 AND call_id=$2',[t,callId]);if(c)return c;assert(await one(this.db,'SELECT id FROM calls WHERE restaurant_id=$1 AND id=$2',[t,callId]),'Appel inconnu',404);}const c={id:randomUUID(),restaurant_id:t,call_id:callId,data:{items:[],fulfillment:'PICKUP',customer:{}},version:0};await this.db.query('INSERT INTO carts(id,restaurant_id,call_id,data) VALUES($1,$2,$3,$4)',[c.id,t,callId,JSON.stringify(c.data)]);return c;}
 async cart(t,id,db=this.db,lock=false){const c=await one(db,'SELECT * FROM carts WHERE restaurant_id=$1 AND id=$2'+(lock?' FOR UPDATE':''),[t,id]);assert(c,'Panier inconnu',404);return c;}
 async view(t,id,db=this.db){const c=await this.cart(t,id,db);const r=await this.restaurant(t,db);return {...priceCart(c.data,await this.menu(t,db),r.settings),id:c.id,version:c.version};}
 async mutate(t,id,action,args){const result=await this.db.transaction(async tx=>{const c=await this.cart(t,id,tx,true);assert(!await one(tx,'SELECT id FROM orders WHERE cart_id=$1',[id]),'Commande déjà créée',409);if(args.expectedVersion!==undefined)assert(c.version===args.expectedVersion,'Panier modifié : rechargez-le',409);const data=mutateCart(c.data,action,args);const r=await this.restaurant(t,tx);priceCart(data,await this.menu(t,tx),r.settings);await tx.query('UPDATE carts SET data=$1,version=version+1,quote_token=NULL,quote_version=NULL,quoted_at=NULL WHERE id=$2',[JSON.stringify(data),id]);await this.event(t,c.call_id,'cart_updated',{action,version:c.version+1},tx);return this.view(t,id,tx);});this.publish(t);return result;}
 async quote(t,id){return this.db.transaction(async tx=>{const c=await this.cart(t,id,tx,true);assert(!await one(tx,'SELECT id FROM orders WHERE cart_id=$1',[id]),'Commande déjà créée',409);const r=await this.restaurant(t,tx);const cart=priceCart(c.data,await this.menu(t,tx),r.settings,{complete:true});const token=randomUUID();const data={...c.data,quoteDigest:digest(cart)};await tx.query('UPDATE carts SET quote_token=$1,quote_version=version,quoted_at=now(),data=$3 WHERE id=$2',[token,id,JSON.stringify(data)]);return {...cart,quoteToken:token,version:c.version,recap:recap(cart)};});}
 async confirm(t,id,{quoteToken,confirmed},source='voice') {
  const order=await this.db.transaction(async tx=>{
   const c=await this.cart(t,id,tx,true);const existing=await one(tx,'SELECT * FROM orders WHERE cart_id=$1 AND restaurant_id=$2',[id,t]);if(existing)return existing;
   assert(confirmed===true,'Confirmation explicite requise');assert(c.quote_token===quoteToken&&c.quote_version===c.version&&Date.now()-new Date(c.quoted_at).getTime()<300000,'Récapitulatif expiré ou modifié : recommencez',409);
   if(source==='voice'){
    const played=await one(tx,"SELECT created_at FROM call_events WHERE restaurant_id=$1 AND call_id=$2 AND type='recap_played' AND data->>'quoteToken'=$3 ORDER BY id DESC LIMIT 1",[t,c.call_id,quoteToken]);
    assert(played,'Récapitulatif pas encore entièrement entendu');
    const speech=await one(tx,"SELECT data FROM call_events WHERE restaurant_id=$1 AND call_id=$2 AND type='speech_received' AND created_at>$3 ORDER BY id DESC LIMIT 1",[t,c.call_id,played.created_at]);
    const said=speech?.data?.text?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[.!?,]/g,'').trim();
    assert(said&&/^(oui( c'est (bien )?(ca|bon))?( je confirme)?( merci)?|je confirme( la commande)?|c'est (bien )?(ca|bon)|exactement|tout a fait|oui parfait)$/.test(said),'Demandez une confirmation claire : « oui, je confirme ».');
   }
   const r=await this.restaurant(t,tx);const cart=priceCart(c.data,await this.menu(t,tx),r.settings,{complete:true});assert(digest(cart)===c.data.quoteDigest,'Le menu a changé : nouveau récapitulatif requis',409);
   const order=await one(tx,'INSERT INTO orders(id,restaurant_id,cart_id,call_id,total_cents,snapshot) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[randomUUID(),t,id,c.call_id,cart.totalCents,JSON.stringify(cart)]);
   await tx.query('INSERT INTO customers(id,restaurant_id,name,phone) VALUES($1,$2,$3,$4) ON CONFLICT(restaurant_id,phone) DO UPDATE SET name=EXCLUDED.name',[randomUUID(),t,cart.customer.name,cart.customer.phone]);
   if(c.call_id)await tx.query("UPDATE calls SET outcome='ORDER_CREATED' WHERE id=$1 AND restaurant_id=$2",[c.call_id,t]);
   await this.event(t,c.call_id,'order_confirmed',{version:c.version,source},tx);await this.event(t,c.call_id,'order_created',{orderId:order.id},tx);return order;
  });this.publish(t);return order;
 }
 async changeStatus(t,id,status){const transitions={NEW:['CONFIRMED','CANCELLED'],CONFIRMED:['PREPARING','CANCELLED'],PREPARING:['READY','CANCELLED'],READY:['COMPLETED','CANCELLED'],COMPLETED:[],CANCELLED:[]};const order=await this.db.transaction(async tx=>{const o=await one(tx,'SELECT * FROM orders WHERE restaurant_id=$1 AND id=$2 FOR UPDATE',[t,id]);assert(o,'Commande inconnue',404);assert(transitions[o.status]?.includes(status),'Transition de statut impossible',409);return one(tx,'UPDATE orders SET status=$1 WHERE restaurant_id=$2 AND id=$3 RETURNING *',[status,t,id]);});this.publish(t);return order;}
}
