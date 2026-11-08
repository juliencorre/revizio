# Révizo

Application de révision scolaire familiale, conçue pour l’iPad, développée avec Expo, React Native et TypeScript. Une version web partage le même socle.

## Démarrer

Prérequis : Node.js 24 et npm.

```sh
npm ci
npm run web
```

Pour un appareil iOS ou Android : `npm start`, puis utiliser un client Expo compatible avec le SDK 58 ou un development build. Le simulateur iOS nécessite macOS et Xcode. Les permissions photo et documents sont configurées dans l’application.

## Premier lot

- Choix d’un profil de démonstration parent ou enfant.
- Matières et cours, fiches de révision structurées.
- Séries QCM, indices, correction expliquée, sauvegarde et reprise.
- Suivi factuel des résultats et erreurs.
- Import parent de photos/documents, édition et publication explicite.
- Création manuelle de séries d’exercices.
- Persistance locale sur l’appareil.

Il s’agit d’une première version locale : aucun service IA ou backend familial n’est connecté, et le sélecteur de profil n’est pas une authentification. Les sources importées ne sont pas encore synchronisées entre appareils. Ne pas utiliser de données sensibles dans cette démonstration. Les prochaines étapes sont détaillées dans [le plan de développement](docs/development-plan.md).

## Vérifier

```sh
npm run typecheck
npm test
npm run export:web
npm run test:e2e
```

Les tests de parcours web nécessitent Chromium installé pour Playwright (`npx playwright install chromium`). Les tests iPad physiques restent une étape distincte du contrôle web.

## Organisation

- `src/app` : routes Expo Router.
- `src/features` : écrans enfant et parent.
- `src/components` : composants partagés.
- `src/domain` : modèles, règles et données de démonstration.
- `src/state` : état de l’application et persistance.
- `tests` : règles métier et parcours.

## Collaboration

Développement par agents dans des branches et worktrees indépendants. L’intégration est faite séquentiellement sur `main`. Voir [AGENTS.md](AGENTS.md) et [les contrats partagés](docs/contracts.md).

Le fichier LICENSE conserve la licence du modèle Expo utilisé pour initialiser le projet.
