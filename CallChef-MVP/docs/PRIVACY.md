# Données et pilote français

CallChef ne stocke aucun fichier audio. Il traite le flux audio chez les fournisseurs et conserve une transcription, les coordonnées de commande et les événements de traitement. Désactiver l’enregistrement côté application ne supprime pas les traitements et conservations propres aux fournisseurs.

Mesures livrées : secrets côté serveur uniquement ; mots de passe scrypt salés ; tokens de session stockés hachés côté SQL, expirant en 12 heures ; jeton navigateur uniquement en mémoire ; HTTPS requis en production ; signatures Twilio ; restrictions tenant ; message d’accueil identifiant l’IA et annonçant la transcription ; purge configurable entre 1 et 90 jours (30 par défaut, choix de produit et non durée légale universelle).

Planifier chaque nuit `npm run privacy:purge` avec la même `DATABASE_URL`. Le script purge transcriptions, numéros appelants et événements expirés. Il ne supprime pas les coordonnées présentes dans les commandes ni la fiche client : leur durée de conservation et les demandes d’accès/suppression doivent faire l’objet d’une procédure séparée tenant compte des obligations applicables. Ne pas prétendre que toute donnée personnelle est effacée après 30 jours.

Avant le pilote avec de vrais clients : définir les responsabilités restaurant/CallChef, les finalités, la base légale, les sous-traitants, leurs régions/règles de transfert, les délais de conservation et le canal d’exercice des droits. Compléter l’information d’accueil et une notice accessible. Vérifier les accords de traitement chez Twilio, OpenAI et l’hébergeur. Une région SQL européenne ne garantit pas à elle seule que l’intégralité du traitement audio reste dans l’UE.

Ne jamais prendre de carte bancaire, ni conclure qu’un plat est sans allergène si le restaurant ne le garantit pas. Une demande d’allergie complexe est dirigée vers un humain ; éviter de conserver des détails de santé dans les instructions de commande.

Sources de cadrage consultées le 30/09/2026 :
- CNIL : https://www.cnil.fr/fr/lecoute-et-lenregistrement-des-appels-sur-le-lieu-de-travail
- EDPB, assistants vocaux : https://www.edpb.europa.eu/documents/guideline/guidelines-022021-on-virtual-voice-assistants_en
- OpenAI, contrôles des données : https://developers.openai.com/api/docs/guides/your-data

Ce code n’est pas une certification RGPD. La documentation CNIL sur l’enregistrement au travail ne se transpose pas intégralement à tous les usages commerciaux d’un assistant vocal.
