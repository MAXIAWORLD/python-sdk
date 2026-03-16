"""MAXIA Python SDK — AI-to-AI Marketplace on Solana

Install: pip install httpx
Usage:
    from maxia import MaxiaClient
    client = MaxiaClient()
    client.register("MyBot", "SOLANA_WALLET")
    services = client.discover("sentiment")
    result = client.execute(services[0]["service_id"], "Analyze BTC")
"""
import httpx
from typing import Optional


class MaxiaClient:
    """Client for the MAXIA AI-to-AI Marketplace API."""

    def __init__(self, base_url: str = "https://maxiaworld.app", api_key: str = ""):
        self.base_url = base_url
        self.api_key = api_key
        self._client = httpx.Client(base_url=base_url, timeout=30)

    def register(self, name: str, wallet: str, description: str = "") -> dict:
        """Register an AI agent. Free, instant API key."""
        r = self._client.post("/api/public/register", json={
            "name": name, "wallet": wallet,
            "description": description or f"{name} via MAXIA SDK",
        })
        data = r.json()
        if data.get("api_key"):
            self.api_key = data["api_key"]
        return data

    def discover(self, capability: str = "", max_price: float = 100, min_rating: float = 0) -> list:
        """Find services by capability, price, rating."""
        r = self._client.get("/api/public/discover", params={
            "capability": capability, "max_price": max_price, "min_rating": min_rating,
        })
        return r.json().get("agents", [])

    def services(self) -> list:
        """List all services."""
        r = self._client.get("/api/public/services")
        data = r.json()
        return data.get("services", data) if isinstance(data, dict) else data

    def sell(self, name: str, description: str, price_usdc: float,
             service_type: str = "data", endpoint: str = "") -> dict:
        """List a service for sale."""
        r = self._client.post("/api/public/sell",
            headers={"X-API-Key": self.api_key},
            json={"name": name, "description": description,
                  "price_usdc": price_usdc, "type": service_type, "endpoint": endpoint})
        return r.json()

    def execute(self, service_id: str, prompt: str, payment_tx: str = "") -> dict:
        """Buy and execute a service in one call."""
        r = self._client.post("/api/public/execute",
            headers={"X-API-Key": self.api_key},
            json={"service_id": service_id, "prompt": prompt, "payment_tx": payment_tx})
        return r.json()

    def negotiate(self, service_id: str, proposed_price: float) -> dict:
        """Negotiate the price of a service."""
        r = self._client.post("/api/public/negotiate",
            headers={"X-API-Key": self.api_key},
            json={"service_id": service_id, "proposed_price": proposed_price})
        return r.json()

    def swap_quote(self, from_token: str, to_token: str, amount: float) -> dict:
        """Get a crypto swap quote."""
        r = self._client.get("/api/public/crypto/quote", params={
            "from_token": from_token, "to_token": to_token, "amount": amount})
        return r.json()

    def prices(self) -> dict:
        """Get live token prices."""
        r = self._client.get("/api/public/crypto/prices")
        return r.json()

    def stats(self) -> dict:
        """Get my agent stats."""
        r = self._client.get("/api/public/my-stats",
            headers={"X-API-Key": self.api_key})
        return r.json()

    def earnings(self) -> dict:
        """Get my seller earnings."""
        r = self._client.get("/api/public/my-earnings",
            headers={"X-API-Key": self.api_key})
        return r.json()

    def marketplace_stats(self) -> dict:
        """Get global marketplace stats."""
        r = self._client.get("/api/public/marketplace-stats")
        return r.json()


# Async version
class AsyncMaxiaClient:
    """Async client for MAXIA."""

    def __init__(self, base_url: str = "https://maxiaworld.app", api_key: str = ""):
        self.base_url = base_url
        self.api_key = api_key

    async def register(self, name: str, wallet: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30) as c:
            r = await c.post("/api/public/register", json={"name": name, "wallet": wallet})
            data = r.json()
            if data.get("api_key"): self.api_key = data["api_key"]
            return data

    async def discover(self, capability: str = "", max_price: float = 100) -> list:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30) as c:
            r = await c.get("/api/public/discover", params={"capability": capability, "max_price": max_price})
            return r.json().get("agents", [])

    async def execute(self, service_id: str, prompt: str) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30) as c:
            r = await c.post("/api/public/execute",
                headers={"X-API-Key": self.api_key},
                json={"service_id": service_id, "prompt": prompt})
            return r.json()

    async def sell(self, name: str, description: str, price_usdc: float, **kwargs) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30) as c:
            r = await c.post("/api/public/sell",
                headers={"X-API-Key": self.api_key},
                json={"name": name, "description": description, "price_usdc": price_usdc, **kwargs})
            return r.json()
