# ZALVO

ZALVO is a personal AI agent for your terminal. It chats, runs tools, writes code, remembers, and
learns new skills. It works with many AI providers (OpenRouter, OpenAI, Anthropic, Nous Portal,
local models, and more).

> **Built on [Hermes Agent](https://github.com/NousResearch/hermes-agent) by Nous Research** (MIT License).
> ZALVO is a rebranded copy of it. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

---

## Install on Windows (one step)

1. Download / unzip `zalvo-agent.zip` (or `git clone` this repo) into a folder, e.g. `C:\ZALVO`.
2. Double-click **`install.bat`**.
   - It installs [uv](https://docs.astral.sh/uv/) if needed. uv downloads Python 3.14 by itself,
     so you do **not** need to install Python first.
   - It installs everything into a private `.venv` folder.
   - It makes a **ZALVO** shortcut on your Desktop.
   - It asks if it should add `zalvo` to your PATH (say **Y**).
3. Done.

## Run

- Double-click the **ZALVO** Desktop shortcut (or `ZALVO.bat`), **or**
- open a **new** terminal and type:

```
zalvo setup      # first time: choose AI provider + paste your API key
zalvo            # start chatting
zalvo --help     # all commands
```

Your settings and data live in `%LOCALAPPDATA%\zalvo` (Windows) or `~/.zalvo` (Linux/macOS).

---

## Roman Urdu guide

**Install kaise karein:**
1. `zalvo-agent.zip` ko kisi folder mein unzip karein (jaise `C:\ZALVO`).
2. **`install.bat`** par double-click karein. Pehli dafa thora time lagega (internet chahiye).
   Python alag se install karne ki zaroorat nahi, installer khud sab kar deta hai.
3. Jab pooche "Add 'zalvo' command to your PATH?" to **Y** dabayein.
4. Desktop par **ZALVO** ka shortcut ban jayega.

**Chalana kaise hai:**
- Desktop par **ZALVO** shortcut par double-click karein, ya
- naya terminal kholein aur likhein: `zalvo`
- Pehli dafa `zalvo setup` chalayein, apna AI provider chunein aur API key daalein
  (misaal: OpenRouter ki key).

**Masla aaye to:** `zalvo doctor` chalayein, ye bata dega kya missing hai.

---

## Linux / macOS

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh   # if you don't have uv
uv sync --frozen --python 3.14
./.venv/bin/zalvo --help
```

## Full documentation

The original, detailed docs (features, gateway for Telegram/Discord/WhatsApp, skills, plugins) are in
[docs/UPSTREAM_README.md](docs/UPSTREAM_README.md) and the [`website/docs`](website/docs) folder.
Command names there are already changed to `zalvo`; web links still point to the upstream
Hermes Agent docs.

## License

MIT. Copyright (c) 2025 Nous Research. ZALVO keeps that notice, as the license requires.
