# Validation de Révizo 1.0 — 9 novembre 2026

## Résultats exécutés

| Contrôle                                                        | Résultat                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run typecheck`                                             | Client et serveur sans erreur TypeScript.                                       |
| `npm test`                                                      | 114 tests réussis ; le test Ollama opt-in est exclu de cette commande.          |
| `npm run build`                                                 | Export web/PWA et serveur Node compilés.                                        |
| `REVIZIO_LIVE_AI=1 npm run test:e2e`                            | 74 parcours réussis, aucun échec et aucune relance, en 6 min 17 s.              |
| `REVIZIO_LIVE_AI=1 npx vitest run tests/server/live-ai.test.ts` | 1 essai réel photo/PDF/multi-cours réussi en 26 s.                              |
| Export iOS Expo/Hermes                                          | Bundle compilé de 5,7 Mo ; ce n’est pas un IPA signé.                           |
| Serveur compilé                                                 | Démarrage réel, interface et `/api/health` disponibles ; modèle Ollama détecté. |

La campagne Playwright inclut 72 parcours sans inférence sur quatre configurations : Chromium 1180 × 820 et 820 × 1180, puis WebKit avec profil iPad 1194 × 834 et 834 × 1194. Deux parcours Ollama réels s’ajoutent sur Chromium paysage. Les six cas ignorés correspondent à ces mêmes deux inférences sur les trois autres configurations ; leur répétition n’est pas nécessaire pour vérifier l’interface. En CI sans Ollama, les huit variantes de ces deux tests sont explicitement ignorées.

**110 captures** et le rapport JSON de cette campagne sont conservés dans le paquet de recette joint à la [release v1.0.0](https://github.com/juliencorre/revizio/releases/tag/v1.0.0). Les captures ont été examinées, notamment les formulaires en portrait, les plans, les cartes d’anglais, les schémas et les corrections. Les données et documents de test sont synthétiques ; ils ne contiennent pas de cours ni de comptes familiaux réels.

## Parcours couverts

- Création familiale, mots de passe et PIN, profils multiples, changement de profil sans perte de navigation, déconnexion/reconnexion, accès parent refusé à l’enfant et isolation des profils côté serveur.
- Import PNG/PDF, ordre et rotation, conservation des fichiers après rechargement, brouillons, relecture, publication explicite, exclusion des contenus non publiés et consultation des originaux par l’enfant.
- Cinq formats d’exercices, correction sur les questions réellement présentées, réponse écrite, reprise, bilan, anciennes corrections, contrôle blanc sans indice ni correction intermédiaire, échéance persistante et remise à l’expiration.
- Plans, publication, lecture et contrôle blanc terminés, report de date avec conservation du travail effectué et respect du budget quotidien.
- Reprise ciblée des questions réellement ratées, aperçu parent des réponses et corrections, absence de modification de l’essai initial ; consolidation explicitement annoncée quand aucune erreur n’est connue.
- Schémas de fraction et droite graduée : valeurs invalides refusées, aperçu, conservation du brouillon, publication et rappel de mémoire côté enfant. La frise utilise les mêmes règles d’axes et de repères validées.
- Répertoire anglais, brouillon, confirmation parent, cartes et quiz. Le raccordement à la synthèse vocale est instrumenté dans les tests ; le son réellement entendu dépend du système.
- Export/restauration avec pièces jointes, rejet d’une sauvegarde invalide et révocation des sessions enfant après restauration.
- Installation automatique du cache statique, rechargement hors connexion, reprise à la question suivante, fin de séance locale et bilan intact après reconnexion. Le cache du service worker exclut les API et fichiers privés ; les documents sont conservés séparément.

Les tests métier couvrent aussi les instantanés, réponses idempotentes, sauvegarde atomique, reprise de modifications en attente, fusion de changements indépendants, conflits explicites, modifications pendant un envoi et résistance aux nouvelles propriétés locales invalides.

## IA réellement exécutée

Ollama `ministral-3:8b` a été utilisé sans substitut dans les deux parcours navigateur : photo imprimée → OCR → fiche → récupération du travail après rechargement → publication → cinq formats → connexion enfant et bilan ; puis photo de vocabulaire anglais → relecture → publication → cartes et quiz. Le test serveur complémentaire vérifie aussi un PDF et une série répartie entre deux cours.

Les contrôles refusent les citations inventées, les formats invalides, les réponses numériques contradictoires et les problèmes regroupant plusieurs résultats comme s’il s’agissait de variantes d’une seule réponse. Les calculs explicites pris en charge sont vérifiés par un parseur borné. Les résultats restent des brouillons : ces essais ne garantissent pas l’exactitude de tout problème rédigé ni la lecture de tous les manuscrits.

## Corrections issues de la recette

Publication bloquée par des sections facultatives vides, perte de saisie sur rechargement immédiat, stockage Blob incompatible avec WebKit, état de connexion après déconnexion, navigation réinitialisée au changement de profil, report surchargeant une journée déjà travaillée et conservation du texte OCR lors d’une régénération ont été corrigés. La régénération réutilise aussi les textes OCR corrigés par le parent, lit les nouveaux fichiers sans répéter le texte et garde le numéro du brouillon ; les régressions correspondantes sont testées. Une dernière inspection visuelle a corrigé la hauteur des cartes de contrôle en portrait ; 32 parcours complémentaires sur les quatre configurations ont ensuite réussi, avec vérification que les champs restent à l’intérieur de leur carte.

## Limites pratiques

WebKit sur Linux avec profil iPad ne remplace pas un iPad physique. La caméra, les autorisations Photos/Fichiers, le clavier système, les gestes natifs et les voix effectivement audibles restent à vérifier sur appareil. Le bundle iOS n’est ni signé ni distribué sur l’App Store. Le mode web hors connexion sur iPad demande HTTPS et une première ouverture en ligne. Un corpus familial de manuscrits, formules et schémas réels reste à évaluer avec relecture parentale.
