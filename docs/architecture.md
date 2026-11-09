# Architecture familiale Révizo

## Application universelle

Expo SDK 58, React Native et TypeScript partagent les écrans iPad, iOS/Android et web. Expo Router sépare les parcours `/parent` et `/student`. La version web est une SPA (`web.output: single`) ; le serveur familial sert l’export `dist/`, les routes dynamiques vers `index.html` et l’API `/api` à la même origine.

Les composants de `src/components/ui.tsx` et les tokens de `src/theme.ts` portent les surfaces neumorphiques, le violet indigo et les couleurs par matière. Les écrans restent des composants React Native. Les 12 maquettes PNG fournies définissent les parcours de référence.

La mise en page suit les classes de taille de fenêtre de Material Design (`windowClassFor` dans `src/theme.ts`) :

- **compacte** (< 600 px, smartphone) : barre supérieure, barre de navigation en bas limitée à cinq destinations et feuille « Plus » pour les autres ; pendant un exercice, la barre laisse place à l’action principale fixée sous la question ;
- **moyenne** (600 à 999 px, tablette en portrait, smartphone en paysage) : rail de navigation vertical ;
- **étendue** (≥ 1000 px, tablette en paysage, ordinateur) : tiroir latéral.

Marges, titres, cartes et grilles s’ajustent à la classe ; `useContentWidth` donne la largeur réellement mesurée dans le cadre. La destination courante est annoncée par `aria-current` et l’anneau de focus n’apparaît qu’à la navigation au clavier. Toutes les zones tactiles gardent au moins 44 px.

## Serveur d’une famille

Node.js 24 et Fastify fournissent les sessions, les autorisations et les traitements asynchrones. SQLite (`node:sqlite`, journal WAL) conserve comptes, profils, données scolaires, révisions, métadonnées de fichiers et jobs. Les originaux et fichiers normalisés sont dans le répertoire privé `.revizio/`, configurable avec `REVIZIO_DATA_DIR`.

Une instance crée un espace familial avec un compte parent et plusieurs profils enfant. PostgreSQL et un service public pour plusieurs familles ne font pas partie de ce déploiement. Le client ne contient ni secret IA ni accès direct à SQLite ou Ollama.

Les mots de passe et PIN utilisent scrypt avec sel. Le web reçoit un cookie HttpOnly SameSite Strict ; le natif conserve son jeton avec SecureStore. Le serveur contrôle le rôle et le profil pour les données, documents et préparations. Le choix d’un profil à l’écran ne suffit pas à autoriser une action serveur. L’accueil expose les prénoms/classes pour permettre le choix du profil.

## Frontière métier

`src/domain/model.ts` définit les modèles partagés. `learning.ts`, `answers.ts`, `planning.ts` et `english.ts` portent la validation, la publication, la correction, les plans et le périmètre anglais indépendamment de React. `src/state` orchestre ces règles, la session et la synchronisation. Le serveur revalide les données et recalcule les réponses enfant.

Une tentative contient une copie des questions et corrections présentées. Changer une série conserve donc les résultats passés. Les réponses d’entraînement sont idempotentes ; les examens conservent une échéance absolue, reportent les corrections à la soumission et comptent les questions non répondues lors de la clôture.

Cours, séries et plans sont brouillons ou publiés. Le parent confirme la relecture avant de partager. Les réponses API enfant excluent les brouillons et refusent la modification des contenus, réglages ou autres profils. Le report d’un contrôle repasse son plan en brouillon et préserve les séances terminées.

## Stockage et sources

SQLite est la référence des données familiales. AsyncStorage conserve une copie locale par profil, les changements en attente et les éditeurs non publiés. Les éditeurs persistent à chaque modification ; les écritures natives sont sérialisées et un passage en arrière-plan déclenche leur conservation. La démonstration d’Alex est indépendante et utilise uniquement ses exemples locaux.

`FamilySync` utilise des révisions et une fusion à trois versions. Les modifications indépendantes fusionnent ; un conflit sur le même contenu demande au parent de choisir la version. Les changements restent locaux quand le serveur est indisponible et sont retentés à la reprise. Il n’y a pas de synchronisation collaborative en temps réel.

Les photos et PDF sont copiés dans le stockage privé serveur. Les images sont normalisées et peuvent être tournées ; l’original reste conservé. Un enfant accède seulement aux documents d’un cours publié de son profil. IndexedDB sur le web et le stockage de fichiers natif conservent une copie des sources déjà consultées.

L’export web inclut un manifeste installable et un service worker versionné. Il conserve une liste fermée des fichiers statiques de l’interface et permet leur rechargement sans réseau après une première installation en contexte sécurisé. Les API et documents privés sont exclus de ce cache ; leurs copies locales restent gérées séparément. La création de compte, les nouveaux imports durables, l’IA et la synchronisation exigent le serveur. Une nouvelle version s’active après fermeture des anciennes pages.

## Préparations réellement générées

Le parent importe ou saisit un cours, puis demande une préparation. Le serveur enregistre le job en SQLite avant de le traiter dans une file séquentielle. Les états attente, lecture, préparation, relecture et erreur sont consultables ; les traitements interrompus reprennent après redémarrage. Quitter l’écran n’annule pas la génération. Une relance ne publie aucun contenu.

Poppler lit les PDF textuels ou rend leurs pages. Tesseract français traite l’imprimé ; les lectures trop courtes ou peu confiantes passent par la vision du modèle Ollama et restent signalées comme incertaines. Le premier téléchargement OCR nécessite le réseau, puis le cache est réutilisé.

Ollama retourne du JSON structuré. Le serveur contrôle formats, réponses, références aux sources et lexique anglais ; un calculateur arithmétique borné vérifie les expressions explicites qu’il sait interpréter. Une fiche conserve des passages retrouvés dans le cours. Ces contrôles ne prouvent pas la justesse de tout problème ou de toute lecture manuscrite : la relecture parent demeure une étape du produit.

Le quiz du répertoire anglais et la proposition de calendrier sont des règles déterministes annoncées comme telles. Les dates, scores et activités affichés proviennent des données du profil, sans inventer de maîtrise scolaire.

## Exploitation et limites

L’export JSON contient profils, cours, tentatives et documents ; il exclut les mots de passe, PIN, sessions et réglages serveur. La restauration exige confirmation, remplace les données familiales et révoque les sessions enfant. Une copie privée de l’état précédent est enregistrée avant remplacement. Une copie du répertoire serveur, serveur arrêté, complète cet export.

Les rappels de lecture doublent un intervalle simple jusqu’à 60 jours ; ils ne constituent pas une mesure de mémorisation. La lecture vocale utilise les voix du système via Expo Speech. Les schémas affichés sont des structures bornées (droite graduée, fraction, frise), sans interprétation générale de dessins manuscrits. Les tests WebKit ne remplacent pas la recette caméra, fichiers et audio sur iPad physique.

## Références

- [Installation et commandes](../README.md).
- [API, pipeline IA, variables et sauvegardes](backend.md).
- [Installation iPad, HTTPS et cache hors connexion](ipad-offline.md).
- [Contrats actuels](contracts-v2.md).
- [Matrice des parcours et étapes restantes](development-plan.md).
- [Preuves de validation et limites des campagnes](validation.md).
