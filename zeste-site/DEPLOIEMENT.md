# Mettre Zeste en ligne sur ton VPS Hostinger

> **Installation en place sur ton VPS (zeste.delivery)**
>
> Ton VPS fait déjà tourner un Caddy dans Docker (`sel-crm-caddy-1`) qui gère les ports 80/443 pour le CRM.
> Zeste tourne donc dans son propre conteneur `zeste-site`, sur le réseau `sel-crm_default`, et le bloc
> `zeste.delivery` a été ajouté à la fin de `/root/sel-crm/Caddyfile` (sauvegarde : `Caddyfile.avant-zeste`).
> `install.sh` (ci-dessous) ne sert plus sur ce VPS.
>
> | Pour… | Commande (Web console, en root) |
> |-------|----------------------------------|
> | Mettre le site à jour | `bash /opt/zeste/deploy/update.sh` |
> | Activer / changer le formulaire | `nano /etc/zeste/zeste.env` puis `bash /opt/zeste/deploy/update.sh --restart` |
> | Revenir à la version d'avant la dernière mise à jour | `bash /opt/zeste/deploy/update.sh --rollback` |
> | Revenir au site d'avant la scène 3D (commit `35d7b1a`) | `bash /opt/zeste/deploy/update.sh --version 35d7b1a54f87ef18dc30eee0c57386f58c173a67` |
> | Voir les erreurs | `docker logs --tail 30 zeste-site` |
> | Après toute modification de `/root/sel-crm/Caddyfile` | `docker restart sel-crm-caddy-1` (un simple *reload* peut ne pas voir le fichier si un éditeur l'a remplacé) |
>
> La toute première fois, `update.sh` n'est pas encore sur le VPS :
> `curl -fsSL https://raw.githubusercontent.com/cryptosore-byte/callchef-D/claude/clever-heisenberg-zh277j/zeste-site/deploy/update.sh | bash`

## Installation sur un VPS vierge

Environ 15 minutes. Remplace partout `tondomaine.fr` par ton vrai domaine et `IP_DU_VPS` par l'adresse IP de ton VPS (affichée dans hPanel → VPS).

Ce que ça installe : le site, le formulaire de contact (envoi par e-mail), le HTTPS automatique (Caddy, certificat gratuit renouvelé tout seul) et un service qui redémarre automatiquement si le VPS redémarre.

---

## 1. Faire pointer le domaine vers le VPS

Le domaine reste chez IONOS ; on lui dit seulement d'envoyer les visiteurs vers le VPS Hostinger.

1. Récupère l'IP du VPS : hPanel → **VPS** → **Gérer** → « Adresse IP » (IPv4, 4 nombres du type `82.25.xx.xx`).
2. Connecte-toi sur ionos.fr → **Domaines & SSL** → clique sur ton domaine → onglet **DNS**.
3. Modifie ou crée ces enregistrements :

| Type | Nom d'hôte | Valeur | Action |
|------|-----------|--------|--------|
| A | `@` | `IP_DU_VPS` | modifier celui qui existe |
| A | `www` | `IP_DU_VPS` | modifier ou créer (si `www` est un CNAME, le supprimer d'abord) |
| AAAA | `@` et `www` | (IP IONOS) | **supprimer** |

Si IONOS demande de confirmer le changement d'utilisation du domaine, accepte. Ne touche pas aux enregistrements MX/TXT (e-mails).

La prise en compte prend de quelques minutes à quelques heures. Vérifier : sur [dnschecker.org](https://dnschecker.org), tape ton domaine, type **A** : l'IP du VPS doit apparaître.

## 2. Envoyer le site sur le VPS

Depuis ton ordinateur (Terminal sur Mac, PowerShell sur Windows), dans le dossier où se trouve le zip :

```bash
scp zeste-site.zip root@IP_DU_VPS:/root/
```

## 3. Se connecter au VPS

Soit hPanel → VPS → **Terminal navigateur**, soit depuis ton ordinateur :

```bash
ssh root@IP_DU_VPS
```

## 4. Installer

```bash
apt-get update && apt-get install -y unzip
unzip -o zeste-site.zip -d zeste
sudo bash zeste/deploy/install.sh tondomaine.fr
```

À la fin, le script affiche `En ligne sur https://tondomaine.fr`. Ouvre l'adresse : le site est là. Le formulaire indique pour l'instant « Aperçu », c'est normal tant que l'étape 5 n'est pas faite.

## 5. Activer le formulaire de contact

Il faut une adresse e-mail qui envoie les demandes. Ton domaine étant chez IONOS, le plus simple est d'y créer une boîte `contact@tondomaine.fr` (ionos.fr → **E-mail** ; une adresse est souvent incluse avec le domaine). Réglages d'envoi IONOS : `SMTP_HOST=smtp.ionos.fr`, `SMTP_PORT=465`.

```bash
sudo nano /etc/zeste/zeste.env
```

Remplis :

- `SMTP_HOST` : `smtp.ionos.fr` (boîte IONOS) — ou `smtp.hostinger.com` si tu utilises Hostinger Email
- `SMTP_PASSWORD` : le mot de passe de la boîte `contact@tondomaine.fr`
- `MAIL_TO` : l'adresse où tu veux recevoir les demandes (ton Gmail par exemple)

Enregistre (`Ctrl+O`, `Entrée`, `Ctrl+X`), puis :

```bash
sudo systemctl restart zeste
```

Recharge le site : sous le formulaire, la note devient « Votre demande sera transmise à Zeste par e-mail. » Fais une demande de test.

> Avec Gmail à la place de Hostinger Email : `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` = ton adresse Gmail, `SMTP_PASSWORD` = un **mot de passe d'application** Google (pas ton mot de passe habituel), `MAIL_FROM` = la même adresse Gmail.

## 6. Mettre à jour le site plus tard

Envoie le nouveau zip (étape 2), puis sur le VPS :

```bash
unzip -o zeste-site.zip -d zeste
sudo bash zeste/deploy/install.sh tondomaine.fr
```

Ta configuration e-mail (`/etc/zeste/zeste.env`) est conservée.

---

## En cas de problème

| Symptôme | À faire |
|----------|---------|
| Le site ne s'ouvre pas en HTTPS | Le DNS n'est pas encore à jour (étape 1), ou les ports 80/443 sont fermés : hPanel → VPS → **Pare-feu**, autoriser TCP 80 et 443. |
| `address already in use` dans `systemctl status caddy` | Un autre serveur web occupe le port 80 : `sudo systemctl disable --now apache2 nginx`, puis relancer l'installation. |
| Le formulaire affiche une erreur d'envoi | Vérifier le mot de passe et le serveur SMTP dans `/etc/zeste/zeste.env`, puis `sudo systemctl restart zeste`. |
| Voir ce qui se passe | `sudo journalctl -u zeste -n 50` et `sudo journalctl -u caddy -n 50` |

Le formulaire est protégé : il n'accepte que les envois venant de ton domaine, limite le nombre de demandes (5 par visiteur en 15 min) et n'écrit aucune donnée de formulaire dans les journaux.
