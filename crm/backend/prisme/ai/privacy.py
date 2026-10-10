"""Reversible pseudonymisation of personal data sent to external AI providers (RGPD option).

Emails, phone numbers and IBANs are replaced by stable placeholders such as
<email-3>. The mapping stays in the CRM: placeholders found in tool arguments
are restored before execution, and in the text shown to the user.
"""

from __future__ import annotations

import re
from typing import Any

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?<!\w)(?:\+33\s?|0)[1-9](?:[\s.-]?\d{2}){4}(?!\w)|\+\d{1,3}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4}){2,4}")
IBAN = re.compile(r"\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,4})?\b")
PLACEHOLDER = re.compile(r"<(email|tel|iban)-(\d+)>")


class Pseudonymizer:
    def __init__(self, mapping: dict[str, str] | None = None):
        self.mapping: dict[str, str] = dict(mapping or {})  # placeholder -> real value
        self.reverse: dict[str, str] = {v: k for k, v in self.mapping.items()}

    def _token(self, kind: str, value: str) -> str:
        if value in self.reverse:
            return self.reverse[value]
        token = f"<{kind}-{len(self.mapping) + 1}>"
        self.mapping[token] = value
        self.reverse[value] = token
        return token

    def mask(self, text: str) -> str:
        if not text:
            return text
        text = EMAIL.sub(lambda m: self._token("email", m.group(0)), text)
        text = IBAN.sub(lambda m: self._token("iban", m.group(0)), text)
        text = PHONE.sub(lambda m: self._token("tel", m.group(0)), text)
        return text

    def unmask(self, value: Any) -> Any:
        if isinstance(value, str):
            return PLACEHOLDER.sub(lambda m: self.mapping.get(m.group(0), m.group(0)), value)
        if isinstance(value, list):
            return [self.unmask(v) for v in value]
        if isinstance(value, dict):
            return {k: self.unmask(v) for k, v in value.items()}
        return value
