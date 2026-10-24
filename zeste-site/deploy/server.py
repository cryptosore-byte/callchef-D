"""Zeste VPS: static site and validated SMTP contact endpoint (Python stdlib)."""
import json, os, re, smtplib, ssl, time, threading
from collections import defaultdict, deque
from email.message import EmailMessage
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parent.parent / 'dist'
REQUIRED_ENV = ('SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM', 'MAIL_TO', 'PUBLIC_ORIGIN')
FIELDS = {'name':80, 'restaurant':120, 'email':254, 'phone':30, 'address':250, 'sites':80, 'platform':100, 'source':120, 'offer':30, 'goal':2000, 'deliveryOther':200, 'sourceOther':200, 'website':200}
REQUIRED_FIELDS = ('name','restaurant','email','phone','address','sites','platform','source','goal')
OFFERS={'delivery':'Delivery — 300 € HT/mois','digital':'Delivery + Digital — 500 € HT/mois','undecided':'À définir ensemble'}
EMAIL = re.compile(r'^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$')

def ready():
    return all(os.getenv(k) for k in REQUIRED_ENV) and bool(EMAIL.fullmatch(os.getenv('MAIL_FROM',''))) and bool(EMAIL.fullmatch(os.getenv('MAIL_TO','')))

def validate(payload):
    if not isinstance(payload,dict): raise ValueError('Formulaire invalide.')
    clean={}
    for key,limit in FIELDS.items():
        value=payload.get(key,'')
        if not isinstance(value,str) or len(value)>limit: raise ValueError('Un champ est invalide ou trop long.')
        if '\x00' in value: raise ValueError('Caractère invalide.')
        clean[key]=value.strip()
    if clean['website']: raise ValueError('Envoi non accepté.')
    if any(not clean[k] for k in REQUIRED_FIELDS): raise ValueError('Merci de remplir tous les champs obligatoires.')
    if not EMAIL.fullmatch(clean['email']): raise ValueError('Adresse e-mail invalide.')
    if len(re.sub(r'\D','',clean['phone']))<6: raise ValueError('Numéro de téléphone invalide.')
    if clean['offer'] not in OFFERS: raise ValueError('Offre invalide.')
    for choice,other in [('platform','deliveryOther'),('source','sourceOther')]:
        if clean[choice]=='Autre' and not clean[other]: raise ValueError('Merci de préciser votre choix « Autre ».')
        if clean[choice]!='Autre': clean[other]=''
    return clean

def make_message(data):
    message=EmailMessage()
    message['From']=os.environ['MAIL_FROM'];message['To']=os.environ['MAIL_TO']
    message['Reply-To']=data['email'];message['Subject']='Zeste — Nouvelle demande de contact'
    labels={'name':'Prénom','restaurant':'Restaurant','email':'E-mail','phone':'Téléphone','address':'Adresse','sites':'Établissements','platform':'Système de livraison','deliveryOther':'Précision livraison','source':'Comment nous avez-vous connus','sourceOther':'Précision provenance','goal':'Priorité'}
    lines=['NOUVELLE DEMANDE Zeste','',f"Offre : {OFFERS[data['offer']]}"]
    for k,label in labels.items():
        if data[k]: lines.append(f'{label} : {data[k]}')
    message.set_content('\n\n'.join(lines));return message

def deliver(data):
    msg=make_message(data);ctx=ssl.create_default_context();port=int(os.getenv('SMTP_PORT','587'))
    if port==465:
        connection=smtplib.SMTP_SSL(os.environ['SMTP_HOST'],port,timeout=12,context=ctx)
    else:
        connection=smtplib.SMTP(os.environ['SMTP_HOST'],port,timeout=12)
    with connection as smtp:
        if port!=465: smtp.ehlo();smtp.starttls(context=ctx);smtp.ehlo()
        smtp.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD'])
        refused=smtp.send_message(msg)
        if refused: raise smtplib.SMTPRecipientsRefused(refused)

lock=threading.Lock();attempts=defaultdict(deque);global_attempts=deque()
def admit(ip):
    now=time.monotonic()
    with lock:
        for key in list(attempts):
            while attempts[key] and now-attempts[key][0]>900: attempts[key].popleft()
            if not attempts[key]: del attempts[key]
        while global_attempts and now-global_attempts[0]>60: global_attempts.popleft()
        if len(attempts[ip])>=5 or len(global_attempts)>=20:return False
        attempts[ip].append(now);global_attempts.append(now);return True

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def setup(self):super().setup();self.connection.settimeout(15)
    def log_message(self,fmt,*args):pass # No form data, addresses or request paths in logs.
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');self.send_header('Referrer-Policy','strict-origin-when-cross-origin');super().end_headers()
    def reply(self,code,obj):
        body=json.dumps(obj,ensure_ascii=False).encode();self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/api/contact-status':return self.reply(200,{'ready':bool(ready())})
        if path.startswith('/api/'):return self.reply(404,{'error':'Introuvable.'})
        if any(x.startswith('.') for x in unquote(path).split('/') if x):return self.reply(404,{'error':'Introuvable.'})
        return super().do_GET()
    def list_directory(self,path):self.send_error(404);return None
    def do_POST(self):
        if urlsplit(self.path).path!='/api/contact':return self.reply(404,{'error':'Introuvable.'})
        if not ready():return self.reply(503,{'error':'Le formulaire n’est pas encore activé. Aucune demande envoyée.'})
        if self.headers.get('Origin')!=os.environ['PUBLIC_ORIGIN'].rstrip('/'):return self.reply(403,{'error':'Origine non autorisée.'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.reply(415,{'error':'Format invalide.'})
        ip=self.client_address[0]
        if os.getenv('TRUST_PROXY')=='1':ip=self.headers.get('X-Forwarded-For',ip).split(',')[0].strip()
        if not admit(ip):return self.reply(429,{'error':'Trop de demandes. Merci de réessayer plus tard.'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<1 or size>16384:return self.reply(413,{'error':'Formulaire trop volumineux.'})
            data=validate(json.loads(self.rfile.read(size)))
        except (ValueError,UnicodeError):return self.reply(400,{'error':'Vérifiez les champs obligatoires, le téléphone et l’e-mail.'})
        except (TimeoutError,OSError):return self.reply(408,{'error':'Délai de réception dépassé.'})
        try:deliver(data)
        except Exception:
            return self.reply(502,{'error':'Le service e-mail n’a pas confirmé l’envoi. Merci de réessayer.'})
        return self.reply(200,{'ok':True})

if __name__=='__main__':
    server=ThreadingHTTPServer((os.getenv('BIND','127.0.0.1'),int(os.getenv('PORT','8099'))),Handler)
    print('Zeste server ready',flush=True);server.serve_forever()
