# node-mysql-app — szablon CRUD dla MonsterASP.NET

Prosta, kompletna aplikacja „Notatki": **Node.js (bez frameworków) + MySQL/MariaDB**,
gotowa do wdrożenia na MonsterASP.NET przez `/wwwroot` + `web.config` (httpPlatformHandler).

## Struktura

```
server.js     — serwer HTTP: API JSON + serwowanie statyków (ochrona path traversal, limit body)
db.js         — warstwa MySQL (mysql2): pula połączeń, leniwa konfiguracja, idempotentny schemat
public/       — frontend (index.html + app.js), zero bundlera
web.config    — konfiguracja IIS/httpPlatformHandler + zmienne DB_* (placeholdery __DB_*__)
sql/          — pliki SQL do uruchomienia skryptem db_exec.js ze skilla
```

## API

| Metoda | Ścieżka | Opis |
|---|---|---|
| GET | `/api/health` | stan aplikacji i bazy (`{"ok":true,"db":"ok"}`) |
| GET | `/api/items` | lista notatek (max 200) |
| POST | `/api/items` | dodaj (`{"name":"…"}` 1–200 znaków) → 201 |
| PUT | `/api/items/:id` | oznacz wykonane (`{"done":true|false}`) |
| DELETE | `/api/items/:id` | usuń |

Baza nieskonfigurowana → API zwraca **503** z podpowiedzią, a strona działa dalej (baner ostrzegawczy).

## Lokalny start

```bash
npm install
cp .env.example .env   # uzupełnij DB_* (opcjonalnie — bez bazy też wstanie)
npm start              # http://localhost:3000
```

## Deploy na MonsterASP.NET

Szczegóły: `../../SKILL.md` i `../../references/deploy-methods.md`. W skrócie:

```bash
cp .deploy.env.example .deploy.env   # uzupełnij dane FTP_* i DB_* z panelu
python3 ../../scripts/deploy_ftp.py --source . --env-file .deploy.env
```

Skrypt podmieni `__DB_*__` w `web.config`, wgra wszystko na FTPS do `/wwwroot`
(z `app_offline.htm` na czas transferu) i poda link do sprawdzenia.
