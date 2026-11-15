# Révizo hébergé sur Cloudflare

L’application web complète utilise Workers pour l’interface et l’API, un Durable Object SQLite pour l’espace familial et ses documents privés, et Workers AI pour les préparations. L’ordinateur familial peut être éteint. Aucun serveur Node.js, Ollama, R2 ou domaine payant n’est nécessaire pour cette installation.

## Adresse de l’application

Révizo est accessible sur **https://cours.gofel.fr**. Le domaine personnalisé est déclaré dans `wrangler.jsonc` avec `custom_domain: true`. Cloudflare gère son enregistrement DNS et son certificat HTTPS ; l’interface et l’API `/api` partagent cette adresse. L’adresse `https://revizo.jcorre.workers.dev` reste également disponible.

Le domaine `gofel.fr` doit être actif dans le compte Cloudflare utilisé pour déployer. Pour une autre installation, remplacer `cours.gofel.fr` dans `routes` par son propre domaine actif, ou retirer `routes` pour utiliser uniquement l’adresse gratuite `workers.dev`. Voir la [documentation des domaines personnalisés Workers](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Le changement d’adresse conserve les données de l’installation Cloudflare, mais demande une nouvelle connexion sur le nouveau domaine. Pour l’iPad, créer le raccourci d’écran d’accueil depuis `cours.gofel.fr`. Les données d’un ancien serveur local se transfèrent avec une sauvegarde, comme décrit ci-dessous.

## Installer

Avec Node.js 24 et un compte Cloudflare sur l’offre **Workers Free** :

```sh
npm ci
npx wrangler login --device
npm run typecheck
npm test
npm run deploy:cloud
```

La connexion par code fonctionne même si le navigateur ne peut pas atteindre `localhost:8976`. Ouvrir l’adresse indiquée par Wrangler, saisir le code temporaire et autoriser la connexion.

Le script de déploiement construit le web, publie le Worker `revizo` sur `cours.gofel.fr` et en `workers.dev`, puis configure son secret d’installation. L’adresse `workers.dev` utilise le sous-domaine du compte. Le nom du Worker se règle dans `wrangler.jsonc` avant le premier déploiement.

Ouvrir cette adresse, choisir **Parent**, puis créer le compte parent et le premier enfant. Le formulaire demande aussi le code conservé dans le fichier local `.cloudflare/installation-code`. Ce code protège la première création de famille ; les connexions suivantes utilisent le mot de passe parent ou le code enfant. Sans secret configuré, la création est refusée, y compris entre la publication initiale et la configuration du secret.

Le fichier du code est privé, ignoré par Git, et réutilisé lors des déploiements suivants. Ne pas le publier. Aucun secret n’est intégré au bundle Expo ni aux variables `EXPO_PUBLIC_*`.

Dans Safari sur l’iPad, ouvrir l’adresse HTTPS puis **Partager → Sur l’écran d’accueil**. Le cache hors connexion s’installe après une première ouverture en ligne ; les préparations IA et la synchronisation nécessitent Internet.

## Données et préparations

Une installation correspond à un espace familial avec plusieurs profils. Le Durable Object est identifié par `FAMILY_ID` dans `wrangler.jsonc` ; conserver cette valeur et le nom de la classe `FamilyServer` lors des mises à jour pour retrouver les mêmes données.

Les comptes, sessions, révisions, cours, tentatives et préparations utilisent les mêmes règles que le serveur local. Les documents sont stockés par morceaux dans des tables SQLite privées, jamais dans les fichiers publics du site. Leur lecture passe par la session et le contrôle de publication : un enfant ne peut pas ouvrir un document de brouillon. Les API répondent avec `Cache-Control: no-store`.

Les préparations sont conservées avant leur lancement et traitées par une alarme durable. Une interruption du serveur remet le travail en attente ; une erreur d’IA laisse un travail en échec qui peut être relancé. Fermer le navigateur n’arrête pas le traitement. Aucun résultat IA n’est publié automatiquement.

L’IA hébergée utilise `@cf/google/gemma-4-26b-a4b-it` via une liaison serveur Cloudflare. Les textes et images utilisés pour la préparation sont donc traités chez Cloudflare. L’écran **Réglages** distingue cette installation de l’IA Ollama locale. Le modèle et son adresse sont fixes dans cette version pour conserver le service prévu sur l’offre gratuite.

Les PDF textuels sont lus page par page avec PDF.js via `unpdf`. Pour les scans, les images de chaque page sont envoyées au modèle de vision ; une page trop complexe est refusée avec une demande de photo séparée ou de texte saisi. Les lectures par vision sont signalées comme incertaines et restent à relire par le parent. Les références conservent le numéro réel de la page.

## Limites de cette installation

| Élément                                                 | Limite Révizo cloud                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Espace privé pour documents et archives de restauration | 450 Mo, pour garder une marge dans le stockage SQLite gratuit                                         |
| Fichier importé                                         | 25 Mo                                                                                                 |
| Photos                                                  | JPEG/PNG, au maximum 12,5 mégapixels ; réduction à 2 200 px après lecture de l’orientation EXIF       |
| PDF pour une préparation                                | 20 pages ; au maximum quatre images à transcrire dans une page scannée                                |
| Sauvegarde portable complète                            | 12 Mo de documents décodés ; limite plus basse que le serveur local pour respecter la mémoire Workers |

Pour une photo HEIC/WebP, exporter d’abord en JPEG/PNG. Une sauvegarde locale dépassant la limite cloud doit être réduite avant restauration. Les archives privées créées avant restauration comptent dans l’espace des documents. L’export portable ne comprend ni mots de passe, ni codes enfant, ni secret d’installation, ni journaux de génération.

Le nouvel espace cloud est vide. Pour récupérer les cours d’une installation locale, créer d’abord le compte cloud, puis utiliser **Réglages → Restaurer une sauvegarde**. Les mots de passe et codes enfant ne sont pas transférés. Le dépôt et le déploiement ne copient pas automatiquement le répertoire local `.revizio/`.

## Rester sur l’offre gratuite

Conserver le forfait **Workers Free** dans **Calcul → Offres Workers**. Le déploiement n’active aucun abonnement payant ni R2. Le rattachement de `cours.gofel.fr` utilise le domaine déjà détenu ; son renouvellement reste indépendant de l’hébergement Workers gratuit.

Au 15 novembre 2026, les principales enveloppes gratuites Cloudflare sont :

| Ressource                 | Quota du compte                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| Fichiers statiques        | Requêtes gratuites et illimitées                                                           |
| Worker et Durable Objects | 100 000 requêtes par jour pour chacun                                                      |
| SQL Durable Objects       | 5 millions de lignes lues et 100 000 lignes écrites par jour ; 5 Go au total sur le compte |
| Workers AI                | 10 000 neurones par jour, partagés entre les modèles et applications du compte             |

Un dépassement sur l’offre gratuite bloque les opérations concernées ; il ne bascule pas automatiquement sur l’offre payante. La consommation IA dépend du nombre de pages, de questions et de relances : il n’existe pas de nombre fixe de générations gratuites. Les autres applications du compte partagent les quotas.

Les limites et tarifs peuvent évoluer. Sources : [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [fichiers statiques](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workers AI](https://developers.cloudflare.com/workers-ai/platform/pricing/).

## Développer et mettre à jour

```sh
npm run export:web
npm run dev:cloud
```

Pour créer un espace de développement, ajouter `SETUP_TOKEN=un-code-local` dans `.dev.vars` (ignoré par Git). Le stockage local de Wrangler est distinct de la production. L’IA utilise réellement Cloudflare, même en développement ; les tests automatiques injectent explicitement un double IA dans une configuration séparée.

```sh
npm run typecheck
npm test
npm run export:web
npx wrangler deploy --dry-run
npm run deploy:cloud
```

`npm run test:cloud` exécute uniquement les tests du runtime Workers. Les tests du serveur Node.js continuent de couvrir le parcours local. Les tests navigateur du dépôt vérifient les parcours existants en portrait et paysage.

Les déploiements suivants conservent le Durable Object et ses données. Exporter une sauvegarde avant une mise à jour importante. Pour revenir à une version de code antérieure, utiliser les déploiements du tableau de bord ou `npx wrangler rollback` ; revenir au code précédent ne restaure pas les données.
