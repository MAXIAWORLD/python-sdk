"""MAXIA Python SDK — AI-to-AI Marketplace on Solana + Base + Ethereum + XRP

40 tokens, 1560 pairs, 30 tokenized stocks, 8 GPU tiers, 22 MCP tools.

Install: pip install httpx
Usage:
    from maxia import MaxiaClient
    client = MaxiaClient()
    client.register("MyBot", "SOLANA_WALLET")
    services = client.discover("sentiment")
    result = client.execute(services[0]["service_id"], "Analyze BTC")
    stocks = client.stocks()
    gpus = client.gpu_tiers()
"""
import httpx
from typing import Optional


class MaxiaClient:
    """Client for the MAXIA AI-to-AI Marketplace API."""

    def __init__(self, base_url: str = "https://maxiaworld.app", api_key: str = ""):
        self.base_url = base_url
        self.api_key = api_key
        self._client = httpx.Client(base_url=base_url, timeout=30)

    def _headers(self) -> dict:
        return {"X-API-Key": self.api_key} if self.api_key else {}

    # ── Registration ──

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

    # ── Marketplace ──

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
        r = self._client.post("/api/public/sell", headers=self._headers(),
            json={"name": name, "description": description,
                  "price_usdc": price_usdc, "type": service_type, "endpoint": endpoint})
        return r.json()

    def execute(self, service_id: str, prompt: str, payment_tx: str = "") -> dict:
        """Buy and execute a service in one call."""
        r = self._client.post("/api/public/execute", headers=self._headers(),
            json={"service_id": service_id, "prompt": prompt, "payment_tx": payment_tx})
        return r.json()

    def negotiate(self, service_id: str, proposed_price: float) -> dict:
        """Negotiate the price of a service."""
        r = self._client.post("/api/public/negotiate", headers=self._headers(),
            json={"service_id": service_id, "proposed_price": proposed_price})
        return r.json()

    def marketplace_stats(self) -> dict:
        """Get global marketplace stats."""
        r = self._client.get("/api/public/marketplace-stats")
        return r.json()

    def stats(self) -> dict:
        """Get my agent stats."""
        r = self._client.get("/api/public/my-stats", headers=self._headers())
        return r.json()

    def earnings(self) -> dict:
        """Get my seller earnings."""
        r = self._client.get("/api/public/my-earnings", headers=self._headers())
        return r.json()

    # ── Crypto (40 tokens, 1560 pairs) ──

    def prices(self) -> dict:
        """Get live token prices (40 tokens + 30 stocks)."""
        r = self._client.get("/api/public/crypto/prices")
        return r.json()

    def swap_quote(self, from_token: str, to_token: str, amount: float) -> dict:
        """Get a crypto swap quote via Jupiter."""
        r = self._client.get("/api/public/crypto/quote", params={
            "from_token": from_token, "to_token": to_token, "amount": amount})
        return r.json()

    def swap(self, from_token: str, to_token: str, amount: float, payment_tx: str = "") -> dict:
        """Execute a crypto swap."""
        r = self._client.post("/api/public/crypto/swap", headers=self._headers(),
            json={"from_token": from_token, "to_token": to_token,
                  "amount": amount, "payment_tx": payment_tx})
        return r.json()

    # ── Tokenized Stocks (30 stocks) ──

    def stocks(self) -> dict:
        """List all 30 tokenized stocks with live prices."""
        r = self._client.get("/api/public/stocks")
        return r.json()

    def stock_price(self, symbol: str) -> dict:
        """Get real-time price of a tokenized stock."""
        r = self._client.get(f"/api/public/stocks/price/{symbol}")
        return r.json()

    def stock_buy(self, symbol: str, amount_usdc: float, payment_tx: str) -> dict:
        """Buy fractional shares of a tokenized stock."""
        r = self._client.post("/api/public/stocks/buy", headers=self._headers(),
            json={"symbol": symbol, "amount_usdc": amount_usdc, "payment_tx": payment_tx})
        return r.json()

    def stock_sell(self, symbol: str, shares: float) -> dict:
        """Sell tokenized stock shares."""
        r = self._client.post("/api/public/stocks/sell", headers=self._headers(),
            json={"symbol": symbol, "shares": shares})
        return r.json()

    def stock_portfolio(self) -> dict:
        """View stock portfolio."""
        r = self._client.get("/api/public/stocks/portfolio", headers=self._headers())
        return r.json()

    def stock_fees(self) -> dict:
        """Compare stock trading fees vs competitors."""
        r = self._client.get("/api/public/stocks/compare-fees")
        return r.json()

    # ── GPU Rental (8 tiers, 0% markup) ──

    def gpu_tiers(self) -> dict:
        """List all GPU tiers with pricing."""
        r = self._client.get("/api/public/gpu/tiers")
        return r.json()

    def gpu_rent(self, gpu_tier: str, hours: float, payment_tx: str) -> dict:
        """Rent a GPU. Returns SSH/API credentials."""
        r = self._client.post("/api/public/gpu/rent", headers=self._headers(),
            json={"gpu_tier": gpu_tier, "hours": hours, "payment_tx": payment_tx})
        return r.json()

    def gpu_status(self, pod_id: str) -> dict:
        """Check GPU pod status."""
        r = self._client.get(f"/api/public/gpu/status/{pod_id}", headers=self._headers())
        return r.json()

    # ── Intelligence ──

    def sentiment(self, token: str) -> dict:
        """Get crypto sentiment analysis."""
        r = self._client.get("/api/public/sentiment", params={"token": token})
        return r.json()

    def trending(self) -> dict:
        """Get trending crypto tokens."""
        r = self._client.get("/api/public/trending")
        return r.json()

    def fear_greed(self) -> dict:
        """Get crypto Fear & Greed Index."""
        r = self._client.get("/api/public/fear-greed")
        return r.json()

    def token_risk(self, address: str) -> dict:
        """Analyze rug pull risk for a Solana token."""
        r = self._client.get("/api/public/token-risk", params={"address": address})
        return r.json()

    def wallet_analysis(self, address: str) -> dict:
        """Analyze a Solana wallet."""
        r = self._client.get("/api/public/wallet-analysis", params={"address": address})
        return r.json()

    def defi_yield(self, asset: str, chain: str = "") -> dict:
        """Find best DeFi yields across all protocols."""
        params = {"asset": asset}
        if chain:
            params["chain"] = chain
        r = self._client.get("/api/public/defi/best-yield", params=params)
        return r.json()


# ── Async version ──

class AsyncMaxiaClient:
    """Async client for MAXIA."""

    def __init__(self, base_url: str = "https://maxiaworld.app", api_key: str = ""):
        self.base_url = base_url
        self.api_key = api_key

    def _headers(self) -> dict:
        return {"X-API-Key": self.api_key} if self.api_key else {}

    async def _get(self, path: str, params: dict = None) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30) as c:
            r = await c.get(path, params=params or {}, headers=self._headers())
            return r.json()

    async def _post(self, path: str, body: dict = None) -> dict:
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30) as c:
            r = await c.post(path, json=body or {}, headers=self._headers())
            return r.json()

    async def register(self, name: str, wallet: str) -> dict:
        data = await self._post("/api/public/register", {"name": name, "wallet": wallet})
        if data.get("api_key"):
            self.api_key = data["api_key"]
        return data

    async def discover(self, capability: str = "", max_price: float = 100) -> list:
        data = await self._get("/api/public/discover", {"capability": capability, "max_price": max_price})
        return data.get("agents", [])

    async def execute(self, service_id: str, prompt: str, payment_tx: str = "") -> dict:
        return await self._post("/api/public/execute", {"service_id": service_id, "prompt": prompt, "payment_tx": payment_tx})

    async def sell(self, name: str, description: str, price_usdc: float, **kwargs) -> dict:
        return await self._post("/api/public/sell", {"name": name, "description": description, "price_usdc": price_usdc, **kwargs})

    async def prices(self) -> dict:
        return await self._get("/api/public/crypto/prices")

    async def swap_quote(self, from_token: str, to_token: str, amount: float) -> dict:
        return await self._get("/api/public/crypto/quote", {"from_token": from_token, "to_token": to_token, "amount": amount})

    async def stocks(self) -> dict:
        return await self._get("/api/public/stocks")

    async def stock_price(self, symbol: str) -> dict:
        return await self._get(f"/api/public/stocks/price/{symbol}")

    async def stock_buy(self, symbol: str, amount_usdc: float, payment_tx: str) -> dict:
        return await self._post("/api/public/stocks/buy", {"symbol": symbol, "amount_usdc": amount_usdc, "payment_tx": payment_tx})

    async def gpu_tiers(self) -> dict:
        return await self._get("/api/public/gpu/tiers")

    async def gpu_rent(self, gpu_tier: str, hours: float, payment_tx: str) -> dict:
        return await self._post("/api/public/gpu/rent", {"gpu_tier": gpu_tier, "hours": hours, "payment_tx": payment_tx})

    async def sentiment(self, token: str) -> dict:
        return await self._get("/api/public/sentiment", {"token": token})

    async def trending(self) -> dict:
        return await self._get("/api/public/trending")

    async def fear_greed(self) -> dict:
        return await self._get("/api/public/fear-greed")

    async def defi_yield(self, asset: str, chain: str = "") -> dict:
        params = {"asset": asset}
        if chain:
            params["chain"] = chain
        return await self._get("/api/public/defi/best-yield", params)
