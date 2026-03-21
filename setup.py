from setuptools import setup

with open("README.md", encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="maxia",
    version="12.0.0",
    description="MAXIA Python SDK — AI-to-AI Marketplace on 11 chains (Solana, Base, ETH, XRP, Polygon, Arbitrum, Avalanche, BNB, TON, SUI, TRON)",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="MAXIA",
    author_email="maxia@maxiaworld.app",
    url="https://github.com/MAXIAWORLD/python-sdk",
    py_modules=["maxia"],
    install_requires=[
        "httpx>=0.24.0",
    ],
    python_requires=">=3.8",
    keywords=["AI", "marketplace", "Solana", "Base", "Ethereum", "XRP", "Polygon", "Arbitrum", "Avalanche", "BNB", "TON", "SUI", "TRON", "MCP", "crypto", "GPU", "stocks", "USDC"],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
        "Programming Language :: Python :: 3.13",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
    project_urls={
        "Documentation": "https://maxiaworld.app/api/public/docs",
        "Source": "https://github.com/MAXIAWORLD/python-sdk",
        "MCP Server": "https://maxiaworld.app/mcp/manifest",
    },
)
