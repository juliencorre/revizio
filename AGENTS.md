# Révizo

Application familiale de révision scolaire, iPad en priorité. Expo / React Native / TypeScript, avec une version web.

## Conventions
- Interface et contenu en français ; nom public Révizo, dépôt revizio.
- Respecter les maquettes fournies : grandes cartes, violet indigo, couleurs par matière, parcours enfant simple.
- Utiliser les composants partagés de src/components/ui.tsx et les tokens de src/theme.ts.
- Les routes sont dans src/app, les écrans dans src/features, les données dans src/domain et src/state.
- Le premier lot est une démonstration locale. Ne jamais présenter une génération simulée comme une vraie IA ni un rôle local comme une authentification sécurisée.
- Aucune clé secrète dans le client. Les futurs traitements IA et contrôles d'accès appartiennent au serveur.
- Les contenus non publiés restent dans l'espace parent. Les tentatives conservent les questions et corrections réellement présentées.

## Collaboration
- Chaque agent utilise son worktree et sa branche feat/*.
- Respecter le périmètre de fichiers attribué ; ne pas modifier package.json ni le lockfile sans coordination.
- Faire des commits ciblés. L'agent principal intègre les branches séquentiellement.

## Vérification
- npm run typecheck
- npm test
- npm run export:web
- Vérifier les parcours en paysage et portrait ; zones tactiles d'au moins 44 px.
- Tests utiles : publication, correction, sauvegarde/reprise, résistance aux données locales invalides.
