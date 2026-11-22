# Mettre Claude sur tes Echo — Guide pas à pas

But : dire **« Alexa, demande à Claude … »** (ou **« Echo, demande à Claude … »**) sur
n'importe lequel de tes Echo, et obtenir une vraie réponse de Claude.

Tu n'as **rien à installer chez toi** : Amazon héberge le code gratuitement
(« Alexa-hosted »). Compte ~20 minutes la première fois.

---

## Ce qu'il te faut d'abord

1. **Un compte développeur Amazon** (gratuit) — le même identifiant Amazon que
   pour ton appli Alexa fonctionne.
2. **Une clé API Anthropic** — crée-la sur https://console.anthropic.com →
   *API Keys* → *Create Key*. Elle ressemble à `sk-ant-...`. Garde-la secrète.
   (Coût : quelques centimes par question. Tu peux mettre une limite mensuelle
   dans la console Anthropic.)

---

## Étape 1 — Créer le skill

1. Va sur **https://developer.amazon.com/alexa/console/ask** et connecte-toi.
2. Clique **Create Skill**.
3. Nom du skill : `Claude`. Langue : **Français (FR)**.
   - *(Si tu utilises tes Echo en français de France, choisis bien fr-FR.)*
4. Type d'expérience : **Other** → modèle **Custom**.
5. Méthode d'hébergement : **Alexa-hosted (Python)**.
6. Clique **Create Skill** (en haut à droite), puis attends la fin de la création.
   - Si on te propose un template, choisis **Start from Scratch**.

---

## Étape 2 — Coller le modèle d'interaction (ce que tu peux dire)

1. Dans le menu de gauche, ouvre **Interaction Model → JSON Editor**.
2. **Efface tout** et **colle** le contenu du fichier :
   `interactionModels/custom/fr-FR.json`
3. Clique **Save Model**, puis **Build Model** (attends le ✅, ~1 min).

> Le mot d'invocation est **« claude »**. Tu diras donc :
> *« Alexa, demande à claude de … »*.

---

## Étape 3 — Coller le code

1. En haut, onglet **Code**.
2. Ouvre `lambda_function.py` dans l'éditeur Amazon, **efface tout**, et **colle**
   le contenu du fichier `lambda/lambda_function.py` fourni.
3. **Mets ta clé API** : dans le code, remplace
   `COLLE_TA_CLE_API_ICI` par ta vraie clé `sk-ant-...`.
4. Ouvre (ou crée) le fichier `requirements.txt` et colle le contenu de
   `lambda/requirements.txt` :
   ```
   ask-sdk-core==1.19.0
   anthropic
   ```
5. Clique **Save**, puis **Deploy** (attends le ✅, ça installe `anthropic`).

---

## Étape 4 — Tester (sans toucher à un Echo)

1. En haut, onglet **Test**.
2. Passe le sélecteur de *Off* à **Development**.
3. Dans la case, tape ou dis au micro :
   `demande à claude de m'expliquer les trous noirs`
4. Claude doit répondre en une ou deux phrases. 🎉

---

## Étape 5 — L'utiliser sur tes Echo

Le skill est **automatiquement dispo sur tous les Echo** liés au **même compte
Amazon** que ton compte développeur. Rien à publier.

Dis simplement :
- **« Alexa, demande à claude de me donner une idée de recette avec des œufs. »**
- **« Alexa, demande à claude pourquoi le ciel est bleu. »**
- **« Alexa, ouvre claude »** → puis pose ta question quand il répond « Je t'écoute ».

### Astuce : remplacer « Alexa » par « Echo »
Tu ne peux pas supprimer le mot de réveil, mais tu peux le changer dans une liste
fixe. Appli **Alexa → Appareils → ton Echo → Paramètres → Mot de réveil →
« Echo »**. Tu diras alors : *« Echo, demande à claude de … »*.

---

## Limites à connaître (normales à ce stade)

- **Phrase obligatoire** : « demande à claude … » — c'est le verrou Amazon, on ne
  peut pas faire plus court sur un Echo non modifié.
- **~8 secondes** : si Claude met trop longtemps, Alexa coupe. On a réglé le code
  pour des réponses courtes et rapides (modèle Haiku). Si tu veux des réponses
  plus fouillées, passe `MODEL = "claude-opus-5-5"` dans le code (un peu plus lent).
- **Pour l'instant : questions/réponses seulement.** « Lis mon dernier email » et
  « lance tel projet » viennent à l'étape suivante (ça demande de connecter Gmail,
  l'agenda, GitHub… et de gérer les tâches longues en arrière-plan).

---

## Et après (étape 2 du projet)

Quand ce test te convient, on ajoute les vraies actions :
- **Lire / résumer tes emails** (connexion Gmail).
- **Agenda, rappels.**
- **« Lance le projet X »** → déclenche une tâche Claude Code, qui tourne en
  arrière-plan et te prévient quand c'est fini (pour contourner la limite des 8 s).

Dis-moi quand l'étape 1 marche, et on enchaîne.
