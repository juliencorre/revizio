# Installer Révizo sur l’iPad

Révizo s’installe depuis le web avec son icône et s’ouvre dans une fenêtre dédiée, en portrait ou en paysage. Une carte d’installation se trouve sur l’écran des profils et dans **Famille**.

Sur iPad ou iPhone :

1. Ouvrir l’adresse HTTPS de Révizo dans Safari.
2. Toucher **Installer sur mon iPad ou iPhone** dans Révizo pour afficher les étapes.
3. Dans Safari, utiliser **Partager → Sur l’écran d’accueil** ; selon la version, toucher d’abord **Plus** pour trouver cette option.
4. Garder **Ouvrir comme app web** activé si cette option apparaît, puis toucher **Ajouter**.
5. Ouvrir l’icône Révizo depuis l’écran d’accueil. Une connexion à l’espace familial peut être nécessaire dans cette nouvelle application.

Ce parcours suit le [guide Apple pour installer une app web sur iPad](https://support.apple.com/fr-fr/guide/ipad/ipad8f1f7a29/ipados).

Sur Android ou ordinateur, **Installer Révizo** ouvre l’invitation du navigateur lorsqu’elle est disponible. Le bouton dépend de la prise en charge et des critères d’installation du navigateur ; il n’est pas affiché avant réception de l’événement [`beforeinstallprompt`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event). **Comment installer Révizo** reste disponible pour les étapes manuelles : menu d’installation dans Chrome/Edge, ou **Fichier → Ajouter au Dock** dans Safari sur Mac. Une invitation annulée peut être retrouvée depuis le menu du navigateur.

Quand Révizo est ouverte en mode autonome, l’invitation disparaît de l’accueil et **Famille** indique cet état. L’acceptation d’une invitation n’est pas présentée comme une installation terminée avant confirmation du navigateur.

L’installation et le service worker nécessitent une origine HTTPS. `localhost` est autorisé pour les tests de développement ; une adresse LAN en HTTP comme `http://192.168.…` ne suffit pas pour le cache web sur l’iPad. Le serveur familial écoute localement par défaut : l’hébergement HTTPS et l’accès au réseau familial doivent être configurés pour l’iPad. Voir les conditions de contexte sécurisé dans la [documentation MDN des service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Ce qui fonctionne hors ligne

Après une première ouverture en ligne et l’installation du service worker, la carte indique **Interface disponible hors ligne** et l’interface peut être rechargée sans réseau. Un échec du cache est signalé sans empêcher l’accès à l’application en ligne. Les cours, exercices et tentatives déjà enregistrés dans l’espace familial de cet appareil restent disponibles selon la session locale. Les changements en attente sont conservés dans un snapshot local unique et reprennent leur synchronisation à la reconnexion. Deux modifications concurrentes du même contenu demandent de choisir la version à conserver.

Les documents privés utilisent le cache documentaire séparé de l’application : il faut les avoir ouverts/téléchargés au préalable. Le service worker ne conserve aucun appel API, fichier importé, réponse authentifiée ou ressource d’un autre site. La création d’un compte, l’import durable d’un nouveau document, une génération IA et la synchronisation vers un autre appareil nécessitent le serveur. Le navigateur peut supprimer ses données de site pour libérer de l’espace ; l’export familial et les sauvegardes du serveur restent nécessaires.

## Construire et intégrer

```sh
npm run export:web
```

Le script ajoute le manifeste, les icônes, les balises iPad et `sw.js` dans `dist/`. Il calcule un identifiant de cache à partir du contenu du build. Le `PwaProvider` du layout enregistre le worker avec `registerOfflineShell`, observe son activation et les mises à jour, et conserve l’invitation d’installation pendant les changements de page.

Le module natif est sans effet ; la variante web enregistre le worker uniquement dans un export de production et un contexte sécurisé. Le développement Expo ne conserve pas de worker de cette application.

Le worker met en cache une liste fermée des fichiers statiques produits par l’export. Une fois activé, il utilise exclusivement le cache de sa version pour l’interface et les scripts ; le réseau prend le relais si un fichier manque. Une nouvelle version attend la fermeture des anciennes pages avant activation. La carte affiche **Une mise à jour est prête** : après la séance, fermer toutes les fenêtres et tous les onglets Révizo puis rouvrir l’application. Aucune actualisation forcée n’interrompt les exercices. Ce choix évite de mélanger l’interface d’une version avec les scripts d’une autre, même quand un nouveau cache a été préparé en arrière-plan. Une recherche de mise à jour a lieu à la réouverture de l’onglet et au retour du réseau. L’[approche PWA d’Expo](https://docs.expo.dev/guides/progressive-web-apps/) décrit l’ajout du manifeste et du service worker aux exports web.

Une application iPad native reste possible à partir du même projet Expo. Cette version web installable n’est pas une publication App Store. Une distribution native nécessite une compilation iOS signée et le parcours de distribution Apple correspondant.

## Vérifier

`tests/domain/family-sync.test.ts` couvre la reprise après fermeture hors ligne, la migration des anciens enregistrements, les conflits et leur résolution, les changements pendant une requête, le verrou 409 et l’attente d’un envoi avant rechargement explicite.

`tests/server/pwa.test.ts` construit un export minimal, vérifie les métadonnées iPad et le versionnement, exécute les événements du worker et confirme que les API/documents privés ne sont pas interceptés et que la navigation reste dans le cache actif.

`tests/e2e/pwa.spec.ts` vérifie le manifeste et les icônes servis, les critères d’installation Chromium, les guides, les invitations acceptées/annulées/en échec, le mode autonome, l’iPad avec identification de Mac, l’absence de contexte sécurisé et l’échec d’enregistrement du worker. Il crée aussi une vraie mise à jour du worker et vérifie sa notification sans activation ni rechargement forcés. `tests/e2e/offline.spec.ts` recharge une séance hors ligne et la termine avec ses corrections réellement présentées. Les projets Playwright couvrent Chromium et WebKit en portrait et paysage ; l’ajout effectif à l’écran d’accueil reste à valider sur un iPad physique.
