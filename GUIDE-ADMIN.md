# Guide d'administration — DS Nails

Ce guide décrit chaque écran de l'espace d'administration et ce que chaque action
produit réellement, y compris ses conséquences sur les comptes et sur le site
visible par les clientes.

**Accès** : connectez-vous, puis cliquez sur **Admin** dans la barre du haut.
Le bouton n'apparaît que pour un compte administrateur.

Cinq onglets : **Réservations**, **Statistiques**, **Prestations**, **Horaires**,
**Indisponibilités**.

---

## La règle à retenir avant tout

Une réservation passe par quatre états :

| État | Signification | Compte dans le chiffre d'affaires ? |
|---|---|---|
| **En attente** | La cliente a réservé, vous n'avez pas encore validé | Non |
| **Confirmé** | Vous avez validé le rendez-vous | **Non** |
| **Terminé** | La prestation a été réalisée et réglée | **Oui** |
| **Annulé** | Le rendez-vous n'aura pas lieu | Non |

**Seules les réservations « Terminé » entrent dans les statistiques financières.**
Une réservation confirmée est un engagement, pas une recette : tant que vous ne
la marquez pas terminée, elle reste invisible dans le chiffre d'affaires, le
panier moyen et les classements.

Conséquence pratique : **si vous n'utilisez jamais le bouton « Terminer », votre
chiffre d'affaires restera à zéro.** Prenez l'habitude de clôturer les rendez-vous
passés.

---

## 1. Réservations

L'écran de travail quotidien.

### Les quatre compteurs du haut

| Compteur | Ce qu'il montre |
|---|---|
| **En attente** | Réservations à valider — c'est votre file d'attente |
| **Confirmées** | Rendez-vous validés, pas encore réalisés |
| **Aujourd'hui** | Rendez-vous du jour (en attente + confirmés) |
| **À venir** | Rendez-vous des jours suivants |

### Filtrer la liste

- **Statut** : n'afficher qu'un état (en attente, confirmées, terminées, annulées).
- **Date** : une journée précise.
- **Recherche** : nom, téléphone ou e-mail, les trois en même temps.
- **Réinitialiser** remet les trois filtres à zéro.

Les filtres se combinent. Pour préparer votre journée : filtre **Date** sur
aujourd'hui, statut **Confirmées**.

### Les actions sur chaque ligne

**Confirmer** — disponible sur une réservation en attente. Elle passe en
« Confirmé ». Sans effet comptable.

**Terminer** — disponible sur une réservation confirmée. **Une fenêtre de
confirmation s'ouvre** et rappelle la cliente, la prestation, la date et surtout
**le montant qui sera comptabilisé**. Validez seulement si la prestation a été
réalisée *et* réglée : ce montant entre immédiatement dans le chiffre d'affaires,
le panier moyen et les classements.

**Annuler** — disponible sur une réservation en attente ou confirmée. Le créneau
est libéré et redevient réservable. Action immédiate, sans confirmation.

> Une réservation annulée n'est jamais supprimée : elle reste dans la liste et
> alimente le taux de désistement.

**Actualiser** recharge la liste — utile si vous avez laissé la page ouverte
pendant que des clientes réservaient.

---

## 2. Statistiques

### Le chiffre du mois

En haut, le **chiffre d'affaires du mois en cours**, avec l'écart en pourcentage
par rapport au mois précédent : flèche verte vers le haut, rouge vers le bas.
Le montant du mois précédent est rappelé entre parenthèses pour situer l'écart.

### Les cinq indicateurs

| Indicateur | Définition exacte |
|---|---|
| **CA cumulé** | Total de toutes les prestations **terminées**, depuis l'ouverture |
| **Panier moyen** | CA cumulé ÷ nombre de prestations terminées. Le diviseur est affiché sous le chiffre |
| **Réservations terminées** | Nombre de prestations clôturées. En note : combien sont confirmées mais pas encore terminées — **c'est votre rappel de ce qui reste à clôturer** |
| **Clients inscrits** | Comptes ayant vérifié leur adresse e-mail, hors administrateurs. En note : les inscriptions jamais confirmées |
| **Taux de désistement** | Annulées ÷ (annulées + confirmées + terminées). Les réservations en attente sont exclues du calcul : leur sort n'est pas encore décidé |

### Les trois faits marquants

**Prestation la plus réservée**, **créneau le plus demandé**, **client le plus
fidèle** — calculés sur les seules réservations terminées, sur tout l'historique.

Le créneau le plus demandé indique l'heure de début : « 14h – 15h » signifie que
c'est le créneau de 14 h qui est le plus choisi.

### Les deux filtres de période

Une seule rangée, au-dessus des graphiques :

- **Historique du chiffre d'affaires** : 6, 12 ou 24 mois — cadre le graphique du CA.
- **Courbe des réservations** : 14, 30 ou 90 jours — cadre la courbe d'activité
  et celle des clients inscrits.

### Les graphiques

**Chiffre d'affaires par mois** — une colonne par mois. Un mois sans prestation
terminée apparaît à zéro plutôt que d'être absent, pour que les creux se voient.

**Évolution des réservations** — nombre de rendez-vous **par jour**. Contrairement
aux montants, cette courbe compte toutes les réservations non annulées : c'est le
rythme de prise de rendez-vous, pas une donnée comptable. Survolez pour lire une
journée précise.

**Clients inscrits (email vérifié)** — cumul, jour après jour. La courbe ne
redescend jamais : elle démarre au total déjà atteint avant la période affichée.
L'en-tête indique le gain sur la période (« +4 sur la période »).

**Répartition par civilité** — anneau Femmes / Hommes / Non renseigné. Survolez
une part pour voir son effectif au centre. La part « Non renseigné » correspond
aux comptes créés avant l'ajout de ce champ à l'inscription.

**Prestations les plus réservées** et **Créneaux horaires les plus demandés** —
classements sur les prestations terminées. Le créneau le plus demandé vous
indique où concentrer votre disponibilité.

> Chaque graphique possède un dépliant **« Voir les données »** qui affiche les
> chiffres exacts sous forme de tableau. Utile pour recopier un montant ou
> vérifier une valeur difficile à lire à l'œil.

### Liste des clients

Tous les comptes inscrits, avec recherche (nom, e-mail, téléphone), filtre par
statut de compte (vérifié / en attente de confirmation) et pagination réglable
(10, 25 ou 50 par page).

Un compte **« En attente »** est une personne qui s'est inscrite sans jamais
cliquer le lien de confirmation reçu par e-mail : **elle ne peut pas se connecter**.

### Clients les plus fidèles

Classement par nombre de visites, avec le total dépensé et la date de dernière
visite. La mention **« Réservation en mode invité »** signale une réservation
prise sans compte : le téléphone est alors affiché en dessous, c'est votre seul
moyen de recontact.

### Deux précisions sur les montants

**Le prix est figé au moment de la réservation.** Si vous augmentez le tarif d'une
prestation, les réservations déjà passées gardent l'ancien prix. Votre historique
ne se réécrit pas.

**Tout repose sur le statut « Terminé ».** C'est le seul geste qui alimente la
comptabilité.

---

## 3. Prestations

### Ajouter une prestation

- **Nom** — celui que verront les clientes.
- **Heures** et **Minutes** — durée séparée en deux champs. L'aperçu sous la
  saisie confirme le résultat (« Durée : 1 h 30 »). Les minutes vont de 0 à 59 :
  au-delà, utilisez le champ Heures.
- **Prix (FCFA)**.
- **Photo** — déposez une image dans le cadre en pointillés, ou cliquez pour
  parcourir. **JPG ou PNG uniquement, 5 Mo maximum.**

La durée est déterminante : elle définit la longueur du créneau réservé et donc
le nombre de rendez-vous possibles dans une journée.

### Le tableau

Photo, nom, durée, prix, état, actions.

**Modifier** — la ligne devient éditable. Vous pouvez changer tous les champs et
remplacer la photo (l'ancienne est supprimée automatiquement). **Enregistrer** ou
**Annuler**.

**Masquer / Afficher** — une prestation masquée disparaît du site public mais
reste en base, avec son historique. **C'est l'action à privilégier** pour une
prestation que vous ne proposez plus temporairement.

**Supprimer** — définitif, avec demande de confirmation. Si des réservations y
sont rattachées, la suppression est **refusée** et un message vous invite à
masquer la prestation à la place : supprimer effacerait l'historique associé.

> Une prestation sans photo s'affiche avec un emplacement gris côté client.
> Pensez à en ajouter une pour chaque prestation.

---

## 4. Horaires

Les horaires d'ouverture, un jour par ligne.

Pour chaque jour : une case **Fermé**, une heure d'**ouverture**, une heure de
**fermeture**. Les champs horaires se grisent quand le jour est coché fermé.

**Enregistrer** valide la ligne, **Annuler** revient à la valeur précédente. Les
deux boutons ne s'activent que si vous avez modifié quelque chose. L'heure de
fermeture doit être postérieure à l'heure d'ouverture.

### Ce que ça change côté client

Un jour coché **fermé** :

- s'affiche **« Fermé »** dans la carte Horaires de la page d'accueil ;
- apparaît **grisé et non sélectionnable** dans le choix de la date ;
- ne propose aucun créneau.

Les horaires d'ouverture définissent la plage dans laquelle les créneaux sont
calculés. Réduire l'amplitude d'une journée réduit mécaniquement le nombre de
rendez-vous possibles.

> La page d'accueil regroupe automatiquement les jours identiques : si du lundi
> au samedi vous ouvrez de 9 h à 19 h, elle affichera une seule ligne
> « Lundi – Samedi : 9h – 19h ».

---

## 5. Indisponibilités

Pour bloquer un moment précis sans toucher aux horaires habituels : congés,
formation, rendez-vous personnel.

### Bloquer un créneau

**Date**, **début**, **fin**, et un **motif** libre (facultatif, pour votre
mémoire — il n'est pas montré aux clientes). L'heure de fin doit être postérieure
à l'heure de début.

Pour bloquer une journée entière, couvrez toute l'amplitude d'ouverture, par
exemple 9 h – 19 h.

### Ce que ça change côté client

Les créneaux qui chevauchent la plage bloquée disparaissent. Si plus aucun
créneau ne reste, la date apparaît **grisée avec la mention « Indisponible »**
dans le choix de la date.

Le grisage dépend de la prestation choisie : un blocage de 9 h à 18 h laisse
encore de la place pour une prestation d'une heure à 18 h, mais aucune pour une
prestation de deux heures. La même date pourra donc être proposée ou refusée
selon la prestation.

Les indisponibilités passées restent affichées, en grisé, et peuvent être
supprimées à tout moment.

---

## Trois mentions vues côté client

Sur l'écran de choix de la date, une date grisée porte un motif :

| Mention | Cause | Où corriger |
|---|---|---|
| **Fermé** | Le jour est marqué fermé | Onglet **Horaires** |
| **Indisponible** | Un blocage couvre la journée | Onglet **Indisponibilités** |
| **Complet** | Tous les créneaux sont pris | Rien à corriger — c'est une bonne nouvelle |

---

## Votre compte

Depuis **Mon espace**, l'entrée **Paramètres du compte** permet de modifier votre
nom, votre civilité, votre adresse e-mail et votre mot de passe.

Le changement d'adresse et le changement de mot de passe **ferment votre session**
et demandent une reconnexion — par sécurité. Pour l'adresse e-mail, un code de
vérification à 6 chiffres est envoyé à la nouvelle adresse ; il est valable
10 minutes.

Votre session se ferme également d'elle-même **au bout de 24 heures**.
