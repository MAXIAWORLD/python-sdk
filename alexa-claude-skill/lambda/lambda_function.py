"""
Skill Alexa "Claude" — passe la main à Claude depuis un Echo.
Phrase type : "Alexa, demande à Claude de m'expliquer les trous noirs"
Hébergement : Alexa-hosted (AWS Lambda, gratuit) — rien à installer chez toi.
"""

import logging
import os

import anthropic
from ask_sdk_core.skill_builder import SkillBuilder
from ask_sdk_core.dispatch_components import (
    AbstractRequestHandler,
    AbstractExceptionHandler,
)
from ask_sdk_core.utils import is_request_type, is_intent_name, get_slot_value
from ask_sdk_core.handler_input import HandlerInput
from ask_sdk_model import Response

# =========================================================================
#  CONFIG — la seule chose à modifier : colle ta clé API Anthropic.
#  (Sur Alexa-hosted, tu peux aussi la mettre en variable d'environnement
#   ANTHROPIC_API_KEY ; sinon remplace la valeur par défaut ci-dessous.)
# =========================================================================
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "COLLE_TA_CLE_API_ICI")

# Modèle : Haiku 5.5 = rapide et pas cher (important, Alexa coupe vers 8 s).
# Pour des réponses plus "intelligentes" mais un peu plus lentes :
#   MODEL = "claude-opus-5-5"
MODEL = "claude-haiku-5-5"

SYSTEM_PROMPT = (
    "Tu es un assistant vocal en français qui répond à la place d'Alexa, "
    "via un haut-parleur Echo. Tu t'appelles Claude. "
    "Réponds de façon brève, naturelle et parlée : 1 à 3 phrases maximum. "
    "Pas de listes, pas de markdown, pas d'emoji, pas d'URL. "
    "Va droit au but ; si le sujet est vaste, donne l'essentiel en une phrase."
)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def ask_claude(question: str) -> str:
    """Envoie la question à Claude et renvoie une réponse courte, parlée."""
    try:
        resp = client.messages.create(
            model=MODEL,
            max_tokens=400,
            output_config={"effort": "low"},  # priorité à la rapidité pour la voix
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": question}],
        )
        text = " ".join(b.text for b in resp.content if b.type == "text").strip()
        return text or "Je n'ai pas trouvé de réponse à te donner."
    except Exception:
        logger.exception("Erreur lors de l'appel à Claude")
        return "Désolé, je n'arrive pas à joindre Claude pour le moment."


# ------------------------- Handlers Alexa -------------------------

class LaunchRequestHandler(AbstractRequestHandler):
    """Déclenché par : 'Alexa, ouvre Claude'."""

    def can_handle(self, handler_input: HandlerInput) -> bool:
        return is_request_type("LaunchRequest")(handler_input)

    def handle(self, handler_input: HandlerInput) -> Response:
        speech = "Oui, je t'écoute. Qu'est-ce que tu veux me demander ?"
        return (
            handler_input.response_builder
            .speak(speech)
            .ask("Pose ta question.")
            .response
        )


class AskClaudeIntentHandler(AbstractRequestHandler):
    """Déclenché par : 'Alexa, demande à Claude de ...'."""

    def can_handle(self, handler_input: HandlerInput) -> bool:
        return is_intent_name("AskClaudeIntent")(handler_input)

    def handle(self, handler_input: HandlerInput) -> Response:
        question = get_slot_value(handler_input, "query")
        if not question:
            return (
                handler_input.response_builder
                .speak("Je n'ai pas compris la question. Peux-tu répéter ?")
                .ask("Pose ta question à Claude.")
                .response
            )

        answer = ask_claude(question)
        # On garde le micro ouvert pour enchaîner une autre question.
        return (
            handler_input.response_builder
            .speak(answer)
            .ask("Autre chose ?")
            .response
        )


class HelpIntentHandler(AbstractRequestHandler):
    def can_handle(self, handler_input: HandlerInput) -> bool:
        return is_intent_name("AMAZON.HelpIntent")(handler_input)

    def handle(self, handler_input: HandlerInput) -> Response:
        speech = "Pose-moi une question, par exemple : demande à Claude de m'expliquer la photosynthèse."
        return handler_input.response_builder.speak(speech).ask(speech).response


class CancelOrStopIntentHandler(AbstractRequestHandler):
    def can_handle(self, handler_input: HandlerInput) -> bool:
        return (
            is_intent_name("AMAZON.CancelIntent")(handler_input)
            or is_intent_name("AMAZON.StopIntent")(handler_input)
        )

    def handle(self, handler_input: HandlerInput) -> Response:
        return handler_input.response_builder.speak("À bientôt !").response


class FallbackIntentHandler(AbstractRequestHandler):
    """Si Alexa ne reconnaît pas, on envoie quand même à Claude si possible."""

    def can_handle(self, handler_input: HandlerInput) -> bool:
        return is_intent_name("AMAZON.FallbackIntent")(handler_input)

    def handle(self, handler_input: HandlerInput) -> Response:
        speech = "Je n'ai pas bien saisi. Reformule ta question pour Claude."
        return handler_input.response_builder.speak(speech).ask(speech).response


class SessionEndedRequestHandler(AbstractRequestHandler):
    def can_handle(self, handler_input: HandlerInput) -> bool:
        return is_request_type("SessionEndedRequest")(handler_input)

    def handle(self, handler_input: HandlerInput) -> Response:
        return handler_input.response_builder.response


class CatchAllExceptionHandler(AbstractExceptionHandler):
    def can_handle(self, handler_input: HandlerInput, exception: Exception) -> bool:
        return True

    def handle(self, handler_input: HandlerInput, exception: Exception) -> Response:
        logger.exception("Erreur non gérée")
        speech = "Désolé, il y a eu un problème. Réessaie dans un instant."
        return handler_input.response_builder.speak(speech).ask(speech).response


sb = SkillBuilder()
sb.add_request_handler(LaunchRequestHandler())
sb.add_request_handler(AskClaudeIntentHandler())
sb.add_request_handler(HelpIntentHandler())
sb.add_request_handler(CancelOrStopIntentHandler())
sb.add_request_handler(FallbackIntentHandler())
sb.add_request_handler(SessionEndedRequestHandler())
sb.add_exception_handler(CatchAllExceptionHandler())

lambda_handler = sb.lambda_handler()
