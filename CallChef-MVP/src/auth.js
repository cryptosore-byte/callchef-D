import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { one } from './db.js';
export const hashToken=t=>createHash('sha256').update(t).digest('hex');
export function hashPassword(p){if(p.length<12)throw new Error('Mot de passe : 12 caractères minimum');const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(p,salt,64).toString('hex');}
export function verifyPassword(p,hash){const [salt,h]=hash.split(':');const a=Buffer.from(h,'hex'),b=scryptSync(p,salt,64);return a.length===b.length&&timingSafeEqual(a,b);}
export async function login(db,email,password){const user=await one(db,'SELECT * FROM users WHERE email=$1',[email.toLowerCase().trim()]);const fallback='00000000000000000000000000000000:'+ '00'.repeat(64);if(!verifyPassword(password,user?.password_hash||fallback)||!user) return null;const token=randomBytes(32).toString('base64url');await db.query("INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')",[hashToken(token),user.id]);return token;}
export async function authenticate(db,token){if(!token)return null;return one(db,'SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',[hashToken(token)]);}
