# Bazy danych na MonsterASP.NET

Typy: **MySQL/MariaDB** albo **MSSQL (SQL Server 2025)**. Plan Free: **1 baza, 1 GB**.
Tworzenie bazy nie wymaga utworzonej witryny.

## 1. Utworzenie bazy (panel)

Panel https://admin.monsterasp.net → **Databases** → **Add database** → wybierz **Free** → typ **MySQL** lub **MSSQL** → kreator.
Baza dostaje nazwę typu `dbXXXXX`.

## 2. Remote Access (wymagany do dev z piaskownicy / SSMS / skryptów)

Domyślnie **WYŁĄCZONY**. Włączenie: **Databases → `<dbXXXXX>` → Users and remote → Enabled**.
Po włączeniu panel pokazuje poświadczenia zewnętrzne: **Server, Login, Hasło** (i port).
Zanotuj je do `.deploy.env`:

```
DB_HOST=<Server z panelu>      # np. host bazy podany w sekcji Remote Access
DB_PORT=3306                   # MySQL/MariaDB; MSSQL zwykle 1433
DB_USER=<Login>
DB_PASSWORD=<Hasło>
DB_NAME=dbXXXXX
# DB_SSL=1                     # jeśli serwer wymaga TLS
```

> Aplikacja działająca **na serwerze** MonsterASP łączy się z bazą bez Remote Access (sieć wewnętrzna) —
> Remote Access służy połączeniom z zewnątrz: z piaskownicy, SSMS, GUI MySQL itd.

## 3. Praca z bazą z piaskownicy

W piaskownicy nie ma klienta `mysql` — użyj skryptu skilla (Node + `mysql2`):

```bash
cd moja-aplikacja && npm install          # zainstaluje mysql2

# pliki SQL (multiple statements – cały plik naraz):
node ../skills/monsterasp-webapp/scripts/db_exec.js --env-file .deploy.env sql/001_schema.sql

# pojedyncze zapytanie / test połączenia:
node ../skills/monsterasp-webapp/scripts/db_exec.js --env-file .deploy.env --query "SELECT VERSION() AS v"
node ../skills/monsterasp-webapp/scripts/db_exec.js --env-file .deploy.env --query "SHOW TABLES"
```

Szablon (`assets/node-mysql-app`) dodatkowo robi idempotentne `CREATE TABLE IF NOT EXISTS` przy starcie
aplikacji — wystarczy do prostych CRUD-ów bez ręcznych migracji.

## 4. Connection stringi / konfiguracje

### Node.js (mysql2) — zmienne środowiskowe

Lokalnie: plik `.env` (czytany przez `server.js` szablonu).
Produkcja: sekcja `<environmentVariables>` w `web.config` (szablon ma placeholdery `__DB_*__`,
które `deploy_ftp.py` podmienia przy wysyłce).

### PHP (mysqli / PDO)

```php
$pdo = new PDO('mysql:host='.$_ENV['DB_HOST'].';port=3306;dbname='.$_ENV['DB_NAME'].';charset=utf8mb4',
               $_ENV['DB_USER'], $_ENV['DB_PASSWORD'],
               [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
```

Na współdzielonym PHP zmienne środowiskowe mogą być niedostępne — wtedy trzymaj konfigurację
w pliku poza `/wwwroot` albo w `config.php` zabronionym do odczytu (reguła w `web.config`).

### .NET (ADO.NET / EF Core)

```
# MySQL (MySqlConnector / Pomelo):
Server=<DB_HOST>;Port=3306;Database=dbXXXXX;Uid=<user>;Pwd=<pass>;

# MSSQL:
Server=<DB_HOST z panelu>;Database=dbXXXXX;User Id=<user>;Password=<pass>;Encrypt=True;TrustServerCertificate=True;
```

Dla MSSQL dostawca ma artykuł o SSL/TLS (secure-connection-ssltls-to-mssql) — przy problemach z certyfikatem
użyj `TrustServerCertificate=True` jak wyżej. Dokładne przykłady connection stringów pokazuje też panel
(sekcja bazy).

## 5. Backup / Restore / eksport

- Panel → Databases → `<baza>` → **Backup** / **Restore** (jednym kliknięciem).
- Automatyczne **dzienne backupy** (dostępne do przywrócenia z panelu; Premium: też FTP z backupami baz).
- Lokalna baza → chmura: eksport do `.BAK` (MSSQL) wg artykułu w docs; dla MySQL — import przez dump SQL
  (`db_exec.js` lub dowolny klient MySQL po włączeniu Remote Access).

## 6. Limity i dobre prakty (plan Free)

- 1 GB / 1 baza: trzymaj porządek (indeksy tylko potrzebne, archiwizacja starych wierszy).
- 256 MB RAM witryny: Node z `connectionLimit: 4` (jak w szablonie) jest bezpieczny.
- `SELECT` bez `LIMIT` na dużych tabelach = zabójca pamięci — stronicuj wyniki.
- Po zakończeniu prac deweloperskich można **wyłączyć Remote Access** (mniejsza powierzchnia ataku).
