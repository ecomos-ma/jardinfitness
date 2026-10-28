# Jardin Fitness OS

Frontend local pour présenter la gestion d’un club Jardin Fitness. L’interface est en français, utilise le dirham marocain et relie les vues direction, accueil, membre et site public aux mêmes données.

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir l’adresse affichée par Vite, normalement `http://localhost:5173/`. Pour une compilation de production :

```bash
npm run build
npm run preview
```

## Architecture

- `src/data.ts` crée un jeu de données cohérent et déterministe, avec des dates relatives au jour d’ouverture.
- `src/types.ts` définit les entités du club.
- `src/store.ts` centralise les actions métier dans Zustand. Le middleware `persist` sauvegarde les données dans `localStorage` sous `jardin-fitness-os-v2`.
- `src/pages/` regroupe les expériences métier. `src/App.tsx` définit les routes et la navigation.
- `src/styles.css` et `src/styles-extra.css` définissent l’identité visuelle et les mises en page responsives.

La navigation couvre le tableau de bord, le rapport du jour, les membres, les offres, les abonnements, les cartes, l’accueil, les réservations, la récupération, les finances, le Shake Bar, l’inventaire, le CRM, les campagnes, la fidélité, le personnel et les rapports. `/member` ouvre l’espace membre et `/site` le site public.

## Visuels premium

Le catalogue Shake Bar affiche sept photographies originales et locales en WebP dans `public/assets/products/`. Leur provenance et les prompts sont consignés dans `public/assets/products/README.md`. Les images sont chargées à la demande. Les produits, prix et stocks restent dans les données métier existantes.

`src/MembershipCard.tsx` centralise le recto, le verso, le QR d’accès, le retournement 3D, l’export PNG et la mise en page A4 pour l’impression. Le composant réutilise le membre, la formule et la carte depuis le store partagé. Le QR encode le code du badge lorsqu’il existe, ou l’identifiant membre accepté par le contrôle d’accès existant lorsqu’aucun badge n’a été attribué. Les règles d’accès restent appliquées au scan.

Le symbole feuille déjà utilisé par l’interface a été repris dans la carte. Le fichier présenté comme logo sur le site de référence apparaît comme un rectangle beige sans logo visible ; il est conservé avec la photographie du club dans `references/jardinfitness-netlify/`, sans remplacer le symbole actuel.

## Données et remise à zéro

Les modifications restent dans le navigateur après actualisation. Dans **Paramètres → Données locales**, utiliser **Restaurer les données initiales** pour régénérer les données initiales. Pour remplacer les contenus, modifier `seed()` dans `src/data.ts` ou importer un autre ensemble dans le modèle `AppData`.

Les tarifs de départ proviennent du brief Jardin Fitness et sont modifiables dans **Offres & tarifs**. Les 14 prix ont été comparés au site `jardinfitness.netlify.app` le 28 octobre 2026 : ils correspondent tous. Le site les présente comme des propositions à valider avec la direction. Le relevé et les images sont documentés dans `references/jardinfitness-netlify/README.md`. Le site porte le nom JH Fitness Club ; l’application conserve le nom Jardin Fitness demandé et son identité botanique temporaire. Les couleurs de la présentation suivent les valeurs du brief.

## Limites techniques et intégrations futures

Ce projet ne comporte ni serveur, ni base externe, ni authentification réelle. Les rôles ne contrôlent que l’expérience d’interface et ne constituent pas une barrière de sécurité. Les données du navigateur ne doivent pas être utilisées pour conserver de vraies informations clients. Une mise en production demande un backend, une base sécurisée, la gestion des accès, des sauvegardes, la conformité sur les données personnelles, des journaux d’audit fiables et des contrôles côté serveur.

Les paiements sont des enregistrements locaux. Un vrai encaissement demanderait un prestataire de paiement, des webhooks et un rapprochement financier. Les messages marketing sont seulement préparés localement ; aucun e-mail, SMS ou WhatsApp n’est envoyé. Le Studio NFC propose un téléphone virtuel pour écrire et scanner des cartes, sans API NFC ni permission matérielle. Le contrôle à l’accueil accepte également la saisie manuelle. Toutes ces opérations utilisent les mêmes règles locales d’accès. Les cartes Apple Wallet et Google Wallet nécessiteraient des comptes émetteurs, certificats, signatures et services de mise à jour. Le QR affiché est un code visuel local, pas un justificatif sécurisé pour un contrôle d’accès en production.

Les actions de caisse, de vente et de réservation fonctionnent dans le modèle local partagé. Les chiffres de revenus excluent les paiements en attente ou annulés et déduisent les remboursements. Les passages validés ne représentent pas l’occupation physique du club, faute de scan de sortie.


## Studio NFC

Routes : `/nfc`, `/nfc/new`, `/nfc/design`, `/nfc/write`, `/nfc/scan`, `/nfc/issued`, `/nfc/history`.

- Le formulaire crée le membre, son abonnement aux dates choisies et le paiement dans le store existant.
- Une carte vierge réserve un identifiant unique. L’écriture animée attribue définitivement cet identifiant au membre. Seules les cartes encore vierges peuvent être réattribuées.
- Trois finitions (Forêt, Nocturne, Olivier), recto/verso, QR, PNG 1712 × 1080 et impression recto/verso au format 85,6 × 54 mm.
- Les scans consultent l’abonnement courant, le paiement et le statut de la carte. Un passage accepté alimente les présences, le tableau de bord et la fidélité. Un refus reste dans le journal sans augmenter les présences.
- La protection contre les doubles passages dure dix minutes pour un même abonnement. Un renouvellement crée de nouveaux droits et permet le parcours expiration → renouvellement → accès avec la même carte.
- Révocation, perte, remplacement, lecture, vérification sans passage et journal par carte. Les dates d’émission historiques qui n’étaient pas enregistrées avant le Studio sont explicitement indiquées comme non renseignées.
- Persistance conservée sous `jardin-fitness-os-v2`, sans remise à zéro ni migration destructive. Les nouveaux champs des anciennes cartes sont facultatifs.

Vérification reproductible : `npm run test:nfc` (37 contrôles dans un stockage mémoire isolé). `npm run build` vérifie TypeScript et génère la production.

## Test NFC physique sur Android

La page **`/nfc-test`** utilise réellement `NDEFReader.write()` et `NDEFReader.scan()`. Elle ne contient aucun simulateur ni résultat automatique. Une relecture distincte est obligatoire avant l’attribution persistée ; les présences et abonnements restent dans le store partagé.

Vercel : configuration Vite, commande `npm run build`, sortie `dist`. `vercel.json` prépare les rechargements directs des routes. Créer les clients sur le téléphone et conserver la même adresse HTTPS : localStorage n’est pas partagé entre appareils ou domaines.

Exécuter `npm run test:nfc:physical` pour les tests de code. **La validation matérielle n’a pas été effectuée** et reste soumise à votre confirmation sur le téléphone et la carte ciblés. Voir [le guide de déploiement et la checklist physique](NFC-PHYSICAL-TEST.md).
