# Installer Révizo sur l’iPad

L’application Expo fournit une version web installable. Sur l’iPad, ouvrir l’adresse de Révizo dans Safari, utiliser **Partager → Sur l’écran d’accueil**, puis ouvrir l’icône Révizo. Le manifeste demande un affichage indépendant et accepte les deux orientations. Les icônes et le titre de l’écran d’accueil sont inclus dans l’export.

L’installation et le service worker nécessitent une origine HTTPS. `localhost` est autorisé pour les tests de développement ; une adresse LAN en HTTP comme `http://192.168.…` ne suffit pas pour le cache web sur l’iPad. Le serveur familial écoute localement par défaut : l’hébergement HTTPS et l’accès au réseau familial doivent être configurés pour l’iPad. Voir les conditions de contexte sécurisé dans la [documentation MDN des service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Ce qui fonctionne hors ligne

Après une première ouverture en ligne et l’installation du service worker, l’interface peut être rechargée sans réseau. Les cours, exercices et tentatives déjà enregistrés dans l’espace familial de cet appareil restent disponibles selon la session locale. Les changements en attente sont conservés dans un snapshot local unique et reprennent leur synchronisation à la reconnexion. Deux modifications concurrentes du même contenu demandent de choisir la version à conserver.

Les documents privés utilisent le cache documentaire séparé de l’application : il faut les avoir ouverts/téléchargés au préalable. Le service worker ne conserve aucun appel API, fichier importé, réponse authentifiée ou ressource d’un autre site. La création d’un compte, l’import durable d’un nouveau document, une génération IA et la synchronisation vers un autre appareil nécessitent le serveur. Le navigateur peut supprimer ses données de site pour libérer de l’espace ; l’export familial et les sauvegardes du serveur restent nécessaires.

## Construire et intégrer

```sh
npx expo export --platform web
node scripts/prepare-pwa.mjs
```

Le script ajoute le manifeste, les icônes, les balises iPad et `sw.js` dans `dist/`. Il calcule un identifiant de cache à partir du contenu du build. L’enregistrement est explicite dans le layout :

```tsx
import { registerOfflineShell } from '@/services/offline-shell';
useEffect(() => { void registerOfflineShell(); }, []);
```

Le module natif est sans effet ; la variante web enregistre le worker uniquement dans un export de production et un contexte sécurisé. Le développement Expo ne conserve pas de worker de cette application.

Le worker met en cache une liste fermée des fichiers statiques produits par l’export. Une navigation utilise le réseau tant qu’il répond, puis revient à l’interface locale si le réseau est absent. Les fichiers statiques versionnés peuvent être lus dans le cache. Une nouvelle version attend la fermeture des anciennes pages avant activation ; fermer tous les onglets Révizo puis rouvrir l’application termine sa mise à jour. Ce choix évite de mélanger l’interface d’une version avec les scripts d’une autre. L’[approche PWA d’Expo](https://docs.expo.dev/guides/progressive-web-apps/) décrit l’ajout du manifeste et du service worker aux exports web.

Une application iPad native reste possible à partir du même projet Expo. Cette version web installable n’est pas une publication App Store. Une distribution native nécessite une compilation iOS signée et le parcours de distribution Apple correspondant.

## Vérifier

`tests/domain/family-sync.test.ts` couvre la reprise après fermeture hors ligne, la migration des anciens enregistrements, les conflits et leur résolution, les changements pendant une requête, le verrou 409 et l’attente d’un envoi avant rechargement explicite.

`tests/server/pwa.test.ts` construit un export minimal, vérifie les métadonnées iPad et le versionnement, exécute les événements du worker et confirme que les API/documents privés ne sont pas interceptés. Le parcours navigateur doit également ouvrir la version exportée en contexte sécurisé, attendre l’installation, couper le réseau, recharger une route enfant puis vérifier la reprise à la reconnexion.
