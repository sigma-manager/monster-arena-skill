---
name: monsterasp-webapp
description: Tworzy aplikacje webowe z bazą danych (domyślnie Node.js + MySQL/MariaDB, alternatywnie PHP lub ASP.NET Core + MSSQL) i wdraża je na hosting MonsterASP.NET (FTP/FTPS, WebDeploy, ZIP, Git). Używaj, gdy użytkownik prosi o zbudowanie aplikacji webowej z bazą danych i uruchomienie jej na hostingu monsterasp.net.
---

# Skill: Aplikacje webowe z bazą danych na MonsterASP.NET

Prowadzi przez pełny cykl: **projekt → test lokalny w piaskownicy → deploy na MonsterASP.NET → weryfikacja**.
Wszystkie fakty o platformie (hosty, porty, limity) są zweryfikowane z dokumentacji — patrz `references/monsterasp-facts.md` (stan na 2026-07-23).

## Domyślny stos (dopasowany do możliwości piaskownicy)

| Warstwa | Wybór | Dlaczego |
|---|---|---|
| Backend | **Node.js 20** (czysty `node:http`) | dostępny w piaskownicy; MonsterASP uruchamia Node przez IIS `httpPlatformHandler` **bez build-stepu** |
| Baza danych | **MySQL/MariaDB** (pakiet `mysql2`) | darmowa baza 1 GB w planie Free; opcja Remote Access pozwala łączyć się z bazą prosto z piaskownicy (dev + migracje) |
| Deploy | **FTP/FTPS** (`scripts/deploy_ftp.py`) | działa z linii poleceń wszędzie; WebDeploy/msdeploy to narzędzie tylko-Windows |

## Macierz technologii: piaskownica vs MonsterASP.NET

| Technologia | W piaskownicy | Na MonsterASP.NET | Konsekwencja |
|---|---|---|---|
| Node.js 20 + npm | ✅ działa | ✅ obsługiwany | **stos domyślny** — pełny test lokalny przed deployem |
| Python 3.13 | ✅ działa | ✖ brak wsparcia | tylko skrypty pomocnicze (deploy, narzędzia) |
| PHP 8.x | ✖ brak interpretera | ✅ obsługiwany | kod pisany „na sucho", test dopiero na serwerze |
| ASP.NET Core (do .NET 10) | ✖ brak SDK | ✅ flagowy stos | wymaga SDK/Visual Studio na maszynie użytkownika → `references/deploy-methods.md` |
| MySQL/MariaDB | klient przez npm (`mysql2`) | ✅ 1×1 GB w Free | Remote Access włącza dev z piaskownicy |
| MSSQL 2025 | ✖ brak klienta | ✅ 1×1 GB w Free | zarządzanie przez SSMS/panel → `references/database.md` |

## Zanim zaczniesz — dane do zebrania (jednorazowo, panel użytkownika)

Z panelu https://admin.monsterasp.net potrzebujesz:

1. **Witryna** — Websites → utwórz witrynę (plan Free: subdomena `*.runasp.net` / `*.tryasp.net`, tylko EU). Zanotuj ID `siteXXXXX` i publiczny URL.
2. **Dane FTP** — Websites → `<witryna>` → **Deploy (FTP/WebDeploy/Git)**: host `siteXXXXX.siteasp.net`, użytkownik `siteXXXXX`, hasło, port 21, katalog docelowy `/wwwroot`.
3. **Baza** — Databases → **Add database** → Free → **MySQL**. Zanotuj nazwę (typu `dbXXXXX`).
4. **Remote Access bazy** — szczegóły bazy → **Users and remote** → **Enabled**; skopiuj **Server / Login / Hasło / Port**.

Wszystko zapisz w `<projekt>/.deploy.env` według wzoru `assets/node-mysql-app/.deploy.env.example`.
**Nigdy nie commituj** `.deploy.env` (jest w `.gitignore` szablonu). Jeśli użytkownik jeszcze nie podał danych — zbuduj i przetestuj aplikację lokalnie (działa też bez bazy, z degradacją API), a deploy wykonaj jako ostatni krok po uzyskaniu danych.

## Szybki start (happy path)

Poniżej `SKILL_DIR=skills/monsterasp-webapp` (dostosuj, jeśli skill jest gdzie indziej):

```bash
# 1) Scaffold szablonu CRUD
cp -r $SKILL_DIR/assets/node-mysql-app moja-aplikacja && cd moja-aplikacja
npm install                      # instaluje tylko mysql2

# 2) Schemat bazy (wymaga włączonego Remote Access)
node $SKILL_DIR/scripts/db_exec.js --env-file .deploy.env sql/001_schema.sql

# 3) Test lokalny (aplikacja użyje zdalnej bazy MonsterASP albo zadziała w trybie bez bazy)
cp .env.example .env             # wypełnij DB_* wartościami z panelu
npm start &
$SKILL_DIR/scripts/smoke_test.sh http://localhost:3000

# 4) Deploy: FTPS → /wwwroot, z app_offline.htm na czas transferu i podmianą __DB_*__ w web.config
python3 $SKILL_DIR/scripts/deploy_ftp.py --source . --env-file .deploy.env

# 5) Weryfikacja produkcji
$SKILL_DIR/scripts/smoke_test.sh https://twoja-nazwa.runasp.net
```

## Workflow pełny

1. **Wymagania**: temat aplikacji, model danych (pola, relacje), lista akcji CRUD, czy potrzebne logowanie/uploady.
2. **Scaffold** z `assets/node-mysql-app`; dopasuj: tabelę w `db.js` (`ensureSchema`) i `sql/001_schema.sql`, endpointy w `server.js`, UI w `public/`.
3. **Schemat/seed bazy** przez `scripts/db_exec.js`. (Aplikacja sama wykonuje idempotentne `CREATE TABLE IF NOT EXISTS` przy starcie — pliki SQL są dla złożonych schematów i danych startowych.)
4. **Test lokalny**: `/api/health` musi zwracać `{"ok":true,"db":"ok"}` (przy skonfigurowanej bazie).
5. **Deploy** przez `deploy_ftp.py`. Duży `node_modules`? Rozważ ZIP przez File Manager albo WebDeploy na Windows — `references/deploy-methods.md`.
6. **Restart zwykle niepotrzebny** (zmiana plików restartuje proces Node). Przy dziwnych objawach: panel → Websites → `<witryna>` → Restart.
7. **Smoke test produkcji** + krótki raport dla użytkownika (URL, wynik `/api/health`).
8. **Coś nie działa?** → `references/troubleshooting.md` (logi Node, błędy 5xx, blokady plików, DB, SSL).

## Zasady bezpieczeństwa

- Hasła wyłącznie w `.deploy.env` / `.env` (oba git-ignorowane). W repozytorium (w tym w `web.config`) trzymaj placeholdery `__DB_*__` — skrypt deployu podstawi wartości przy wysyłce.
- Skrypty nigdy nie wypisują haseł w logach.
- Po zakończeniu dev można wyłączyć Remote Access bazy (aplikacja na serwerze łączy się po sieci wewnętrznej).
- Jeśli serwer bazy wymaga TLS, ustaw `DB_SSL=1`.

## Zawartość skilla

```
monsterasp-webapp/
├── SKILL.md                        ← ten plik
├── scripts/
│   ├── deploy_ftp.py               ← upload FTP/FTPS: retry, ignore-list, app_offline.htm, podmiana __DB_*__
│   ├── db_exec.js                  ← wykonywanie plików SQL / zapytań na zdalnym MySQL/MariaDB
│   └── smoke_test.sh               ← curl-checki strony głównej i /api/health
├── assets/
│   └── node-mysql-app/             ← gotowy szablon CRUD (notatki): Node + MySQL + web.config pod MonsterASP
└── references/
    ├── monsterasp-facts.md         ← zweryfikowane fakty o platformie (hosty, porty, limity, linki do docs)
    ├── deploy-methods.md           ← FTP/SFTP vs WebDeploy vs ZIP vs Git; profile ASP.NET Core i PHP
    ├── database.md                 ← bazy: tworzenie, Remote Access, connection stringi, backup/restore
    └── troubleshooting.md          ← najczęstsze problemy i diagnoza
```
