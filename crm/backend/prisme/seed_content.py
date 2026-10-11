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
# "deals": title fragments of the open deal the thread belongs to ("company": fallback when no such deal is open). Each message: (direction, hours ago, body, read, starred)
DEMO_THREADS: list[dict] = [
    {
        "subject": "Proposition commerciale — déploiement multi-sites",
        "deals": ["Déploiement multi-sites", "Plan Enterprise"],
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
        "deals": ["Pilote 3 mois", "Migration vers Prisme Cloud"],
        "messages": [
            ("out", 52, "Bonjour {prenom},\n\nSuite à notre échange, je vous propose une démonstration d'une heure avec votre équipe technique. Quels créneaux vous conviendraient la semaine prochaine ?\n\nBien à vous,\n{signature}", True, False),
            ("in", 20, "Bonjour {vendeur},\n\nNotre équipe serait disponible jeudi après-midi ou vendredi matin. Pourriez-vous inclure une présentation de l'API et des automatisations ?\n\nCordialement,\n{contact}", False, False),
        ],
    },
    {
        "subject": "Renouvellement de votre abonnement",
        "deals": ["Abonnement Business 25 sièges", "Extension 10 licences"],
        "messages": [
            ("out", 76, "Bonjour {prenom},\n\nVotre abonnement arrive à échéance le mois prochain. Souhaitez-vous ajuster le nombre de sièges à cette occasion ?\n\nBien cordialement,\n{signature}", True, False),
            ("in", 27, "Bonjour {vendeur},\n\nOui, nous passons à 25 sièges au prochain renouvellement. Pouvez-vous nous envoyer le devis correspondant ?\n\nBonne journée,\n{contact}", True, True),
        ],
    },
    {
        "subject": "Intégration avec notre ERP",
        "deals": ["Intégration ERP"],
        "messages": [
            ("in", 50, "Bonjour,\n\nNous utilisons un ERP maison et souhaiterions synchroniser nos commandes. Votre API permet-elle de créer des factures et d'être notifié des paiements ?\n\nMerci,\n{contact}", True, False),
            ("out", 46, "Bonjour {prenom},\n\nOui : l'API REST permet de créer clients, devis et factures, et les webhooks vous notifient de chaque paiement. Je vous envoie la documentation et vous propose un point avec notre lead développeur.\n\nBien à vous,\n{signature}", True, False),
        ],
    },
    {
        "subject": "Compte rendu de l'atelier de cadrage",
        "deals": ["Refonte de la plateforme client", "Portail partenaires", "Dashboard data"],
        "messages": [
            ("out", 98, "Bonjour {prenom},\n\nVoici le compte rendu de notre atelier :\n\n- Périmètre validé : ventes, facturation et support\n- Démarrage prévu début novembre\n- Prochaine étape : validation des maquettes\n\nBonne fin de journée,\n{signature}", True, False),
            ("in", 75, "Bonjour {vendeur},\n\nUn grand merci pour l'atelier, très riche. Nous vous faisons un retour sur les maquettes d'ici vendredi.\n\nÀ très vite,\n{contact}", True, False),
        ],
    },
    {
        "subject": "Audit smart contract : calendrier",
        "deals": ["Audit smart contract"],
        "company": "Solaris Labs",
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

# Support tickets: (subject, category, first customer message)
DEMO_TICKETS: list[tuple[str, str, str]] = [
    ("Impossible d'exporter les factures en PDF", "Facturation", "Bonjour,\n\nDepuis ce matin, le bouton PDF des factures ne télécharge plus rien : le fichier reste bloqué à 0 %. Nous devons envoyer nos factures aujourd'hui, pouvez-vous regarder rapidement ?\n\nMerci"),
    ("Question sur la facturation électronique", "Facturation", "Bonjour,\n\nNous serons concernés par la réforme en septembre 2027. Vos factures Factur-X seront-elles acceptées par notre plateforme agréée ? Faut-il prévoir quelque chose de notre côté ?\n\nCordialement"),
    ("Erreur 500 sur l'API contacts", "Technique", "Bonjour,\n\nNos appels de création de contacts sur l'API renvoient une erreur 500 depuis 9 h environ, alors que les autres routes fonctionnent. Pouvez-vous vérifier ?\n\nMerci"),
    ("Ajout d'utilisateurs supplémentaires", "Compte", "Bonjour,\n\nTrois personnes rejoignent notre équipe commerciale le mois prochain. Comment ajouter des sièges à notre abonnement ?\n\nBonne journée"),
    ("Synchronisation du wallet échouée", "Web3", "Bonjour,\n\nLa synchronisation de notre wallet échoue avec le message « signature invalide » depuis la mise à jour du bridge, et les transactions d'hier n'apparaissent pas.\n\nMerci de votre aide"),
    ("Demande de remboursement", "Facturation", "Bonjour,\n\nNotre abonnement d'octobre a été prélevé deux fois. Pouvez-vous procéder au remboursement du doublon ?\n\nCordialement"),
    ("Comment configurer le SSO ?", "Compte", "Bonjour,\n\nNous souhaitons activer la connexion unique avec notre annuaire Microsoft Entra ID. Avez-vous une procédure à nous transmettre ?\n\nMerci"),
    ("Lenteurs sur le tableau de bord", "Technique", "Bonjour,\n\nLe tableau de bord met plus de dix secondes à s'afficher depuis hier après-midi, pour toute l'équipe. Nos autres outils fonctionnent normalement.\n\nMerci"),
    ("Bug d'affichage sur mobile", "Technique", "Bonjour,\n\nSur iPhone, le bouton de validation du formulaire de commande est masqué par la barre de navigation, ce qui bloque nos commerciaux en rendez-vous.\n\nBonne journée"),
    ("Changement d'adresse de facturation", "Compte", "Bonjour,\n\nNotre siège a déménagé. Pouvez-vous mettre à jour l'adresse de facturation pour les prochaines factures ?\n\nMerci d'avance"),
]

# Documents generated as PDFs on the company letterhead. {societe} is replaced by the company name.
DEMO_DOCUMENTS: list[dict] = [
    {
        "name": "Contrat de prestation — Orbital Data.pdf",
        "label": "Contrat",
        "title": "Contrat de prestation de services",
        "subtitle": "Entre {societe} (le Prestataire) et Orbital Data (le Client) — projet Data platform Orbital",
        "folder": "Contrats",
        "company": "Orbital Data",
        "project": "Data platform Orbital",
        "description": "Contrat signé : régie à 650 € HT par jour, factures mensuelles à 30 jours.",
        "tags": ["contrat", "signé"],
        "days_ago": 41,
        "sections": [
            ("1. Objet", "Le présent contrat a pour objet la conception et la mise en production d'une plateforme de données temps réel pour le Client, telle que décrite dans la proposition commerciale acceptée."),
            ("2. Durée", "Le contrat prend effet à sa signature pour une durée de six mois. Il peut être renouvelé par avenant signé des deux parties."),
            ("3. Modalités d'exécution", "Les prestations sont réalisées en régie, selon un planning validé lors du comité de pilotage mensuel.\n- Un chef de projet dédié, interlocuteur unique du Client\n- Une recette contradictoire à la fin de chaque lot\n- Des comptes rendus partagés sous 48 heures"),
            ("4. Prix et facturation", "Les prestations sont facturées au temps passé, sur la base d'un taux journalier de 650 € HT, selon les feuilles de temps validées par le Client. Les factures sont émises mensuellement et payables à 30 jours à compter de leur date d'émission.\n\nTout retard de paiement entraîne des pénalités au taux d'intérêt de la BCE majoré de 10 points, ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce)."),
            ("5. Propriété intellectuelle", "Les droits patrimoniaux sur les développements spécifiques sont cédés au Client au fur et à mesure de leur paiement intégral. Le Prestataire conserve la propriété de ses outils et savoir-faire préexistants."),
            ("6. Confidentialité", "Chaque partie s'engage à ne pas divulguer les informations confidentielles de l'autre partie pendant la durée du contrat et les trois années qui suivent."),
            ("7. Données personnelles", "Lorsqu'il traite des données personnelles pour le compte du Client, le Prestataire agit en qualité de sous-traitant au sens de l'article 28 du RGPD et uniquement sur instruction documentée du Client."),
            ("8. Droit applicable", "Le contrat est soumis au droit français. À défaut d'accord amiable, tout litige relève des tribunaux compétents du ressort du siège du Prestataire."),
        ],
    },
    {
        "name": "Conditions générales de vente 2026.pdf",
        "label": "CGV",
        "title": "Conditions générales de vente",
        "subtitle": "Applicables à toute commande passée auprès de {societe} à compter du 1er janvier 2026.",
        "folder": "Juridique",
        "description": "CGV en vigueur, jointes aux devis et reprises sur le portail client.",
        "tags": ["juridique"],
        "days_ago": 284,
        "sections": [
            ("1. Champ d'application", "Les présentes conditions s'appliquent à toutes les prestations et à tous les abonnements proposés par {societe} à des clients professionnels. Elles prévalent sur toute condition d'achat, sauf accord écrit contraire."),
            ("2. Devis et commandes", "Les devis sont valables 30 jours. La commande est ferme à la signature du devis, y compris par signature électronique."),
            ("3. Prix", "Les prix sont exprimés en euros hors taxes ; la TVA est facturée en sus au taux en vigueur. Les abonnements sont payables d'avance, mensuellement ou annuellement."),
            ("4. Paiement", "Sauf mention contraire, les factures sont payables à 30 jours à compter de leur date d'émission, par virement. Aucun escompte n'est accordé en cas de paiement anticipé.\n\nTout retard de paiement entraîne de plein droit des pénalités au taux d'intérêt appliqué par la BCE à son opération de refinancement la plus récente majoré de 10 points, ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement."),
            ("5. Responsabilité", "La responsabilité de {societe} est limitée aux dommages directs et prévisibles, dans la limite des sommes perçues au titre de la commande concernée sur les douze derniers mois."),
            ("6. Données personnelles", "Les données des contacts clients sont traitées pour la gestion de la relation commerciale, conformément au RGPD. Chaque personne dispose d'un droit d'accès, de rectification, d'effacement, d'opposition et de portabilité."),
            ("7. Droit applicable", "Les présentes conditions sont soumises au droit français."),
        ],
    },
    {
        "name": "Cahier des charges — Refonte plateforme NovaPay.pdf",
        "label": "Spécifications",
        "title": "Cahier des charges — refonte de la plateforme NovaPay",
        "subtitle": "Version 1.2, document de travail partagé avec l'équipe produit NovaPay",
        "folder": "Projets",
        "company": "NovaPay",
        "project": "Refonte plateforme NovaPay",
        "description": "Objectifs, périmètre fonctionnel et contraintes validés en atelier.",
        "tags": ["cadrage"],
        "days_ago": 68,
        "sections": [
            ("Contexte", "NovaPay traite plus de 40 000 paiements par jour sur une plateforme vieillissante, difficile à faire évoluer. La refonte doit accompagner le lancement de l'offre destinée aux PME."),
            ("Objectifs", "- Réduire le temps d'intégration d'un nouveau marchand de trois semaines à trois jours\n- Atteindre 99,95 % de disponibilité\n- Offrir un tableau de bord temps réel aux marchands"),
            ("Périmètre fonctionnel", "- Espace marchand : inscription, clés d'API, suivi des transactions\n- Back-office : conformité, gestion des litiges, exports comptables\n- API publique documentée (REST et webhooks)"),
            ("Contraintes", "Hébergement en France, conformité PCI DSS, authentification forte des administrateurs et journalisation de toutes les actions sensibles."),
            ("Planning", "- Cadrage et maquettes : quatre semaines\n- Développement par lots de deux semaines\n- Recette, puis mise en production progressive"),
        ],
    },
    {
        "name": "Compte rendu de lancement — App mobile Kairos.pdf",
        "label": "Compte rendu",
        "title": "Réunion de lancement — application mobile Kairos",
        "subtitle": "Compte rendu partagé avec l'équipe Kairos RH",
        "folder": "Projets",
        "company": "Kairos RH",
        "project": "App mobile Kairos",
        "description": "Décisions et prochaines étapes de la réunion de lancement.",
        "tags": ["compte-rendu"],
        "days_ago": 24,
        "sections": [
            ("Participants", "Côté Kairos RH : direction produit, responsable RH et référent technique. Côté {societe} : chef de projet, lead développeur et designer UX/UI."),
            ("Décisions", "- Application iOS et Android développée en React Native\n- Première version centrée sur les demandes de congés et les notes de frais\n- Démonstration toutes les deux semaines"),
            ("Points d'attention", "- Intégration avec le SIRH existant à confirmer\n- Accessibilité : conformité RGAA visée dès la première version"),
            ("Prochaines étapes", "- Ateliers utilisateurs la semaine prochaine\n- Maquettes des parcours principaux\n- Validation du planning détaillé"),
        ],
    },
    {
        "name": "Rapport d'audit préliminaire — Solaris Labs.pdf",
        "label": "Rapport",
        "title": "Audit des smart contracts Solaris — rapport préliminaire",
        "subtitle": "Version de travail, avant revue contradictoire avec l'équipe Solaris Labs",
        "folder": "Projets",
        "company": "Solaris Labs",
        "project": "Audit smart contracts Solaris",
        "description": "Constats provisoires : 1 critique, 2 majeurs, 4 mineurs.",
        "tags": ["audit", "web3"],
        "days_ago": 6,
        "sections": [
            ("Périmètre", "Contrats de staking et de vesting (Solidity 0.8), dans leur version déployée sur le réseau de test."),
            ("Méthodologie", "- Revue manuelle ligne à ligne\n- Analyse statique et tests de propriétés (fuzzing)\n- Scénarios d'attaque économiques"),
            ("Synthèse des constats", "- 1 critique : réentrance possible lors du retrait des récompenses\n- 2 majeurs : contrôle d'accès incomplet sur la mise à jour des paramètres, arrondi défavorable dans le calcul des parts\n- 4 mineurs : événements manquants et optimisations de gas"),
            ("Recommandations", "Appliquer le modèle checks-effects-interactions, réserver les fonctions d'administration à un multisig et ajouter un test de non-régression pour chaque constat avant le déploiement en production."),
        ],
    },
    {
        "name": "Charte graphique {societe}.pdf",
        "label": "Marque",
        "title": "Charte graphique {societe}",
        "subtitle": "Logo, couleurs, typographie et ton éditorial",
        "folder": "Marketing",
        "description": "Référence pour les présentations, les campagnes et le site.",
        "tags": ["marque"],
        "days_ago": 152,
        "sections": [
            ("Logo", "Le logo s'utilise sur fond clair ou sur le dégradé de marque, avec une zone de protection égale à la moitié de sa hauteur. Il n'est jamais déformé ni recoloré."),
            ("Couleurs", "- Indigo #5B6CFF : couleur principale, actions et liens\n- Violet #9B5CF6 : accents et illustrations\n- Turquoise #22D3EE : graphiques et mises en avant"),
            ("Typographie", "Inter pour tous les supports : SemiBold pour les titres, Regular pour les textes courants."),
            ("Ton éditorial", "Clair, direct et chaleureux : des phrases courtes, des verbes d'action, et toujours le vouvoiement avec nos clients."),
        ],
    },
]
