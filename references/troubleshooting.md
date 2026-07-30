# Troubleshooting — aplikacje na MonsterASP.NET

Kolejność diagnozy: (1) co zwraca przeglądarka/curl, (2) logi w panelu, (3) logi Node na FTP, (4) baza.

## Narzędzia diagnostyczne

- **Panel → Logs**: application + access logs, wykresy CPU/RAM/dysk/requesty na żywo.
- **Logi Node (HttpPlatform)**: panel → Detailed Settings → **Logs** → **HttpPlatform logs** → **Debug logs: ON** → zapisz → **restart AppPool**.
  Pliki pojawiają się w **`/wwwroot/logs/node/`** (podgląd: Files → **WebFTP** → Edit). **Po diagnozie wyłącz debug.**
- Lokalnie: `scripts/smoke_test.sh <URL>` i `node scripts/db_exec.js --env-file .deploy.env --query "SELECT 1"`.

## Najczęstsze objawy → przyczyny → rozwiązania

### 500.19 / „The requested page cannot be accessed because the related configuration data is invalid"
- **Przyczyna:** uszkodzony/`BOM`-owy `web.config` albo **niepodmienione placeholdery** (`__DB_HOST__`).
- **Fix:** waliduj XML; deploy przez `deploy_ftp.py` (podmienia placeholdery); upewnij się, że plik zapisany UTF-8 bez BOM.

### 502/503 lub długi timeout po starcie (Node)
- **Przyczyna A:** aplikacja nie nasłuchuje na `process.env.PORT` (sztywny port 3000).
  Fix: `app.listen(process.env.PORT || 3000)`.
- **Przyczyna B:** wyjątek przy starcie (brak modułu, literówka).
  Fix: włącz HttpPlatform Debug logs → patrz `/wwwroot/logs/node/` → napraw → **wyłącz debug**.
- **Przyczyna C:** `startupTimeLimit="20"` przekroczony (ciężki start). Odchudź start (lazy-init), restart witryny w panelu.

### `Cannot find module '...'` w logach Node
- Brak `node_modules` na serwerze. `npm install` **lokalnie** i wgraj cały katalog `node_modules`
  (deploy_ftp.py nie pomija go). Przy dużych zależnościach: WebDeploy (smart sync) albo ZIP.

### Pliki „locked" przy nadpisywaniu przez FTP (550 / permission denied)
- IIS trzyma pliki w użyciu. Skrypt robi to automatycznie (`app_offline.htm`); ręcznie:
  wgraj `app_offline.htm` → transfer → usuń go; albo panel → Websites → **Stop** → transfer → **Start**.
- Przy ZIP: opcja **Restart application pool before unzip**.

### Aplikacja działa, ale `/api/*` zwraca 503 / puste dane (baza)
- 503 z szablonu = baza nieskonfigurowana lub niedostępna:
  - produkcja: sprawdź wartości `<environmentVariable name="DB_*">` w `web.config` na serwerze (czy placeholdery podmienione?),
  - dev z piaskownicy: czy **Remote Access = Enabled**? host/port/login/hasło z panelu?
- Test ręczny: `node scripts/db_exec.js --env-file .deploy.env --query "SELECT 1"`.

### Node/mysql2: `ENOTFOUND`, `ETIMEDOUT`, `ECONNREFUSED` (z piaskownicy)
- Zły `DB_HOST`/`DB_PORT` albo **Remote Access wyłączony**. Włącz w panelu i skopiuj **dokładnie** Server z sekcji „Users and remote".

### Node/mysql2: błąd SSL (`HANDSHAKE`, `unable to verify the first certificate`)
- Ustaw `DB_SSL=1` (szablon użyje `ssl: { rejectUnauthorized: false }`) albo `DB_SSL=0`/usuń — zależnie od wymagań serwera.

### MSSQL: `certificate verify failed` / login failed z SSMS
- Użyj parametrów: `Encrypt=True;TrustServerCertificate=True;` (artykuł SSL/TLS w docs); sprawdź, czy Remote Access ON i hasło bez błędów.

### Zmiany „nie wchodzą" po deployu
- Node: proces restartuje się po zmianie plików, ale przy hangu: panel → Websites → **Restart**.
- Przeglądarka: cache — sprawdź `curl -sI` nagłówki / inkaognito.
- Upewnij się, że deploy poszedł do właściwego `/wwwroot` właściwej witryny.

### Subdomena nie odpowiada (DNS)
- Sprawdź status witryny w panelu (Started), poprawność adresu `*.runasp.net` / `*.tryasp.net`, poczekaj na propagację.

### Wolne działanie / restarty na planie Free
- Limit **256 MB RAM**: unikaj ciężkich bundlerów i SSR na serwerze — build frontendu rób lokalnie, wgrywaj statyki.
- `connectionLimit` puli DB trzymaj niski (4 w szablonie). Nie trzymaj globalnych cache'ów w pamięci.

### FTP: timeout / problem z trybem pasywnym / certyfikat
- Domyślnie FTPS + passive na porcie 21. Jak FTPS odmawia: `--no-tls`.
- Sprawdź, czy login to dokładnie `siteXXXXX` (nie e-mail do panelu!) i hasło z sekcji Deploy (inne niż do panelu).

### PHP: biała strona / 500
- Włącz logi w panelu; wersja PHP i ustawienia: panel → sekcja PHP (książka PHP w docs). `display_errors` tymczasowo On.
