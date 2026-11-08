# Révizo

[Dépôt GitHub public](https://github.com/juliencorre/revizio)

Application familiale de révision, conçue pour l’iPad : les parents importent les cours et relisent les fiches et exercices préparés avec une IA locale ; l’enfant retrouve les contenus publiés, ses plans et ses résultats. Expo, React Native et TypeScript partagent le même socle web et natif.

## Ouvrir l’espace familial

Vous avez téléchargé le paquet serveur compilé d’une release ? Suivre [son guide d’installation](docs/installation-release.md). Les commandes ci-dessous partent du dépôt source.

Installer Node.js 24, npm, Ollama et Poppler (`pdftotext`, `pdfinfo`, `pdftoppm` disponibles dans le PATH). Ollama doit fonctionner sur la machine qui exécute le serveur Révizo.

```sh
npm ci
ollama pull ministral-3:8b
npm run build
npm run serve
```

Ouvrir `http://127.0.0.1:4173`, choisir **Parent**, puis créer le compte parent et le premier profil enfant avec son code. Le premier espace familial est vide. Les exemples d’Alex sont accessibles séparément avec **Essayer la démonstration**.

Le serveur conserve SQLite et les pièces jointes privées dans `.revizio/`. Il utilise par défaut Ollama à `http://127.0.0.1:11434` et le modèle `ministral-3:8b`. Ces réglages se modifient dans **Réglages**. Les premières lectures OCR téléchargent les données françaises de Tesseract ; elles sont ensuite mises en cache. Le détail des variables, limites et sauvegardes figure dans le [guide serveur](docs/backend.md).

Pour accéder au serveur depuis l’iPad du même réseau :

```sh
HOST=0.0.0.0 PORT=4173 npm run serve
```

Ouvrir alors l’adresse réseau de cette machine dans Safari. Pour une installation durable, servir l’application et `/api` sous la même origine HTTPS ; définir `SECURE_COOKIES=true` derrière cette terminaison HTTPS. Safari permet ensuite **Partager → Sur l’écran d’accueil**. Le cache de l’interface s’installe après une première ouverture en ligne ; une adresse LAN en HTTP ne suffit pas sur iPad. Voir [installation iPad et hors connexion](docs/ipad-offline.md).

## Premier parcours

1. **Ajouter un cours** : choisir matière et titre, joindre photos/PDF ou texte, conserver le brouillon.
2. **Préparer la fiche** : lancer la vraie préparation IA ou rédiger à la main, comparer aux documents, corriger et confirmer la relecture avant de publier.
3. **Préparer des exercices** : choisir les cours, les formats, le niveau et le nombre ; relire les questions et corrections avant publication.
4. **Contrôles et plans** : choisir une date et un temps quotidien, ajuster les séances puis partager le plan. **Anglais** définit le vocabulaire, les verbes et temps autorisés.
5. L’enfant entre avec son profil et son code ; il lit, s’exerce, reprend ses essais et revoit ses erreurs. Les **Réglages** parent gèrent les profils et l’export/restauration des sauvegardes.

Les générations continuent sur le serveur et se retrouvent dans **Mes préparations**. Aucun résultat IA n’est publié automatiquement. La rédaction manuelle et le quiz lexical déterministe ne sont pas présentés comme de l’IA.

## Développer avec Expo

Le serveur de développement se lance avec `npm run server`. Pour une application iOS/Android, démarrer Metro dans un autre terminal :

```sh
npm start
```

Utiliser un client Expo compatible avec le SDK 58 ou un development build. Configurer l’adresse du serveur familial dans l’écran de connexion ; elle doit être joignable depuis l’appareil. Le simulateur iOS nécessite macOS et Xcode. `npm run web` ouvre le client Expo web de développement ; le parcours familial le plus simple utilise l’export servi avec son API à la même origine.

## Périmètre actuel

Photos/PDF durables, comptes parent/enfant, plusieurs profils, synchronisation par révisions, préparations Ollama, cinq formats d’exercices, contrôles blancs chronométrés, plans modifiables, cartes d’anglais et lecture audio sont implémentés. Les tentatives conservent les questions et corrections réellement affichées.

Les photos manuscrites, formules et schémas nécessitent une relecture attentive ; une extraction incertaine est signalée. Après installation du cache en contexte sécurisé, l’interface et les contenus déjà conservés peuvent être repris hors connexion ; les générations et la synchronisation nécessitent le serveur. La caméra, les voix système et l’application native restent à vérifier sur iPad physique. Voir la [matrice fonctionnelle et les étapes restantes](docs/development-plan.md).

## Vérifier

```sh
npm run typecheck
npm test
npm run export:web
npx playwright install chromium webkit
npm run test:e2e
```

Les tests navigateur utilisent un serveur réel éphémère et une base de test distincte. Ils couvrent les orientations paysage/portrait avec Chromium et WebKit ; cela ne remplace pas Safari sur iPad physique. Le test opt-in `REVIZIO_LIVE_AI=1 npx vitest run tests/server/live-ai.test.ts` nécessite Ollama et les outils PDF ; voir le [guide serveur](docs/backend.md).

Les résultats exécutés et leurs limites sont consignés dans [la validation](docs/validation.md).

## Organisation

- `src/app` : routes Expo Router.
- `src/features` : écrans enfant et parent.
- `src/components` : composants partagés.
- `src/domain` : modèles, règles et données de démonstration.
- `src/state` : état de l’application et persistance.
- `server` : sessions, SQLite, documents privés et file IA.
- `tests` : règles métier et parcours.

Voir [l’architecture](docs/architecture.md), [le plan](docs/development-plan.md) et [les contrats actuels](docs/contracts-v2.md).

## Collaboration

Développement par agents dans des branches et worktrees indépendants. L’intégration est faite séquentiellement sur `main`. Voir [AGENTS.md](AGENTS.md).

Le fichier LICENSE conserve la licence du modèle Expo utilisé pour initialiser le projet.
