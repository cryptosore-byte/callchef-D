# Mesurer les coûts avant de vendre

Les forfaits 299 €/1 000 min, 599 €/3 000 min et 999 €/6 000 min sont des hypothèses commerciales. Le coût cible de 0,05 €/min n’est pas validé par ce code.

Les réponses Realtime enregistrent leur usage brut dans `calls.usage.responses`. Configurez dans l’environnement les six tarifs EUR par million de tokens (audio/texte, entrée/sortie, entrée cachée) correspondant à votre contrat et au taux de change que vous retenez. Sans tarif suffisant, le dashboard affiche « Non chiffré », jamais un zéro fictif. Le coût Realtime est une estimation fondée sur les réponses et non une facture fournisseur.

`TELEPHONY_EUR_PER_MINUTE` sert à une estimation simple arrondie à la minute d’après le callback final Twilio. Les appels transférés peuvent impliquer des jambes et tarifs additionnels non capturés ; location du numéro, streaming, transcription séparée, taxes et hébergement doivent être intégrés à votre suivi comptable. Ne pas assimiler le chiffre affiché à un coût complet.

Calculs pour le suivi :
- coût/appel = voix + transcription + transport + streaming + transfert éventuel ;
- coût/minute = coûts appels / durée cumulée facturable ;
- coût/commande = coûts appels / commandes non annulées ;
- marge contributive = chiffre d’affaires HT - coûts variables - infrastructure allouée (hors votre temps, support, acquisition, taxes et autres frais).

Exemple purement hypothétique, minutes intégralement consommées :

| Plan | Prix | Coût variable si 0,05 €/min | Reste avant autres frais | Si 0,10 €/min |
| --- | ---: | ---: | ---: | ---: |
| Starter | 299 € | 50 € | 249 € | 199 € |
| Pro | 599 € | 150 € | 449 € | 299 € |
| Scale | 999 € | 300 € | 699 € | 399 € |

À 0,15 € la minute supplémentaire, il reste 0,10 € si le coût réel est 0,05 €, et 0,05 € s’il est 0,10 €, avant les autres charges. Les exemples supposent prix et coûts sur une même base fiscale. Mesurer au moins 30 appels représentatifs avant de verrouiller les forfaits.

Sources à vérifier lors de l’activation :
- https://developers.openai.com/api/docs/pricing
- https://www.twilio.com/en-us/voice/pricing/fr
