# Metody wdrażania na MonsterASP.NET

Wszystkie deploye lądują w **`/wwwroot`** (root witryny). Dane dostępowe: panel → `<witryna>` → **Deploy (FTP/WebDeploy/Git)**.

## 1) FTP/FTPS — `scripts/deploy_ftp.py` (DOMYŚLNA w tym skillu)

Dlaczego: działa z piaskownicy (brak msdeploy/FileZilly), skryptowalna, bezpieczna (FTPS).

```bash
python3 scripts/deploy_ftp.py --source ./moja-aplikacja --env-file .deploy.env
# opcje:
#   --remote-root /wwwroot   (domyślne)
#   --dry-run                (tylko pokaże, co by wgrał; nie wymaga poświadczeń)
#   --no-tls                 (zwykły FTP, gdy FTPS odmawia)
#   --no-offline             (bez app_offline.htm na czas transferu)
#   --ignore WZOR            (dodatkowy wpis do ignore-listy; powtarzalny)
```

Zachowanie skryptu:
- najpierw próbuje **FTP_TLS** (port 21), przy błędzie robi fallback na zwykły FTP (z ostrzeżeniem),
- wgrywa **`app_offline.htm`**, potem pliki (z retry), na końcu usuwa `app_offline.htm` — omija blokady IIS,
- **podmienia placeholdery** `__DB_HOST__`, `__DB_PORT__`, `__DB_USER__`, `__DB_PASSWORD__`, `__DB_NAME__`
  w `web.config` wartościami z `.deploy.env` (hasła nie trafiają do repo, tylko na serwer),
- pomija domyślnie: `.git`, `.gitignore`, `.env`, `.deploy.env`, `.DS_Store`, `Thumbs.db` — **nie pomija `node_modules`** (Node na serwerze wymaga wgranych zależności),
- nadpisuje istniejące pliki; **nie usuwa** na serwerze plików skasowanych lokalnie (bezpieczny domyślny tryb).

Test zasięgu bez konta: `--dry-run`.

## 2) WebDeploy (msdeploy) — tylko Windows, najszybszy dla wielu plików

1. Panel → witryna → włącz **WebDeploy**.
2. Utwórz `webdeploy_to_monsterasp.bat` (wzorzec wg dokumentacji, uzupełnij `siteXXXXX` i hasło):

```bat
@echo off
setlocal
set SOURCE_PATH=C:\FULL_PATH\TO\YOUR\PROJECT\
set DEST_SITE=siteXXXXX
set DEST_URL=https://siteXXXXX.siteasp.net:8172/msdeploy.axd?site=siteXXXXX
set USERNAME=siteXXXXX
set PASSWORD=********

"C:\Program Files (x86)\IIS\Microsoft Web Deploy V3\msdeploy.exe" ^
 -verb:sync ^
 -source:contentPath="%SOURCE_PATH%" ^
 -dest:contentPath="%DEST_SITE%",computerName="%DEST_URL%",userName="%USERNAME%",password="%PASSWORD%",authtype="Basic",includeAcls="False" ^
 -allowUntrusted ^
 -disableLink:AppPoolExtension ^
 -disableLink:ContentExtension ^
 -disableLink:CertificateExtension ^
 -verbose
endlocal
```

Smart-sync przesyła tylko zmienione pliki (zalecane przy `node_modules` / Laravel / dużych projektach).

## 3) ZIP przez File Manager (bez narzędzi, dobre z piaskownicy przy problemach z FTP)

```bash
cd moja-aplikacja && zip -r ../deploy.zip . -x '.git/*' '.env' '.deploy.env'
```

Potem: panel → witryna → **Files** → **Upload file** (`deploy.zip`) → **Unzip** → cel `/wwwroot`.
Przy aktualizacji działającej aplikacji: **Overwrite files in target path** + **Restart application pool before unzip**.
Uwaga: placeholdery `__DB_*__` w `web.config` trzeba przed zipem podmienić ręcznie (np. `sed`) albo po deployu edytować przez WebFTP.

## 4) Git / GitHub (continuous deployment)

Panel → witryna → sekcja Deploy / Git. Opis integracji: https://help.monsterasp.net/books/github.
Przy CI z GitHub Actions i tak najprościej użyć tego skilla (FTP) albo WebDeploy.

---

## Profil: ASP.NET Core / ASP.NET Framework + MSSQL (gdy użytkownik ma Windows + .NET SDK)

- Budowanie: `dotnet publish -c Release -o publish` (VS też ma gotowy profil do MonsterASP — „Deploy directly from Visual Studio").
- Deploy wyniku: folder `publish/` wgraj `deploy_ftp.py` (działa, bo publish-output to zwykłe pliki) lub msdeploy.
- `web.config` generuje publish automatycznie (ASP.NET Core Module). Przy nadpisaniu DLL-i: `app_offline.htm`.
- Baza MSSQL: connection string w `appsettings.Production.json` / zmiennej `ConnectionStrings__Default`
  (format: patrz `references/database.md`). Migracje EF Core: `dotnet ef database update` z maszyny dev po włączeniu Remote Access.
- Szczegóły z dokumentacji: https://help.monsterasp.net/books/deploy (artykuły Visual Studio + MSSQL).

## Profil: PHP 8.x + MySQL (bez buildu, ale bez lokalnego testu w piaskownicy)

- Wgraj pliki `.php` do `/wwwroot` (np. przez `deploy_ftp.py`); brak `web.config` nie przeszkadza.
- Wersja/ustawienia PHP przełącza się w panelu (książka PHP: https://help.monsterasp.net/books/php).
- Laravel: o komponowaniu struktury i docroot decyduje artykuł „How to run Laravel application" w tej książce.
- Połączenie z bazą: `mysqli`/`PDO` z danymi z panelu (`references/database.md`).
- Test dopiero na serwerze — piaskownica nie ma interpretera PHP; minimalizuj ryzyko prostymi skryptami.

## Po deployu zawsze

1. `scripts/smoke_test.sh https://<subdomena>.runasp.net`
2. Sprawdź **Logs** w panelu (application/access + HttpPlatform dla Node).
3. Zgłoś użytkownikowi URL i wynik health-checka.
