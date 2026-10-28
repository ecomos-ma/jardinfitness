# Test NFC physique — Jardin Fitness

## Déploiement Vercel

Déployer ce projet Vite avec `npm run build`, dossier de sortie `dist`. Le fichier `vercel.json` inclut la réécriture SPA permettant d’ouvrir et de recharger directement `/nfc-test`.

Sur le téléphone, ouvrir **`https://VOTRE-DOMAINE-VERCEL/nfc-test`** dans Chrome Android, directement dans un onglet (pas dans un aperçu intégré). Le lien HTTP du réseau local ne convient pas à Web NFC.

Utiliser la même adresse Vercel stable pendant tout le test. Le stockage reste celui de l’application existante : Zustand/localStorage sous `jardin-fitness-os-v2`. Il est propre au navigateur, à l’appareil et à l’origine (protocole + domaine + port). Créer le client sur le téléphone. Changer de domaine de prévisualisation, utiliser un autre navigateur, effacer les données du site ou utiliser une session privée peut faire disparaître l’attribution locale. Aucun serveur de membres n’a été ajouté.

## Conditions matérielles

- Téléphone Android équipé du NFC, Chrome exposant `NDEFReader`.
- NFC activé dans les réglages Android, autorisation NFC accordée à l’adresse du site.
- Téléphone déverrouillé, écran allumé, page visible.
- Carte NDEF réinscriptible avec suffisamment de capacité pour un enregistrement texte d’environ 80 caractères. Une carte bancaire, un badge propriétaire ou une carte verrouillée ne constitue pas un support de test approprié.
- Maintenir la carte contre l’antenne du téléphone jusqu’à la réponse matérielle.

La présence de `NDEFReader` ne prouve pas la présence d’un lecteur opérationnel. Il n’existe pas de contrôle Web NFC direct de l’interrupteur NFC Android ou du verrouillage. La page affiche les contrôles disponibles, demande la confirmation manuelle des autres conditions et rapporte les erreurs réelles. Aucune opération n’expire en « succès » après un délai.

## Checklist physique à effectuer par l’utilisateur

1. Ouvrir l’adresse HTTPS sur Android Chrome, activer le NFC et confirmer les prérequis dans la page.
2. **Créer un client** : prénom, nom, téléphone, formule et paiement. L’e-mail est facultatif. Vérifier son dossier dans Membres si nécessaire, puis le sélectionner dans Test NFC.
3. Cliquer **Écrire NFC** et autoriser Chrome. Présenter la carte. Attendre **Écriture terminée**. Ce message dépend de la résolution réelle de `NDEFReader.write()`.
4. Retirer physiquement la carte. Cliquer **Vérifier**, puis présenter à nouveau la même carte. Attendre **Carte vérifiée et attribuée**. Un jeton différent ne crée aucune attribution.
5. Retirer la carte, cliquer **Lire NFC**, puis la présenter. Vérifier le nom complet, le téléphone, l’identifiant membre, la formule, l’expiration et les jours restants. Pour un abonnement payé en cours, attendre **ACCÈS AUTORISÉ** et **Présence enregistrée dans le club**.
6. Vérifier que Présences aujourd’hui et les visites du membre ont augmenté d’une unité. Relire rapidement : le membre reste identifié et autorisé, mais aucun second passage accepté n’est ajouté pendant dix minutes pour le même abonnement.
7. Recharger la même adresse, cliquer **Lire NFC**, présenter la carte : le même membre doit être identifié. Aucun choix de membre n’est nécessaire pour la lecture.
8. Depuis le dossier du membre, expirer ou suspendre son abonnement. Revenir sur Test NFC et lire **la même carte** : **ACCÈS REFUSÉ** avec la raison et aucune présence acceptée supplémentaire.
9. Renouveler l’abonnement et lire de nouveau : accès rétabli avec la même carte. Une carte révoquée demeure refusée.

Le test n’est accepté qu’après confirmation par l’utilisateur de l’écriture, de la relecture de vérification, de l’identification et des décisions d’accès sur son téléphone et sa carte.

## Écriture, réécriture et interruptions

Par défaut, `overwrite: false` protège les cartes contenant déjà des enregistrements. Pour une carte destinée à ce test dont le contenu peut être effacé, cocher explicitement l’autorisation d’écrasement. L’échec de protection et le refus de permission peuvent tous deux produire `NotAllowedError` ; l’interface présente les deux possibilités.

La préparation contient un jeton aléatoire et le membre prévu, sans créer de carte active. Une écriture réussie reste **en attente de vérification**. Cette préparation est persistée : après rechargement, sélectionner le même membre pour retrouver le bouton Vérifier. Une nouvelle écriture pour ce membre remplace sa préparation précédente.

Annuler, quitter la page ou la masquer interrompt l’opération et retire les écouteurs. L’annulation ne peut pas effacer des octets déjà écrits sur une carte. Si le téléphone a écrit mais que la page n’a pas pu enregistrer la confirmation, recommencer l’écriture avec l’autorisation d’écrasement, puis vérifier séparément.

## Données et décisions

- Payload unique : `jardin:nfc:v1:` suivi de 32 octets aléatoires encodés en hexadécimal, générés avec `crypto.getRandomValues()`. Aucun nom, téléphone ou identifiant membre n’est écrit sur la carte.
- Lecture stricte d’un enregistrement texte NDEF, avec `TextDecoder`, contrôle de la version et du format. Une carte inconnue, illisible, non vérifiée ou ambiguë ne déclenche pas un choix de client de remplacement.
- `scan()` initialise le lecteur. **Seul un événement `reading`** fournit le jeton et peut terminer une lecture ou une vérification. L’écriture et la relecture utilisent des opérations indépendantes.
- L’attribution vérifiée est unique par jeton et utilise le membre existant. Si Android fournit un numéro de série, une carte active attribuée à un autre membre empêche une seconde attribution à ce support. Le numéro de série n’est pas toujours disponible ; ce n’est pas un secret ni une preuve cryptographique d’identité. Un jeton NDEF peut être copié : ce test ne constitue pas un système anti-clonage.
- Les règles d’abonnement, dates, paiement, révocation, perte et présences utilisent le store existant. Le journal distingue explicitement les opérations physiques des anciennes opérations virtuelles.
- Un échec d’enregistrement local annule les changements en mémoire et empêche de confirmer une attribution ou une présence enregistrée.

## Validation effectuée en développement

Commandes :

```sh
npm run test:nfc:physical
npm run test:nfc
npm run build
```

Les tests physiques de code utilisent des doubles d’API uniquement dans le runner Node, jamais dans l’application. Ils couvrent le décodage NDEF, les versions et données invalides, le caractère opaque des jetons, l’attente d’un événement réel, les erreurs de scan/écriture/permission, l’annulation et le nettoyage, le mauvais jeton de vérification, l’unicité, les droits d’accès, les doubles passages, la persistance et les échecs de stockage.

**Aucun téléphone Android ni carte physique n’a été utilisé pendant le développement. Aucun test d’écriture ou lecture matérielle n’est déclaré réussi.** Le déploiement Vercel et la checklist matérielle restent à effectuer par l’utilisateur.

## Références

- [Chrome : Web NFC sur Android](https://developer.chrome.com/docs/capabilities/nfc) — conditions d’accès, permissions, `scan()` et `write()`.
- [Spécification Web NFC](https://w3c.github.io/web-nfc/) — événements de lecture, encodages, annulation et limites de détection matérielle.
- [Vite sur Vercel](https://vercel.com/docs/frameworks/frontend/vite) — réécriture des routes SPA.
