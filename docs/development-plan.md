# Plan de développement et périmètre Révizo

## Cible

Une famille d’abord, iPad en priorité, avec le même socle Expo / React Native / web. Les 12 PNG fournis (2360 × 1640) sont la référence : grandes cartes neumorphiques, violet indigo, matières colorées et parcours enfant simple. Ils décrivent l’interface, sans fournir de corpus de cours permettant de valider un OCR scolaire réel.

Les fonctions ci-dessous sont implémentées dans le dépôt. Cette matrice décrit le périmètre du code ; les campagnes réellement exécutées et leurs limites appartiennent à [validation.md](validation.md).

## Matrice des 12 maquettes

| Maquette                        | Parcours implémenté                                                                                                                                       | Point de recette                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1 · Qui se connecte             | `/`, `/auth` : création familiale, compte parent, PIN enfant, profils distincts ; démonstration séparée.                                                  | Accès parent protégé, mauvais code, déconnexion et changement de profil.                                      |
| 2 · Accueil enfant              | `/student` : matières, contenus publiés, prochain contrôle, reprise d’une série, rappels de lecture.                                                      | Famille vide, profil réel et accès au plan depuis le contrôle annoncé.                                        |
| 3 · Tableau de bord parent      | `/parent` : fiches à vérifier, contrôles publiés à venir, activités réelles et préparations serveur.                                                      | Compteurs sans exemples injectés et changement de profil.                                                     |
| 4 · Cours d’une matière         | `/student/subject/[id]` : cours, fiches, prochain contrôle et séries de la matière.                                                                       | Exclusion des brouillons, état vide et lien vers le plan correspondant.                                       |
| 5 · Fiche de révision           | `/student/course/[id]` : essentiel, vocabulaire, méthode, exemples, documents d’origine, rappel actif, audio et schémas structurés.                       | Lecture des vrais fichiers conservés et rappel distinct d’un score.                                           |
| 6 · Exercices et plan           | `/student/exercises`, `/student/plans` : séries, reprise, séances datées et étapes terminées.                                                             | Plan réellement publié, séance manquée et retour après interruption.                                          |
| 7 · Exercice en cours           | `/student/exercise/[id]` : QCM, vrai/faux, texte à trous, réponse courte, problème, indices et corrections ; examen chronométré.                          | Clôture, réponses non saisies, échéance persistante et historique inchangé.                                   |
| 8 · Progrès                     | `/student/progress` : essais terminés, bonnes réponses, lectures et erreurs du dernier essai.                                                             | Les indices et répétitions restent inclus et explicités ; aucun score de maîtrise inventé.                    |
| 9 · Créer ou compléter un cours | `/parent/import`, `/parent/review/[id]` : photo/fichier/PDF/texte, ordre et rotation, brouillon durable, IA ou rédaction manuelle, relecture/publication. | Reload immédiat, source illisible, correction OCR et copie d’un cours publié.                                 |
| 10 · Préparer des exercices     | `/parent/exercises` : plusieurs cours de la même matière, cinq formats, niveaux, 5/10/15/20 questions, date, génération réelle ou édition manuelle.       | Tous les cours couverts, réponses vérifiées et publication parent explicite.                                  |
| 11 · Contrôles et plans         | `/parent/controls` : matière, date, chapitres, budget quotidien, calendrier proposé modifiable, contrôle blanc et report.                                 | Publication avec exercices approuvés ; report en brouillon préservant le travail terminé et le budget.        |
| 12 · Anglais                    | `/parent/english`, `/student/english` : mots FR/EN, verbes, temps, mots outils, extraction photo à confirmer, cartes audio et quiz lexical borné.         | Aperçu avant partage, absence de vocabulaire ajouté silencieusement et conservation des anciennes tentatives. |

Les réglages familiaux et **Mes préparations** prolongent les maquettes : profils, compte, modèle IA, sauvegarde/restauration, progression des jobs, reprise des brouillons et relance des erreurs.

## Décisions en vigueur

- **Déploiement familial** : une instance Node.js 24 / Fastify, SQLite et documents privés sur le serveur de la famille. PostgreSQL et un service public pour plusieurs familles sont différés.
- **IA locale réelle** : Ollama ; PDF textuel via Poppler, OCR imprimé Tesseract français, vision de secours avec incertitude visible. Les jobs et leurs résultats sont persistants et ne publient jamais seuls.
- **Validation parentale** : sources, fiches et corrections restent à relire. L’anglais et le calendrier comportent aussi des constructions déterministes clairement identifiées.
- **Historique stable** : les tentatives gardent les questions et corrections présentées ; les révisions de contenus ne réécrivent pas les résultats passés.
- **Synchronisation et hors connexion** : copies locales par profil, révisions serveur, fusion des changements indépendants et choix explicite en cas de conflit. Cache documentaire web/natif séparé du service worker qui conserve uniquement l’interface statique exportée.
- **Présentation fidèle aux faits** : activités, lectures et résultats distincts ; aucune assimilation entre fiche ouverte et notion maîtrisée.

L’installation reproductible est dans le [README](../README.md), les frontières techniques dans [architecture.md](architecture.md) et les endpoints/variables dans [backend.md](backend.md).

## Étapes de recette et consolidation

1. Terminer les campagnes automatiques de parcours familiaux, publication, reprise, synchronisation, plans et anglais sur Chromium et WebKit, paysage/portrait ; conserver captures et échecs résolus dans le rapport de validation.
2. Faire la recette sur iPad physique, Safari puis application native : clavier ouvert, gestes tactiles, permissions Photos/Fichiers/caméra, rotation, audio FR/EN et interruptions. Les cibles tactiles visées restent d’au moins 44 px.
3. Évaluer un corpus familial anonymisé d’imprimés, manuscrits, formules et schémas. Mesurer les lectures erronées et citations manquantes, corriger les cas reproductibles, conserver la relecture parent pour tout partage.
4. Vérifier les parcours à deux appareils, les conflits sur le même contenu, la perte réseau et une restauration à partir d’une copie exportée hors du serveur.

## Limites conservées explicitement

- Aucun test de navigateur de bureau ne valide la caméra, les voix et les permissions d’un iPad physique. L’audio dépend des voix et capacités du système ; un appel de synthèse vocale testé ne prouve pas un son réellement entendu.
- L’OCR/vision peut confondre les signes ou le manuscrit. Les contrôles arithmétiques portent sur des expressions explicites prises en charge, sans garantir tous les problèmes rédigés.
- Les schémas sont des données structurées bornées, sans éditeur de dessin ni interprétation générale d’images géométriques. Le quiz lexical automatique d’anglais travaille les mots et formes approuvés ; il ne constitue pas un dialogue libre.
- La révision espacée utilise un intervalle simple après une lecture déclarée. Il n’y a pas de notification push ni d’estimation de mémorisation.
- L’interface hors connexion demande une première ouverture en ligne et l’installation du service worker en contexte sécurisé. Sur iPad, une adresse LAN en HTTP ne suffit pas : prévoir HTTPS. Les documents doivent être conservés au préalable ; l’IA et l’envoi vers un autre appareil restent en ligne. Voir [le guide iPad](ipad-offline.md).
- L’instance ne fournit pas de récupération de mot de passe par e-mail ni de portail public pour plusieurs familles. Le compte parent et le répertoire de données doivent être conservés pour exploiter durablement cette installation.
