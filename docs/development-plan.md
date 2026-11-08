# Plan de développement Révizo

## Cible

Une famille d’abord, iPad en priorité. Application universelle Expo / React Native / web. Les 12 maquettes PNG fournies sont la référence fonctionnelle : profils ; accueil enfant ; tableau de bord parent ; cours par matière ; fiche ; exercices et plan ; question ; progrès ; import ; préparation ; contrôles ; anglais.

Les PNG sont des références d’interface et ne contiennent pas de cours source exploitables pour une évaluation OCR. La qualité d’extraction doit être mesurée sur un corpus familial réel avant sélection du fournisseur.

## Lot 1 : première boucle locale

Profils de démonstration, matières, fiches, QCM, indices, correction et bilan, résultats persistants, import parent, édition et publication. Préparation manuelle des QCM en attendant le service IA. Versions de questions figées dans les tentatives. Aucune clé IA dans le client.

## Lot 2 : connexion familiale et fichiers durables

Authentification du parent, profil enfant rattaché à la famille, autorisations serveur, PostgreSQL, stockage privé, fichiers persistants, sauvegardes et synchronisation. Le sélecteur de profils local ne protège aucune donnée et doit être remplacé avant usage avec des données sensibles.

## Lot 3 : import et IA

Comparer OCR/multimodal sur photos manuscrites, imprimés, formules et schémas. Pipeline asynchrone : import → extraction par page → brouillon de fiche et d’exercices → contrôles → relecture parent → publication. Conserver les sources, signaler les incertitudes et permettre la régénération ciblée. Gérer reprises, erreurs, limites et coûts. Tests d’évaluation pour fidélité aux sources, exactitude des corrections et contraintes de génération.

## Lot 4 : contrôles et plans

Date, chapitres et durée quotidienne ; plan modifiable ; exercices sur erreurs ; contrôle blanc ; déplacement de séances et gestion d’une date de contrôle modifiée.

## Lot 5 : anglais et confort

Vocabulaire FR/EN, verbes et temps autorisés, mots outils définis, contrôle du respect du périmètre. Lecture audio, révision espacée, schémas structurés et mode hors connexion.

## Recette

Vérifier sur iPad Safari et application native, paysage/portrait, clavier ouvert, import Photos/Fichiers/caméra, interruption réseau et reprise. Cibles tactiles de 44 px minimum. Les statistiques distinguent lecture, travail effectué et réussite ; une fiche ouverte ne signifie pas une notion maîtrisée.
