# API CallChef

JSON, prix en centimes EUR. Routes `/api` protégées par `Authorization: Bearer TOKEN` sauf `/api/login`. Routes restaurant exigent `X-Restaurant-Id: UUID` ; la membership est toujours vérifiée côté serveur. Aucun tenant fourni par un tool vocal n’est accepté.

| Méthode | Route | Corps / résultat |
| --- | --- | --- |
| POST | `/api/login` | `{email,password}` → `{token}` |
| GET | `/api/me` | Compte et restaurants autorisés |
| POST | `/api/logout` | Révoque le token courant |
| POST | `/api/restaurants` | `{name}` → restaurant privé au compte connecté |
| GET | `/api/overview` | KPI du jour dans le fuseau du restaurant |
| GET | `/api/orders` | 200 dernières commandes |
| GET | `/api/orders/:id` | Détail et conversation associée |
| PATCH | `/api/orders/:id` | `{status}` ; transitions validées |
| GET | `/api/calls` | 200 derniers appels |
| GET | `/api/calls/:id` | Appel et événements |
| GET | `/api/customers` | 300 premiers clients et commandes |
| GET | `/api/menu` | Produits et groupes d’options |
| POST | `/api/menu` | Création/mise à jour produit par propriétaire ; voir `productSchema` |
| GET | `/api/settings` | Informations, numéros et indicateurs de configuration sans secrets |
| PATCH | `/api/settings` | `{name,settings}` validé par `settingsSchema` |
| POST | `/api/carts` | Crée panier de test manuel |
| GET | `/api/carts/:id` | Panier, version et prix serveur |
| POST | `/api/carts/:id/action` | `{action,args}` pour add/update/remove/setCustomer |
| POST | `/api/carts/:id/quote` | Snapshot exact et jeton temporaire |
| POST | `/api/carts/:id/confirm` | `{quoteToken,confirmed:true}` → commande manuelle idempotente |
| GET | `/api/events` | SSE authentifié `orders_changed` |
| POST | `/telephony/incoming` | Formulaire Twilio signé → TwiML |
| POST | `/telephony/status` | Callback Twilio signé |
| WSS | `/telephony/media` | Flux Twilio authentifié via token HMAC du start |
| GET | `/health` | Test de disponibilité SQL |

Le panier vocal est créé automatiquement au démarrage de l’appel ; `createCart` n’est pas exposé au LLM. `prepareConfirmation` produit le devis ; `confirmOrder` valide et crée atomiquement la commande. Il n’existe pas de `createOrder` séparé permettant de contourner cette étape.

La création manuelle est une action authentifiée du restaurateur, distinguée dans les événements par `source=dashboard`. Elle ne prétend pas être une confirmation téléphonique.

Toutes les entrées outils sont validées par Zod et les erreurs métier retournées au modèle. Les erreurs inattendues ne retournent ni SQL ni secrets. Les listes sont bornées, sans pagination dans cette version.
