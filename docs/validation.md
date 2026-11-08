# Validation du premier lot — 8 novembre 2026

## Contrôles effectués

- Compatibilité des dépendances : `npx expo install --check`.
- Configuration Expo : orientation libre, prise en charge iPad, permissions photo/caméra en français, microphone désactivé.
- TypeScript : aucune erreur.
- Vitest : 24 tests métier et persistance réussis.
- Export web Expo réussi.
- Playwright Chromium : 14 parcours réussis, répartis entre paysage 1180 × 820 et portrait 820 × 1180, avec interactions tactiles activées.
- Export du bundle JavaScript/Hermes iOS réussi. Ceci ne produit pas un IPA signé et ne remplace pas un test sur iPad physique.
- Captures visuelles : profils, accueil élève, exercice, tableau de bord et import parent. Correction du débordement du formulaire et de la hauteur de navigation portrait.

## Parcours testés

Sélection d’un profil, navigation, adresse inconnue, exclusion des brouillons côté enfant, réponse juste/fausse, reprise après rechargement, bilan persistant sans tentative supplémentaire, import d’une pièce jointe, sauvegarde et publication de fiche après relecture, préparation/relecture/publication d’un QCM et réalisation par l’enfant.

Les tests métier vérifient aussi les copies de questions, les réponses idempotentes, les corrections indépendantes d’une série modifiée, la clôture complète, les données locales invalides et la sérialisation des sauvegardes.

## Limites de cette validation

Safari iPad et une application iOS signée restent à tester sur appareil réel, en particulier les permissions et la caméra. Les services IA/OCR, la connexion familiale et le stockage serveur ne sont pas inclus dans ce lot. La conservation des URI des pièces jointes dépend de la plateforme et du cache local.

L’audit npm initial signale cinq alertes modérées transitives dans les outils Expo (glob/minimatch). La correction automatique proposée rétrograderait Expo avec rupture de version ; elle n’a pas été appliquée. Ces dépendances seront à réévaluer lors des mises à jour du SDK.
