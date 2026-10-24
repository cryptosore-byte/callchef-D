# Mettre Zeste en ligne sur ton VPS Hostinger

Environ 15 minutes. Remplace partout `tondomaine.fr` par ton vrai domaine et `IP_DU_VPS` par l'adresse IP de ton VPS (affichée dans hPanel → VPS).

Ce que ça installe : le site, le formulaire de contact (envoi par e-mail), le HTTPS automatique (Caddy, certificat gratuit renouvelé tout seul) et un service qui redémarre automatiquement si le VPS redémarre.

---

## 1. Faire pointer le domaine vers le VPS

hPanel → **Domaines** → ton domaine → **DNS / Serveurs de noms** :

| Type | Nom | Valeur |
|------|-----|--------|
| A | `@` | `IP_DU_VPS` |
| A | `www` | `IP_DU_VPS` |

Supprime les anciens enregistrements **A** (et AAAA) de `@` et `www` qui pointent ailleurs (page parking Hostinger). La prise en compte prend de quelques minutes à quelques heures.

Vérifier depuis ton ordinateur : `ping tondomaine.fr` doit afficher l'IP du VPS.

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

Il faut une adresse e-mail qui envoie les demandes. Le plus simple : créer une boîte `contact@tondomaine.fr` dans hPanel → **E-mails** (Hostinger Email).

```bash
sudo nano /etc/zeste/zeste.env
```

Remplis :

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
