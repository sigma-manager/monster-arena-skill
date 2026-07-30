#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deploy_ftp.py — wdrażanie aplikacji na MonsterASP.NET przez FTP/FTPS.

Dane dostępowe (panel: Websites -> <witryna> -> Deploy (FTP/WebDeploy/Git)):
  host: siteXXXXX.siteasp.net, użytkownik: siteXXXXX, port 21, katalog docelowy: /wwwroot

Użycie:
  python3 deploy_ftp.py --source ./moja-aplikacja --env-file .deploy.env
  python3 deploy_ftp.py --source ./moja-aplikacja --dry-run      # bez poświadczeń, tylko podgląd

Opcje:
  --remote-root /wwwroot   katalog docelowy na serwerze (domyślnie /wwwroot)
  --dry-run                niczego nie wysyła — pokazuje listę plików i podmiany tokenów
  --no-tls                 bez TLS (zwykły FTP) — domyślnie próbuje FTPS, potem fallback
  --no-offline             nie wgrywaj app_offline.htm na czas transferu
  --ignore WZOR            dodatkowa nazwa pliku/katalogu do pominięcia (powtarzalna)

Plik .deploy.env (wzór: ../assets/node-mysql-app/.deploy.env.example):
  FTP_HOST / FTP_PORT / FTP_USER / FTP_PASSWORD  — wymagane przy realnym deployu
  DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / DB_SSL — opcjonalne;
    ich wartości trafiają do web.config w miejsce tokenów  __DB_HOST__  itd.
    (dzięki temu hasła nie są w repozytorium — tylko na serwerze).
"""
from __future__ import annotations

import argparse
import ftplib
import io
import os
import posixpath
import re
import sys
import time
from pathlib import Path

DEFAULT_IGNORES = {
    '.git', '.gitignore', '.env', '.deploy.env', '.DS_Store', 'Thumbs.db',
    'app_offline.htm', 'deploy.zip',
}
PATCH_FILES = {'web.config'}                      # w tych plikach podmieniamy tokeny
PATCH_PREFIXES = ('DB_', 'APP_', 'SITE_')         # które zmienne .deploy.env biorą udział w podmianie
TOKEN_RE = re.compile(r'__[A-Z0-9_]+__')

APP_OFFLINE_HTML = (
    '<!doctype html><html lang="pl"><head><meta charset="utf-8">'
    '<title>Trwa aktualizacja</title></head>'
    '<body style="font-family:sans-serif;text-align:center;padding:4rem">'
    '<h1>Trwa aktualizacja strony&hellip;</h1>'
    '<p>Wrócimy za chwilę. <small>(deployment in progress)</small></p>'
    '</body></html>'
)


def load_env_file(path: str | None) -> dict:
    """Czyta plik KEY=VALUE (linie # = komentarz, wartości mogą być w cudzysłowach)."""
    env: dict[str, str] = {}
    if not path:
        return env
    p = Path(path)
    if not p.is_file():
        print(f'[warn] Plik env nie istnieje: {p}', file=sys.stderr)
        return env
    for line in p.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, val = line.partition('=')
        env[key.strip()] = val.strip().strip('"').strip("'")
    return env


def collect_files(source: Path, ignores: set) -> list[Path]:
    """Zwraca listę plików do wysłania (pomija katalogi/pliki z ignore-listy)."""
    files = []
    for root, dirs, names in os.walk(source):
        dirs[:] = sorted(d for d in dirs if d not in ignores)
        for n in sorted(names):
            if n in ignores:
                continue
            files.append(Path(root) / n)
    return files


def patch_content(text: str, env: dict) -> tuple[str, list[str]]:
    """Podmienia tokeny __NAZWA__ wartościami z env (prefixy PATCH_PREFIXES).
    Zwraca (nowa_tresc, lista_pozostalych_tokenow)."""
    for key, val in env.items():
        if key.startswith(PATCH_PREFIXES) and val != '':
            text = text.replace(f'__{key}__', val)
    return text, sorted(set(TOKEN_RE.findall(text)))


class FtpSession:
    def __init__(self, host, port, user, password, use_tls=True):
        self.creds = (host, port, user, password, use_tls)
        self.ftp = None
        self.known_dirs: set[str] = set()
        self.connect()

    def connect(self):
        host, port, user, password, use_tls = self.creds
        if self.ftp:
            try:
                self.ftp.quit()
            except Exception:
                pass
        if use_tls:
            try:
                ftp = ftplib.FTP_TLS()
                ftp.connect(host, port, timeout=45)
                ftp.login(user, password)
                ftp.prot_p()
                ftp.set_pasv(True)
                self.ftp = ftp
                print('[info] Połączono: FTPS (TLS, tryb pasywny).')
                return
            except Exception as e:
                print(f'[warn] FTPS nie działa ({e}); próbuję zwykły FTP…')
        ftp = ftplib.FTP()
        ftp.connect(host, port, timeout=45)
        ftp.login(user, password)
        ftp.set_pasv(True)
        self.ftp = ftp
        print('[warn] Połączono zwykłym FTP (bez szyfrowania).')

    def mkdir_p(self, remote_dir: str):
        parts = [p for p in remote_dir.split('/') if p not in ('', '.')]
        cur = '/'
        for part in parts:
            cur = posixpath.join(cur, part)
            if cur in self.known_dirs:
                continue
            try:
                self.ftp.mkd(cur)
            except ftplib.error_perm:
                pass  # katalog już istnieje (550) — OK
            self.known_dirs.add(cur)

    def stor(self, remote_path: str, data) -> int:
        """Wysyła plik z retry i reconnectem. data: bytes albo obiekt file-like."""
        payload = data if isinstance(data, bytes) else data.read()
        for attempt in (1, 2, 3):
            try:
                self.ftp.storbinary(f'STOR {remote_path}', io.BytesIO(payload),
                                    blocksize=65536)
                return len(payload)
            except (ftplib.all_errors, OSError, EOFError) as e:
                if attempt == 3:
                    raise
                print(f'[warn] STOR {remote_path}: {e} — ponawiam ({attempt}/3)…')
                time.sleep(1.5 * attempt)
                try:
                    self.connect()
                except Exception:
                    pass
        return len(payload)

    def delete_quiet(self, remote_path: str):
        try:
            self.ftp.delete(remote_path)
        except Exception:
            pass

    def close(self):
        try:
            self.ftp.quit()
        except Exception:
            pass


def main() -> int:
    ap = argparse.ArgumentParser(description='Deploy na MonsterASP.NET przez FTP/FTPS')
    ap.add_argument('--source', required=True, help='katalog aplikacji do wysłania')
    ap.add_argument('--env-file', default='.deploy.env', help='plik z danymi FTP_* / DB_*')
    ap.add_argument('--remote-root', default='/wwwroot', help='katalog docelowy (domyślnie /wwwroot)')
    ap.add_argument('--dry-run', action='store_true', help='tylko podgląd, bez łączenia')
    ap.add_argument('--no-tls', action='store_true', help='nie używaj TLS')
    ap.add_argument('--no-offline', action='store_true', help='bez app_offline.htm podczas transferu')
    ap.add_argument('--ignore', action='append', default=[], help='dodatkowe wpisy ignore (powtarzalne)')
    args = ap.parse_args()

    source = Path(args.source).resolve()
    if not source.is_dir():
        print(f'[błąd] Katalog źródłowy nie istnieje: {source}', file=sys.stderr)
        return 2

    env = load_env_file(args.env_file if args.env_file else None)
    ignores = DEFAULT_IGNORES | set(args.ignore)
    files = collect_files(source, ignores)
    total = sum(f.stat().st_size for f in files)

    print(f'[info] Źródło: {source}')
    print(f'[info] Plików do wysłania: {len(files)} ({total / 1024:.1f} KiB)')

    # Podgląd podmian tokenów (bez ujawniania wartości!)
    for f in files:
        if f.name in PATCH_FILES:
            try:
                patched, left = patch_content(f.read_text(encoding='utf-8-sig'), env)
                print(f'[info] {f.name}: tokeny podmienione, pozostałe: {left or "brak"}')
            except Exception as e:
                print(f'[warn] {f.name}: nie mogę przetworzyć ({e})')

    if args.dry_run:
        for f in files:
            rel = f.relative_to(source).as_posix()
            print(f'  DRY  {posixpath.join(args.remote_root, rel)}  ({f.stat().st_size} B)')
        print('[info] Dry-run zakończony — nic nie wysłano.')
        return 0

    missing = [k for k in ('FTP_HOST', 'FTP_USER', 'FTP_PASSWORD') if not env.get(k)]
    if missing:
        print(f'[błąd] Brakuje w {args.env_file}: {", ".join(missing)}', file=sys.stderr)
        return 2

    remote_root = args.remote_root.rstrip('/') or '/'
    session = FtpSession(
        env['FTP_HOST'], int(env.get('FTP_PORT', '21')),
        env['FTP_USER'], env['FTP_PASSWORD'],
        use_tls=not args.no_tls,
    )

    offline_path = posixpath.join(remote_root, 'app_offline.htm')
    sent_files = sent_bytes = 0
    started = time.time()
    try:
        if not args.no_offline:
            session.mkdir_p(remote_root)
            session.stor(offline_path, APP_OFFLINE_HTML.encode('utf-8'))
            print('[info] app_offline.htm wgrany (strona chwilowo offline — omija blokady IIS).')

        for f in files:
            rel = f.relative_to(source).as_posix()
            remote_path = posixpath.join(remote_root, rel)
            session.mkdir_p(posixpath.dirname(remote_path))

            if f.name in PATCH_FILES:
                patched, left = patch_content(f.read_text(encoding='utf-8-sig'), env)
                if left:
                    print(f'[warn] {f.name}: niepodmienione tokeny: {left} '
                          f'(uzupełnij .deploy.env albo edytuj plik na serwerze)')
                size = session.stor(remote_path, patched.encode('utf-8'))
            else:
                with open(f, 'rb') as fh:
                    size = session.stor(remote_path, fh)

            sent_files += 1
            sent_bytes += size
            print(f'  OK   {remote_path}  ({size} B)')
    finally:
        if not args.no_offline:
            session.delete_quiet(offline_path)
            print('[info] app_offline.htm usunięty (strona znów online).')
        session.close()

    dt = time.time() - started
    print(f'[ok] Wysłano {sent_files} plików ({sent_bytes / 1024:.1f} KiB) w {dt:.1f}s '
          f'→ {env["FTP_HOST"]}:{remote_root}')
    if env.get('SITE_URL'):
        print(f'[ok] Sprawdź: {env["SITE_URL"]}  oraz  {env["SITE_URL"].rstrip("/")}/api/health')
    return 0


if __name__ == '__main__':
    sys.exit(main())
