# CallChef

MVP de prise de commande téléphonique : Twilio → OpenAI Realtime → panier SQL déterministe → confirmation → dashboard restaurant.

**État de livraison :** backend, frontend, migrations, tools, adaptateurs téléphoniques/vocaux, tests et fichiers de déploiement fournis. Les tests locaux utilisent PostgreSQL embarqué (PGlite) et des événements fournisseurs simulés. Aucun appel réel n’a été effectué ; il faut vos clés OpenAI/Twilio, un numéro et un serveur public pour valider le scénario final. Le lien Sites héberge l’interface et le guide, pas le serveur vocal Node.

## Essai local sans compte payant

Installez [Node.js](https://nodejs.org/) version 22.9+ ou 24 LTS. Décompressez le projet, ouvrez un terminal dans le dossier contenant `package.json` :

```bash
npm ci
npm run setup
npm start
```

`setup` demande votre email et un mot de passe de 12 caractères minimum (masqué). Ouvrez **http://localhost:3000**, connectez-vous, puis :

1. Réglages → vérifiez le menu et les horaires, activez la prise de commande → Enregistrer.
2. Vue d’ensemble → Tester une commande → choisissez un produit et ses options.
3. Donnez un nom et un numéro de test au format international → Vérifier et récapituler → Confirmer.
4. La commande apparaît dans le dashboard. Dans un deuxième onglet connecté, elle apparaît sans rafraîchissement.

Le test manuel crée une vraie ligne de commande dans la base de développement ; il ne simule pas une conversation IA. `.data/postgres` contient les données locales. Arrêtez le serveur avant de lancer une autre commande qui ouvre cette même base embarquée. En production, PostgreSQL est obligatoire.

## Activation téléphonique — six étapes

### STEP 1 — Créer les comptes

- [OpenAI Platform](https://platform.openai.com/) : créez un projet API et activez sa facturation. L’abonnement ChatGPT ne remplace pas le crédit API.
- [Twilio Console](https://console.twilio.com/) : compte voix, facturation et justificatifs pour votre numéro français.
- [Render](https://dashboard.render.com/) et un dépôt GitHub privé pour déployer le serveur. Le blueprint demande un service et une base payants : vérifiez les prix avant de le lancer.

### STEP 2 — Récupérer les clés

OpenAI : API keys → Create new secret key. Vérifiez que votre projet peut utiliser le modèle configuré.
Twilio : Account SID et Auth Token dans la console du compte.
Ne collez pas ces secrets dans le dashboard CallChef, un dépôt public ou un message.

### STEP 3 — Déployer et placer les clés

1. Créez un dépôt GitHub **privé** et importez les fichiers de ce projet. N’importez jamais `.env`, `.data` ou `node_modules`.
2. Dans Render : New → Blueprint → connectez ce dépôt. Le fichier `render.yaml` décrit le service Docker et PostgreSQL à Francfort.
3. Renseignez `OPENAI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` dans les champs secrets.
4. `PUBLIC_BASE_URL` doit être l’URL HTTPS exacte de votre service, sans `/` final. Si Render ne l’affiche qu’après création, utilisez une URL HTTPS provisoire, puis remplacez-la par l’URL réelle et redéployez **avant de configurer Twilio**.
5. `DATABASE_URL` vient du blueprint ; `STREAM_SECRET` est généré. `DASHBOARD_ORIGIN` : mettez l’origine exacte du dashboard privé Sites si vous l’utilisez, sinon l’URL du service Render. Ne mettez pas `*`.
6. Attendez que Render indique que le service est opérationnel. `/health` doit répondre `{"ok":true,"service":"callchef"}`.
7. Dans Render → votre service → Shell : lancez `npm run setup`. Notez l’identifiant du restaurant affiché. Connectez-vous au dashboard à l’URL du serveur, ou renseignez celle-ci via « Configurer la connexion au serveur » sur le dashboard Sites.

**Autre hébergement :** `Dockerfile` et `compose.yaml` sont fournis. Le serveur doit accepter les WebSockets durables, exposer HTTPS/WSS et ne pas être mis en veille. Pour Compose, créez `.env` depuis `.env.example`, ajoutez `POSTGRES_PASSWORD` (alphanumérique long), configurez votre reverse proxy HTTPS puis `docker compose up -d --build`. Les données SQL ont un volume persistant ; les sauvegardes restent à configurer.

### STEP 4 — Acheter et rattacher le numéro

1. Twilio → Phone Numbers → Buy a number → France → capacité **Voice**. Suivez les justificatifs demandés ; la disponibilité dépend de votre dossier et du stock.
2. Dans le shell du serveur :

```bash
node scripts/bind-number.js IDENTIFIANT_DU_RESTAURANT +33VOTRENUMERO
```

Remplacez les deux valeurs. Ce script vérifie que le numéro appartient au compte Twilio configuré. Il ne l’achète pas et n’appelle personne.

3. Sur la fiche du numéro Twilio : **A call comes in** → Webhook → `https://VOTRE-SERVEUR/telephony/incoming` → **HTTP POST**.
4. Renseignez aussi **Call status changes / Status callback** → `https://VOTRE-SERVEUR/telephony/status` → **HTTP POST**.
5. Enregistrez. N’ajoutez pas de slash final ni de query string. Une URL erronée entraîne un refus de signature.

### STEP 5 — Préparer Chicken World

Dans CallChef → Réglages : adresse, horaires Europe/Paris, numéro humain au format `+33…`, message d’accueil et notice de transcription. Vérifiez chaque produit du menu d’exemple, ses prix, suppléments et ingrédients. Activez « Accepter les commandes ». La livraison est désactivée par défaut ; activez-la seulement après validation des codes postaux, du minimum et des frais.

Sur Render le service se lance automatiquement. En local avec `.env` rempli, lancez `npm start`, mais Twilio nécessite un tunnel HTTPS public correctement configuré — un numéro ne peut pas joindre votre `localhost`.

### STEP 6 — Appeler le numéro acheté

Appelez depuis votre téléphone, pendant un horaire ouvert :

> « Deux menus Chicken Spicy, un Coca et un Ice Tea. Finalement enlève celui avec Coca et ajoute un burger seul avec fromage. »

Donnez le nom et le téléphone. Écoutez le récapitulatif, dites « oui, je confirme ». Vérifiez les lignes, options, montant, transcription et statut dans CallChef. La commande du scénario ci-dessus vaut **22,80 €** avec les prix du menu initial : 12,90 € + 8,90 € + 1 €.

Effectuez ensuite le protocole de recette dans `docs/TESTING.md`. Aucun numéro n’est fourni dans cette livraison, car aucun n’a été acheté ou provisionné.

## Architecture du dépôt

| Chemin | Rôle |
| --- | --- |
| `src/server.js` | API HTTP, auth, routes restaurant, webhooks, lancement WSS |
| `src/domain.js` | Panier pur, règles de prix, horaires et livraison |
| `src/service.js` | Transactions SQL, versions, récapitulatifs, création idempotente |
| `src/tools.js` | Schémas et exécution des fonctions accessibles au modèle |
| `src/bridge.js` | Pont audio, barge-in, journal, preuve de lecture et transfert |
| `src/providers/` | Contrat fournisseur, OpenAI et Twilio |
| `src/auth.js` | Hashs scrypt, sessions hachées |
| `src/db.js` | PostgreSQL / PGlite et migrations |
| `src/costs.js` | Estimation par usage de tokens |
| `db/migrations/` | SQL versionné |
| `dist/` | Interface, six vues et guide ; seuls fichiers publiés par Sites |
| `scripts/` | Setup, migration, rattachement numéro, purge et validation |
| `tests/` | Domaine, API et contrats des adaptateurs |
| `docs/` | Architecture, coûts, confidentialité, API et recette |

## Validation

```bash
npm run check
npm test
```

Les tests vérifient les sept scénarios demandés **au niveau des tools et événements audio simulés**. Ils ne prouvent pas la compréhension de phrases naturelles, des accents ou du bruit par le modèle. Aucune mesure de latence téléphonique ni garantie de 0,05 €/min n’est produite.

## Ce qui reste volontairement explicite

- Le catalogue fourni est illustratif, pas le menu contractuel d’un vrai Chicken World.
- Seuls Twilio et OpenAI Realtime sont implémentés. Fish, GPT-Live, Telnyx et les autres demandent un adaptateur testé.
- Le débit SSE dépend d’un sondage SQL à une seconde ; pas de framework realtime externe.
- Catégories/options et lignes sont simplifiées en colonnes/JSONB, pas en vingt tables.
- Les coûts affichés ne sont pas une facture complète. Voir `docs/COSTS.md`.
- La purge doit être planifiée ; la conformité des traitements et les sauvegardes restent à organiser.
- Déploiement Render, Docker et appel opérateur non exécutés dans cet environnement sans comptes/accès.
