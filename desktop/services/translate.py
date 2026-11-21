"""Reel translation service — offline subtitle translation with Argos Translate models.

Runs the Argos (OpenNMT) models directly with CTranslate2 and argostranslate's own tokenizers,
minus its Stanza/PyTorch sentence splitter (subtitle cues are already short lines). Models are
downloaded once from the Argos package index into MODELS_DIR and then work fully offline. Pairs without a direct model pivot through English.

    GET  /health
    GET  /languages                      -> { targets: [...], sources: [...] }
    POST /translate {from,to,texts[]}    -> { texts: [...] }
"""

import json
import os
import shutil
import sys
import tempfile
import threading
import time
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import logging

import ctranslate2
from argostranslate.tokenizer import BPETokenizer, SentencePieceTokenizer

PORT = int(os.environ.get("EXTRAS_PORT", "47322"))
HOST = "127.0.0.1"
MODELS_DIR = os.environ.get("MODELS_DIR") or os.path.join(os.path.expanduser("~"), ".reel-models")
INDEX_URL = "https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json"
INDEX_FILE = os.path.join(MODELS_DIR, "index.json")
ctranslate2.set_log_level(logging.ERROR)
THREADS = max(1, min(4, (os.cpu_count() or 2) // 2))

# Reel / BCP-47 codes -> Argos codes
ALIASES = {"no": "nb", "nn": "nb", "pt-br": "pb", "zh-tw": "zt", "zh-hant": "zt", "iw": "he", "jap": "ja", "fil": "tl"}


def fetch(url, timeout=60):
    # argos-net.com rejects urllib's default User-Agent
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Reel/1.0"}), timeout=timeout)


def log(*args):
    print("[translate]", *args, flush=True)


def norm(code):
    c = str(code or "").strip().lower().replace("_", "-")
    if c in ALIASES:
        return ALIASES[c]
    base = c.split("-")[0]
    return ALIASES.get(base, base)


# ---------- package index ----------

_index = None
_index_lock = threading.Lock()


def index():
    """{(from, to): package} from the Argos index, refreshed daily, cached on disk for offline use."""
    global _index
    with _index_lock:
        if _index is not None:
            return _index
        data = None
        fresh = os.path.exists(INDEX_FILE) and time.time() - os.path.getmtime(INDEX_FILE) < 86400
        if not fresh:
            try:
                with fetch(INDEX_URL, timeout=15) as r:
                    data = json.loads(r.read())
                os.makedirs(MODELS_DIR, exist_ok=True)
                with open(INDEX_FILE, "w") as f:
                    json.dump(data, f)
            except Exception as e:  # offline: fall back to the cached copy
                log("index download failed:", e)
        if data is None and os.path.exists(INDEX_FILE):
            with open(INDEX_FILE) as f:
                data = json.load(f)
        if data is None:
            return {}
        _index = {(p["from_code"], p["to_code"]): p for p in data}
        return _index


# ---------- models ----------

_models = {}
_model_locks = {}
_global_lock = threading.Lock()


def _lock_for(key):
    with _global_lock:
        return _model_locks.setdefault(key, threading.Lock())


def _install(pkg):
    """Download + extract an .argosmodel (zip) into MODELS_DIR/<from>_<to>; returns its folder."""
    dest = os.path.join(MODELS_DIR, f"{pkg['from_code']}_{pkg['to_code']}")
    if os.path.exists(os.path.join(dest, "model", "model.bin")):
        return dest
    os.makedirs(MODELS_DIR, exist_ok=True)
    url = pkg["links"][0]
    log(f"downloading {url}")
    started = time.time()
    with tempfile.TemporaryDirectory(dir=MODELS_DIR) as tmp:
        archive = os.path.join(tmp, "pkg.zip")
        with fetch(url) as r, open(archive, "wb") as f:
            shutil.copyfileobj(r, f, 1 << 20)
        with zipfile.ZipFile(archive) as z:
            for member in z.namelist():  # refuse path traversal
                if member.startswith("/") or ".." in member.split("/"):
                    raise ValueError(f"unsafe path in package: {member}")
            z.extractall(tmp)
        top = next(d for d in os.listdir(tmp) if os.path.isdir(os.path.join(tmp, d)))
        src = os.path.join(tmp, top)
        shutil.rmtree(os.path.join(src, "stanza"), ignore_errors=True)  # sentence splitter we don't use
        shutil.rmtree(dest, ignore_errors=True)
        shutil.move(src, dest)
    log(f"installed {pkg['from_code']}→{pkg['to_code']} in {time.time() - started:.1f}s")
    return dest


def model(src, tgt):
    key = (src, tgt)
    if key in _models:
        return _models[key]
    with _lock_for(key):
        if key in _models:
            return _models[key]
        pkg = index().get(key)
        if not pkg:
            raise LookupError(f"No offline model for {src}→{tgt}")
        folder = _install(pkg)
        meta = {}
        try:
            with open(os.path.join(folder, "metadata.json")) as f:
                meta = json.load(f)
        except OSError:
            pass
        translator = ctranslate2.Translator(
            os.path.join(folder, "model"), device="cpu", compute_type="int8", inter_threads=1, intra_threads=THREADS
        )
        # same tokenizer choice as argostranslate: older packages use SentencePiece, 1.9+ Moses + BPE
        spm, bpe = os.path.join(folder, "sentencepiece.model"), os.path.join(folder, "bpe.model")
        if os.path.exists(spm):
            tokenizer = SentencePieceTokenizer(spm)
        elif os.path.exists(bpe):
            tokenizer = BPETokenizer(bpe, src, tgt)
        else:
            raise FileNotFoundError(f"no tokenizer in {folder}")
        entry = {"translator": translator, "tok": tokenizer, "prefix": meta.get("target_prefix") or "", "lock": threading.Lock()}
        _models[key] = entry
        log(f"ready {src}→{tgt}")
        return entry


def run(src, tgt, texts):
    """Translate cues; each line of a multi-line cue is translated on its own and re-joined."""
    m = model(src, tgt)
    lines, owners = [], []
    for i, t in enumerate(texts):
        for line in t.split("\n"):
            line = " ".join(line.split())
            if line:
                lines.append(line)
                owners.append(i)
    if not lines:
        return list(texts)
    tokens = [m["tok"].encode(line) for line in lines]
    prefix = [[m["prefix"]]] * len(lines) if m["prefix"] else None
    with m["lock"]:  # one batch at a time per model
        results = m["translator"].translate_batch(
            tokens,
            target_prefix=prefix,
            beam_size=2,
            max_batch_size=32,
            max_decoding_length=256,
            length_penalty=0.2,
            replace_unknowns=True,
        )
    out = [[] for _ in texts]
    for owner, r in zip(owners, results):
        pieces = r.hypotheses[0]
        if m["prefix"] and pieces and pieces[0] == m["prefix"]:
            pieces = pieces[1:]
        out[owner].append(m["tok"].decode(pieces).strip())
    return ["\n".join(parts) for parts in out]


def translate(src, tgt, texts):
    src, tgt = norm(src), norm(tgt)
    if src == tgt:
        return texts
    idx = index()
    if (src, tgt) in idx:
        return run(src, tgt, texts)
    if src != "en" and tgt != "en" and (src, "en") in idx and ("en", tgt) in idx:
        return run("en", tgt, run(src, "en", texts))
    raise LookupError(f"No offline model for {src}→{tgt}")


def languages():
    idx = index()
    targets = sorted({"en"} | {t for (s, t) in idx if s == "en"})
    sources = sorted({"en"} | {s for (s, t) in idx if t == "en"})
    return {"targets": targets, "sources": sources, "installed": sorted(f"{s}_{t}" for (s, t) in _models)}


# ---------- http ----------


class Handler(BaseHTTPRequestHandler):
    def _send(self, status, body):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._send(204, {})

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"ok": True})
        if self.path == "/languages":
            return self._send(200, languages())
        self._send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/translate":
            return self._send(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > 1_000_000:
            return self._send(413, {"error": "too large"})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            texts = body.get("texts")
            if not isinstance(texts, list) or len(texts) > 100:
                return self._send(400, {"error": "texts must be an array of ≤100 strings"})
            src, tgt = body.get("from") or "en", body.get("to")
            started = time.time()
            out = translate(src, tgt, [str(t) for t in texts])
            log(f"{src}→{tgt} {len(texts)} lines in {int((time.time() - started) * 1000)}ms")
            self._send(200, {"texts": out})
        except LookupError as e:
            self._send(422, {"error": str(e)})
        except Exception as e:
            log("translate failed:", e)
            self._send(500, {"error": str(e)})

    def log_message(self, *args):  # quiet default access log
        pass


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log(f"listening on http://{HOST}:{PORT} (models: {MODELS_DIR})")
    threading.Thread(target=index, daemon=True).start()  # warm the index

    def watch_parent():  # Reel holds our stdin open; EOF means it went away (works on every OS)
        try:
            while sys.stdin.buffer.read(1024):
                pass
        except Exception:
            pass
        os._exit(0)

    threading.Thread(target=watch_parent, daemon=True).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        sys.exit(0)
