import twilio from 'twilio';
import {createHmac,timingSafeEqual} from 'node:crypto';
export class TwilioProvider {
 constructor(env=process.env){this.env=env;}
 verify(req){return !!this.env.TWILIO_AUTH_TOKEN&&twilio.validateRequest(this.env.TWILIO_AUTH_TOKEN,req.headers['x-twilio-signature']||'',this.env.PUBLIC_BASE_URL+req.originalUrl,req.body||{});}
 sign(callId,exp=Date.now()+60000){const payload=callId+'.'+exp;return payload+'.'+createHmac('sha256',this.env.STREAM_SECRET).update(payload).digest('hex');}
 verifyToken(token,callId){try{const [id,exp,sig]=token.split('.');if(id!==callId||Number(exp)<Date.now())return false;const expected=this.sign(id,Number(exp)).split('.')[2];return sig.length===expected.length&&timingSafeEqual(Buffer.from(sig),Buffer.from(expected));}catch{return false;}}
 streamTwiml(callId,token){const r=new twilio.twiml.VoiceResponse();const s=r.connect().stream({url:this.env.PUBLIC_BASE_URL.replace(/^http/,'ws')+'/telephony/media'});s.parameter({name:'callId',value:callId});s.parameter({name:'token',value:token});r.say({language:'fr-FR'},'La connexion a été interrompue. Merci de rappeler le restaurant.');return r.toString();}
 unavailable(message){const r=new twilio.twiml.VoiceResponse();r.say({language:'fr-FR'},message);r.hangup();return r.toString();}
 async transfer(sid,number){if(!/^\+[1-9]\d{7,14}$/.test(number))throw new Error('Numéro de transfert non configuré');const r=new twilio.twiml.VoiceResponse();r.say({language:'fr-FR'},'Je vais vous passer quelqu’un du restaurant.');r.dial({timeout:25},number);r.say({language:'fr-FR'},'Le restaurant ne répond pas. Merci de rappeler.');return twilio(this.env.TWILIO_ACCOUNT_SID,this.env.TWILIO_AUTH_TOKEN).calls(sid).update({twiml:r.toString()});}
 async finish(sid){return twilio(this.env.TWILIO_ACCOUNT_SID,this.env.TWILIO_AUTH_TOKEN).calls(sid).update({status:'completed'});}
}
