# Recette du MVP

## Automatisé

`npm run check` puis `npm test`. Base PostgreSQL embarquée temporaire ; aucune clé nécessaire et aucune requête fournisseur facturée. Les tests sont indépendants du menu de développement.

Couverture : corrections de quantité, suppléments, boissons distinctes, prix serveur, produit inconnu, changements multiples, choix requis, options/quantités invalides, isolation tenant, idempotence de commande, expiration de confirmation après changement, menu modifié, preuve de lecture et affirmation, livraison, horaires, statuts, clear/truncate de barge-in, signatures, tokens périmés et format de session OpenAI.

## Recette réelle à réaliser avec un numéro

Faire les tests avec un restaurant pilote dont les prix sont vérifiés. Utiliser d’abord vos propres coordonnées. Garder un membre du restaurant disponible sur le numéro de transfert.

| Cas | Attendu |
| --- | --- |
| Deux menus, puis enlever un | Une seule unité finale |
| Burger puis fromage | +1 € avec le menu initial |
| Deux menus, Coca et Ice Tea | Deux lignes, chacune sa boisson |
| « C’est combien ? » | Tool total et montant exact |
| Produit absent | Aucun ajout ni prix inventé |
| Trois changements | Dernier état exact |
| Interruption pendant la réponse | Arrêt audio perceptible, correction conservée |
| Interruption pendant récapitulatif | Nouvelle lecture et nouvelle confirmation |
| « Oui, mais enlève les frites » | Aucun envoi sur ce oui ambigu |
| Raccrocher avant confirmation | Aucune commande |
| Réessayer la même confirmation | Une commande unique |
| Demander un humain / allergie | Transfert au numéro configuré |
| Restaurant fermé | Pas de prise de commande |
| Hors zone de livraison | Livraison refusée |
| OpenAI indisponible | Transfert si possible, sinon échec journalisé |
| Deux restaurants | Aucun accès croisé aux commandes et appels |
| Deux onglets | Nouvelle commande visible sans refresh |
| Accent, hésitations, bruit de fond | Informations correctement reformulées ; ambiguïté clarifiée |

Noter pour 30 appels : durée, erreurs de compréhension, exactitude de prix et lignes, taux de transfert, temps entre fin de parole et premier audio, délai de coupure lors d’une interruption, réussite de confirmation, coût fournisseur complet. Le code ne produit pas automatiquement les métriques de latence acoustique.

Les résultats automatisés ne remplacent ni cette recette ni la validation des contrats d’API avec les comptes réels. Tester aussi les sauvegardes PostgreSQL et la restauration avant l’ouverture commerciale.
