# Architecture du premier lot

## Application universelle

Expo SDK 58, React Native et TypeScript. Expo Router organise les routes par parcours parent/enfant. La version web est une SPA (`web.output: single`) : les cours créés localement ont des identifiants dynamiques qui ne peuvent pas être connus au moment de l’export. Un hébergement doit renvoyer `index.html` pour les routes sans fichier correspondant. Le serveur de prévisualisation fourni applique ce comportement.

La présentation partagée est dans `src/components/ui.tsx`, avec des couleurs dans `src/theme.ts`. La navigation latérale apparaît en paysage large ; une navigation horizontale prend le relais sur les petits écrans. Les écrans sont écrits avec les composants React Native.

## Frontière métier

`src/domain/model.ts` contient les objets métier. Les règles de publication et de correction appartiennent au domaine, indépendamment de React. L’état React orchestre ces règles et la persistance locale.

Une tentative contient une copie des questions présentées : une modification ultérieure d’une série ne change pas les résultats passés. Une réponse à une question est enregistrée une seule fois. La reprise utilise la première question sans réponse.

Les cours et séries ont un état brouillon ou publié. Les écrans enfant affichent uniquement les contenus publiés. Cette règle de présentation n’est pas un contrôle d’accès sécurisé dans une application locale.

## Stockage et sources

AsyncStorage conserve les données de démonstration, les cours saisis et les résultats sur l’appareil. Les erreurs et données locales invalides doivent être signalées sans bloquer l’ouverture de l’application.

Les sources choisies dans cette première version restent locales ; leur durabilité dépend de la plateforme et des URI retournées par les sélecteurs. Le lot serveur devra copier les fichiers vers un stockage privé durable, avec contrôle d’accès et URLs temporaires. Aucune promesse de conservation ou synchronisation des pièces importées n’est faite dans ce lot.

## Future IA

La génération sera déclenchée explicitement par le parent, traitée en arrière-plan côté serveur, puis relue avant publication. Les clés secrètes et les documents ne sont pas destinés à être exposés dans les variables publiques Expo. Les contrôles automatiques ne garantissent pas l’exactitude pédagogique ; la relecture humaine reste nécessaire.

## Références

- https://docs.expo.dev/more/create-expo/
- https://docs.expo.dev/router/installation/
- https://docs.expo.dev/guides/publishing-websites/
- https://docs.expo.dev/versions/latest/sdk/imagepicker/
- https://docs.expo.dev/versions/latest/sdk/document-picker/
