# CallChef — décisions d’architecture

Version construite le 30 septembre 2026. Le code est un MVP exécutable ; ce document ne certifie pas une recette téléphonique passée.

| Composant | Choix livré | Motif / arbitrage |
| --- | --- | --- |
| Téléphonie | Twilio Programmable Voice + Media Streams bidirectionnels | Flux PCMU et mécanismes clear/mark documentés ; transfert par modification de l’appel. Numéros français sous validation réglementaire, stock non garanti. |
| Voix et LLM | OpenAI Realtime, `gpt-realtime-2.1`, configurable | Speech-to-speech et tools dans une session ; réduit le nombre de composants du premier pilote. Ce choix reste une hypothèse de qualité à mesurer avec de vrais appels français. |
| STT/TTS | Intégrés au moteur Realtime ; transcription configurable | Pas de cascade STT → LLM → TTS dans cette version. Le découpage fournisseur est au niveau moteur vocal, pas une fausse interchangeabilité de protocoles différents. |
| Backend | Node.js 22+, Express 5, ws | Serveur persistant adapté aux connexions audio longues, à héberger sur un service sans mise en veille. |
| SQL | PostgreSQL + pg | Transactions et verrous de panier, contraintes de tenant et unicité des commandes. PGlite, PostgreSQL embarqué, sert au développement et aux tests ; interdit en production. |
| Frontend | HTML/CSS/JavaScript modulaire | Six vues légères, sans étape de compilation ; code serveur et interface dans un dépôt. SSE pour actualisation à environ 1 seconde, sans rafraîchissement de page. |
| Hébergement pilote | Render, Docker + PostgreSQL, région Francfort | Recette de déploiement incluse. Un seul serveur applicatif initialement. Le dashboard privé Sites peut se connecter à ce backend, mais Sites n’exécute pas le serveur Node fourni. |

## Alternatives réellement envisagées

- **GPT-Live-1** : modèle full-duplex et mécanisme de délégation documentés. Son cycle de session diffère de Realtime. Intégrer ce moteur demande un adaptateur et une recette dédiés ; changer seulement le nom du modèle ne suffit pas. À comparer au pilote Realtime pour les interruptions et le naturel conversationnel.
- **Fish Audio** : candidat TTS pour une future cascade. Les fonctionnalités documentées ne démontrent pas à elles seules une chaîne complète de commande et de téléphonie à 0,05 €/min. Aucun adaptateur Fish fictif livré.
- **ElevenLabs Agents** : alternative intégrée qui déplace l’orchestration de la conversation chez le fournisseur. À comparer si la priorité devient le délai de mise en production plutôt que la maîtrise du pont vocal.
- **Deepgram / Cartesia** : composants d’une cascade STT/LLM/TTS. Ajouter une cascade impose de gérer VAD, interruptions, assemblage des réponses et mesures de latence. Différé pour ce pilote.
- **LiveKit / Pipecat** : couches d’orchestration utiles pour multiproviders et multimodal ; ajouter un framework avant le premier restaurant augmente la surface d’intégration.
- **Telnyx** : alternative téléphonique avec streaming média. Le domaine ne dépend pas de Twilio ; il faut développer et tester le transport Telnyx avant de l’activer.
- **Supabase** : utilisable comme PostgreSQL externe via une connexion adaptée au serveur persistant ; pas nécessaire de coupler le MVP à son auth/realtime propriétaire.

Ces arbitrages sont des décisions d’ingénierie, pas un benchmark de fournisseurs. Aucune supériorité de coût ou de latence n’est revendiquée sans mesure.

## Flux et invariants

1. Twilio appelle `/telephony/incoming` ; signature validée avec l’URL publique exacte.
2. Le numéro appelé choisit le restaurant dans SQL. L’appelant ne choisit jamais un tenant.
3. TwiML connecte un flux WSS à `/telephony/media`, avec jeton HMAC d’une minute lié à l’appel, CallSid et AccountSid vérifiés.
4. Le pont envoie/reçoit du PCMU 8 kHz ; pas de conversion audio inutile.
5. Chaque tool est validé par Zod. Le tenant et le panier sont injectés côté serveur, jamais fournis par le LLM.
6. Le domaine lit produits et options dans SQL. Les montants sont des entiers en centimes.
7. `prepareConfirmation` valide les choix, l’adresse, le minimum et les horaires. Un jeton représente la version et le prix exacts du panier.
8. Le pont attend un `mark` Twilio confirmant la lecture audio de la réponse. Une interruption annule les marks en attente.
9. `confirmOrder` exige ce mark et une transcription client affirmative postérieure. Les réponses mêlant oui et modification sont rejetées. Les formulations reconnues sont volontairement limitées : l’agent peut redemander « oui, je confirme ».
10. Transaction, verrou de panier et unicité `orders.cart_id` rendent la création idempotente. Les requêtes restaurateur filtrent systématiquement le tenant autorisé.
11. L’interface reçoit un événement SSE lorsqu’une commande ou son statut change.

**Limite importante :** le serveur ne peut pas prouver que la voix générée a fidèlement lu chaque mot du récapitulatif. Le mark prouve la fin de lecture audio, pas la justesse sémantique. Le modèle reste probabiliste. Les commandes enregistrées sont strictement validées ; les paroles de l’IA doivent être évaluées avec les appels de recette. Pour une garantie vocale supérieure, ajouter une lecture TTS déterministe du récapitulatif, avec les compromis de voix et latence associés.

## Modèle de données simplifié

`restaurants`, `users`, `restaurant_users`, `sessions`, `phone_numbers`, `products`, `calls`, `carts`, `orders`, `customers`, `call_events`, `tool_results`.

Les catégories sont une colonne, les groupes/options de produits sont en JSONB validé, et les lignes du panier/commande sont des snapshots JSONB. Il n’y a pas une table par concept : cette simplification est intentionnelle pour le MVP. Une taille tarifée peut être un groupe d’options. Les commandes conservent leurs prix même après modification du menu.

L’isolation est applicative (membership + requêtes tenant) et renforcée par des FK composites sur appels/paniers/commandes ; ce n’est pas une implémentation PostgreSQL RLS. Pour exposer directement la base à d’autres clients, ajouter RLS avant cette exposition.

## Sources officielles consultées

- https://developers.openai.com/api/docs/guides/realtime-conversations
- https://developers.openai.com/api/docs/guides/voice-websockets
- https://developers.openai.com/api/docs/models/gpt-live-1
- https://developers.openai.com/api/docs/guides/live-delegation
- https://www.twilio.com/docs/voice/media-streams/websocket-messages
- https://www.twilio.com/en-us/guidelines/fr/regulatory
- https://www.twilio.com/en-us/voice/pricing/fr
- https://docs.fish.audio/overview/capabilities
- https://docs.livekit.io/agents/
- https://docs.pipecat.ai/overview/introduction
- https://render.com/docs/web-services

## Limites avant une ouverture commerciale

- Pas d’appel réel effectué sans clés fournisseurs et numéro ; accès modèle et protocole à valider avec votre compte.
- Tests automatisés sur SQL embarqué et transports simulés, pas sur un serveur PostgreSQL distant ni un opérateur téléphonique.
- Un serveur initial ; les flux audio sont en mémoire, aucune reprise transparente d’appel après redémarrage. Une panne tente le transfert configuré ; sinon l’appel se termine avec un échec journalisé.
- Contrôle d’usage par durée maximale de 10 minutes/appel et silence ; ajouter quotas globaux par compte/tenant avant commercialisation.
- Livraison uniquement par codes postaux, pas de géocodage/rayon effectif.
- Pas de paiement, impression automatique, SMS ou POS. Les commandes sont remises au dashboard.
- Un compte propriétaire est créé par la commande setup. Pas d’inscription publique, reset email ou invitations salariés dans ce MVP.
- L’enregistrement audio est absent/désactivé ; un opt-in d’enregistrement n’est pas implémenté.
- Pas de facturation SaaS automatisée ni plans minute enforceables.
- Dashboard sans vérification visuelle automatisée dans cet environnement ; tester sur les tablettes cibles avant le rush.
