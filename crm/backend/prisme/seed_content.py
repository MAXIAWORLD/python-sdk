"""Editorial content of the demo workspace: help-center articles (they double as product documentation) and emails."""

from __future__ import annotations

KB_ARTICLES: list[dict[str, str]] = [
    {
        "title": "Émettre une facture conforme",
        "category": "Facturation",
        "summary": "Les mentions obligatoires, les contrôles avant émission et ce qui se passe quand vous cliquez sur « Émettre ».",
        "body": """Une facture française doit comporter des mentions précises (Code de commerce, art. L441-9, et CGI, annexe II, art. 242 nonies A). Prisme les contrôle pour vous avant l'émission.

## Avant de commencer

1. Complétez votre identité dans **Paramètres › Entreprise** : raison sociale, forme juridique, capital, adresse du siège, SIREN, numéro de TVA intracommunautaire, ville du RCS et IBAN.
2. Vérifiez vos conditions dans **Paramètres › Facturation** : délai de paiement (60 jours maximum), taux des pénalités de retard, indemnité forfaitaire de 40 €.

## Créer et émettre la facture

1. Ouvrez **Factures › Nouvelle facture**, ou convertissez un devis signé (bouton **Convertir en facture**).
2. Choisissez le client : son **SIREN** et son **adresse complète** sont indispensables pour une facture entre professionnels.
3. Ajoutez les lignes : désignation, quantité, prix unitaire HT, taux de TVA.
4. Indiquez la **date de la prestation** (ou la période) et la **nature de l'opération** (biens, services ou les deux).
5. Consultez le panneau **Contrôles légaux** : les erreurs bloquantes doivent être corrigées, les avertissements sont à vérifier.
6. Cliquez sur **Émettre la facture**.

## Ce que fait l'émission

- Un **numéro définitif** est attribué dans une série continue et chronologique (`FA-2026-00001`, `FA-2026-00002`…).
- La facture est **verrouillée** : elle ne peut plus être modifiée ni supprimée. Une erreur se corrige par un **avoir**.
- Son empreinte est **chaînée** à la précédente (SHA-256) : **Factures › Vérifier l'intégrité** prouve qu'aucune facture n'a été altérée.
- Le PDF produit est au format **Factur-X** (PDF/A-3 avec le fichier XML EN 16931 intégré).

> Astuce : depuis la facture émise, **Envoyer** adresse au client le PDF Factur-X et un lien de consultation en ligne.""",
    },
    {
        "title": "Comprendre la facturation électronique 2026-2027",
        "category": "Facturation",
        "summary": "Calendrier de la réforme, formats acceptés, plateformes agréées et ce que Prisme prépare pour vous.",
        "body": """La réforme généralise la facture électronique entre entreprises assujetties à la TVA établies en France.

## Le calendrier

| Date | Réception | Émission |
| --- | --- | --- |
| 1er septembre 2026 | Toutes les entreprises | Grandes entreprises et ETI |
| 1er septembre 2027 | — | PME et micro-entreprises |

## Ce qui change

- Les factures transitent par une **plateforme agréée** (PA) que vous choisissez, immatriculée par l'administration fiscale.
- Trois formats sont acceptés : **Factur-X**, UBL et CII. Prisme produit du Factur-X (profil EN 16931).
- De nouvelles mentions deviennent obligatoires : **SIREN du client**, **adresse de livraison** si elle diffère, **nature des opérations** (biens, services ou les deux), **option pour le paiement de la TVA d'après les débits**.
- Les opérations avec des particuliers ou l'international font l'objet d'un **e-reporting** (transmission des données de transaction).

## Ce que fait Prisme

- Il contrôle les nouvelles mentions avant chaque émission.
- Il génère le PDF Factur-X de chaque facture émise (bouton **PDF**) et son fichier XML (menu **⋯** › **XML Factur-X**).

## Ce que vous faites

1. Choisissez votre plateforme agréée et indiquez-la dans **Paramètres › Facturation › Facturation électronique**.
2. Déposez-y vos factures Factur-X selon les modalités de la plateforme.

> Prisme n'est pas une plateforme agréée : il prépare des factures conformes, la transmission reste de votre responsabilité.""",
    },
    {
        "title": "Corriger une facture avec un avoir",
        "category": "Facturation",
        "summary": "Pourquoi une facture émise ne se modifie jamais et comment émettre un avoir total ou partiel.",
        "body": """Une facture émise est un document comptable définitif : la modifier ou la supprimer romprait la continuité de la numérotation, ce qui est interdit. On l'annule ou on la corrige par un **avoir**.

## Émettre un avoir

1. Ouvrez la facture concernée.
2. Menu **⋯** › **Créer un avoir**, puis indiquez le motif.
3. **Avoir total** : l'avoir est émis immédiatement et la facture passe au statut « Annulée ».
4. **Avoir partiel** (remise, ligne facturée par erreur…) : un brouillon d'avoir est créé ; ajustez ses lignes puis émettez-le.

L'avoir reçoit un numéro de sa propre série (`AV-2026-00001`) et référence la facture d'origine.

## Refacturer correctement

Après un avoir total, menu **⋯** › **Dupliquer en brouillon** sur la facture d'origine : le brouillon reprend client et lignes, corrigez-le puis émettez-le.

> Le reste dû de la facture d'origine tient compte des avoirs : une facture totalement couverte n'apparaît plus dans les relances.""",
    },
    {
        "title": "Automatiser les relances de paiement",
        "category": "Facturation",
        "summary": "Relances manuelles en un clic ou automatiques à J+7, J+15, J+30 : le bon rythme sans y penser.",
        "body": """## Relancer une facture

Depuis une facture en retard, cliquez sur **Relancer** : un email courtois part avec le PDF, le lien de consultation en ligne et le rappel des pénalités et de l'indemnité forfaitaire de 40 €. Le nombre de relances est suivi sur la facture.

## Relances automatiques

1. Configurez l'envoi d'emails dans **Paramètres › Email** (serveur SMTP).
2. Dans **Paramètres › Facturation › Conditions de paiement**, activez **Relances automatiques par email**.
3. Indiquez les jours de retard qui déclenchent chaque relance, par exemple `7, 15, 30`.

Chaque jour, Prisme envoie la relance prévue aux factures concernées, au nom de leur responsable.

> Les factures passent automatiquement au statut « En retard » après leur échéance, et **Rapports › Trésorerie** présente la balance âgée des créances.""",
    },
    {
        "title": "Connecter Claude à votre CRM (MCP)",
        "category": "Intégrations",
        "summary": "Utilisez votre abonnement Claude (Pro, Max, Team) pour piloter Prisme depuis Claude Desktop ou Claude Code.",
        "body": """Prisme expose un serveur **MCP** (Model Context Protocol) : Claude peut chercher, analyser et mettre à jour votre CRM avec les mêmes outils et les mêmes règles que l'assistante Iris.

## 1. Créer un jeton

**Paramètres › Claude (MCP)** › nommez le jeton (par exemple « Claude Desktop ») › **Créer le jeton MCP**. Copiez-le : il ne sera plus affiché.

## 2. Ajouter Prisme à Claude

- **Claude Code** : copiez la commande `claude mcp add --transport http prisme …` proposée dans Paramètres, exécutez-la dans votre terminal, puis vérifiez avec `claude mcp list`.
- **Claude Desktop** : ouvrez *Réglages › Développeur › Modifier la configuration*, collez le bloc JSON proposé (Node.js requis), puis redémarrez Claude.
- **Connecteur distant** : pour les clients qui acceptent un serveur MCP par simple URL. Prisme doit alors être accessible en HTTPS sur Internet.

## 3. Essayer

Demandez par exemple : « Quelles factures sont en retard ? Rédige les relances » ou « Prépare mon rendez-vous de demain avec Hyperion Games ». Cinq prompts prêts à l'emploi sont aussi disponibles (brief du jour, revue de pipeline…).

## Sécurité

- Chaque jeton se révoque à tout moment depuis Paramètres.
- Les règles du CRM s'appliquent : une facture émise reste non modifiable, les oppositions RGPD sont respectées.""",
    },
    {
        "title": "Utiliser l'assistante IA Iris",
        "category": "Intégrations",
        "summary": "Brancher un modèle (Claude, OpenAI, Mistral, local…), ce qu'Iris sait faire et comment elle demande votre accord.",
        "body": """## Connecter un modèle

**Paramètres › Intelligence artificielle › Ajouter un fournisseur** : Anthropic Claude, OpenAI, Mistral AI, Google Gemini, Groq, OpenRouter, DeepSeek, xAI, tout service compatible OpenAI, ou un modèle **local** avec Ollama ou LM Studio (aucune donnée ne quitte votre machine). **Testez la connexion**, puis choisissez le fournisseur par défaut.

## Ce qu'Iris sait faire

- Répondre en s'appuyant sur vos données : « Quel est mon MRR ? », « Quelles affaires sont à risque ? »
- Agir : créer un devis, une tâche, déplacer une opportunité, répondre à un ticket, planifier un rendez-vous.
- Rédiger partout grâce aux boutons ✨ : emails, réponses support, campagnes, articles d'aide, synthèses de fiches, brief du jour.

## Vous gardez la main

Par défaut, Iris vous soumet chaque création ou modification : vous l'approuvez ou la refusez avant exécution (option **Validation humaine des actions d'écriture**). Les actions sensibles (envoi d'email, émission de facture, paiement, suppression) demandent toujours votre accord. L'option **Pseudonymiser les données personnelles** remplace les emails, téléphones et IBAN par des alias avant l'envoi au modèle ; les vraies valeurs restent dans le CRM.""",
    },
    {
        "title": "Inviter votre équipe et gérer les rôles",
        "category": "Compte",
        "summary": "Administrateur, manager, membre, lecteur : qui peut faire quoi dans Prisme.",
        "body": """## Inviter un membre

1. **Paramètres › Équipe › Ajouter un membre** (réservé aux administrateurs).
2. Saisissez son nom, son email et son rôle : le compte est actif immédiatement avec un mot de passe temporaire.
3. Transmettez les identifiants par un canal sûr. La personne remplace ensuite ce mot de passe dans **Paramètres › Mon profil** (12 caractères minimum, recommandation CNIL).

## Les rôles

| Rôle | Peut |
| --- | --- |
| Administrateur | Tout, dont les paramètres, l'équipe, les intégrations et la sauvegarde complète |
| Manager | En plus : pipelines, catalogue, automatisations, envoi de campagnes, export FEC, droits RGPD |
| Membre | Créer et modifier, émettre devis et factures, utiliser Iris |
| Lecteur | Consulter contacts, affaires, devis et factures, sans modifier |

> Pour un départ, **désactivez** le compte plutôt que de le supprimer : l'historique est conservé.""",
    },
    {
        "title": "Importer vos contacts depuis un fichier CSV",
        "category": "Données",
        "summary": "Depuis un tableur ou un autre CRM : correspondance des colonnes, doublons et consentements.",
        "body": """## Préparer le fichier

- Format **CSV encodé en UTF-8**, séparateur `;` ou `,` (export Excel, Google Sheets, HubSpot, Pipedrive…).
- Une ligne d'en-tête : prénom, nom, email, téléphone, entreprise, poste, ville…

## Importer

1. **Paramètres › Import / export › Importer un fichier CSV**.
2. Choisissez **Contacts** et déposez le fichier.
3. Associez chaque colonne à un champ de Prisme (la correspondance est proposée automatiquement).
4. Lancez l'import : les entreprises citées sont créées au besoin, et les doublons mis à jour (contacts par email, entreprises par raison sociale).

## Et le RGPD ?

N'importez que des contacts collectés licitement. Sans consentement prouvé, les contacts ne sont pas marqués « opt-in » : la prospection par email reste possible entre professionnels sur la base de l'intérêt légitime, avec un lien de désinscription dans chaque message.""",
    },
    {
        "title": "Exercer les droits RGPD d'un contact",
        "category": "Conformité",
        "summary": "Accès, portabilité, effacement, opposition : répondre à une demande en quelques clics, dans le délai d'un mois.",
        "body": """Vous disposez **d'un mois** pour répondre à une demande (RGPD, art. 12).

## Accès et portabilité

Fiche du contact › panneau **Données personnelles (RGPD)** › **Export (portabilité)** : un fichier JSON regroupe toutes ses données (fiche, échanges, emails, affaires, devis, factures, tickets, consentements).

## Rectification

Modifiez directement les champs de la fiche : chaque modification est tracée dans le journal d'audit.

## Effacement

**Anonymiser** remplace définitivement les données personnelles. Les factures restent conservées : l'obligation comptable de 10 ans prime sur le droit à l'effacement.

## Opposition

- **Opposition à toute sollicitation** : bloque tous les envois d'emails vers ce contact.
- **Désinscription** : automatique via le lien présent dans chaque campagne.
- **Inscrit Bloctel / ne pas appeler** : signale à l'équipe de ne pas démarcher ce contact par téléphone.

> **Paramètres › RGPD** regroupe le registre des traitements, la durée de conservation des prospects (3 ans recommandés par la CNIL) avec purge assistée, et le journal d'audit.""",
    },
]

# Mailbox threads. Placeholders: {prenom} (contact first name), {contact} (contact full name),
# {vendeur} (owner first name), {signature} (owner full name), {entreprise} (contact's company).
# Each message: (direction, hours ago, body, read, starred)
DEMO_THREADS: list[dict] = [
    {
        "subject": "Proposition commerciale — déploiement multi-sites",
        "messages": [
            ("out", 30, "Bonjour {prenom},\n\nComme convenu, voici notre proposition pour le déploiement sur vos trois sites : planning en quatre semaines, reprise de vos données et formation des équipes.\n\nJe reste disponible cette semaine pour en parler.\n\nBien cordialement,\n{signature}", True, False),
            ("in", 2, "Bonjour {vendeur},\n\nMerci pour la proposition, nous l'avons étudiée avec notre DAF. Pourriez-vous nous détailler le coût de la formation et nous confirmer un démarrage début novembre ?\n\nBien cordialement,\n{contact}", False, True),
        ],
    },
    {
        "subject": "Question sur notre dernière facture",
        "messages": [
            ("in", 4, "Bonjour,\n\nNotre comptabilité ne retrouve pas le bon de commande associé à votre dernière facture. Pourriez-vous nous le transmettre afin que nous puissions la régler ?\n\nMerci d'avance,\n{contact}", False, False),
        ],
    },
    {
        "subject": "Démonstration de Prisme",
        "messages": [
            ("out", 52, "Bonjour {prenom},\n\nSuite à notre échange, je vous propose une démonstration d'une heure avec votre équipe technique. Quels créneaux vous conviendraient la semaine prochaine ?\n\nBien à vous,\n{signature}", True, False),
            ("in", 20, "Bonjour {vendeur},\n\nNotre équipe serait disponible jeudi après-midi ou vendredi matin. Pourriez-vous inclure une présentation de l'API et des automatisations ?\n\nCordialement,\n{contact}", False, False),
        ],
    },
    {
        "subject": "Renouvellement de votre abonnement",
        "messages": [
            ("out", 76, "Bonjour {prenom},\n\nVotre abonnement arrive à échéance le mois prochain. Souhaitez-vous ajuster le nombre de sièges à cette occasion ?\n\nBien cordialement,\n{signature}", True, False),
            ("in", 27, "Bonjour {vendeur},\n\nOui, nous passons à 25 sièges au prochain renouvellement. Pouvez-vous nous envoyer le devis correspondant ?\n\nBonne journée,\n{contact}", True, True),
        ],
    },
    {
        "subject": "Intégration avec notre ERP",
        "messages": [
            ("in", 50, "Bonjour,\n\nNous utilisons un ERP maison et souhaiterions synchroniser nos commandes. Votre API permet-elle de créer des factures et d'être notifié des paiements ?\n\nMerci,\n{contact}", True, False),
            ("out", 46, "Bonjour {prenom},\n\nOui : l'API REST permet de créer clients, devis et factures, et les webhooks vous notifient de chaque paiement. Je vous envoie la documentation et vous propose un point avec notre lead développeur.\n\nBien à vous,\n{signature}", True, False),
        ],
    },
    {
        "subject": "Compte rendu de l'atelier de cadrage",
        "messages": [
            ("out", 98, "Bonjour {prenom},\n\nVoici le compte rendu de notre atelier :\n\n- Périmètre validé : ventes, facturation et support\n- Démarrage prévu début novembre\n- Prochaine étape : validation des maquettes\n\nBonne fin de journée,\n{signature}", True, False),
            ("in", 75, "Bonjour {vendeur},\n\nUn grand merci pour l'atelier, très riche. Nous vous faisons un retour sur les maquettes d'ici vendredi.\n\nÀ très vite,\n{contact}", True, False),
        ],
    },
    {
        "subject": "Audit smart contract : calendrier",
        "messages": [
            ("in", 122, "Bonjour,\n\nPouvez-vous nous confirmer la date de remise du rapport d'audit ? Notre lancement est prévu pour la fin du mois.\n\nMerci,\n{contact}", True, False),
            ("out", 118, "Bonjour {prenom},\n\nLe rapport vous sera remis le 24, avec une session de restitution d'une heure pour passer en revue les recommandations.\n\nBien cordialement,\n{signature}", True, False),
        ],
    },
    {
        "subject": "Votre devis est toujours d'actualité",
        "messages": [
            ("out", 140, "Bonjour {prenom},\n\nJe reviens vers vous au sujet du devis envoyé à {entreprise} la semaine dernière. Avez-vous pu en prendre connaissance ? Je peux l'ajuster si besoin.\n\nBien cordialement,\n{signature}", True, False),
        ],
    },
]
