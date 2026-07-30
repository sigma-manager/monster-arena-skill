# MonsterASP.NET — zweryfikowane fakty (stan na 2026-07-23)

Źródła: https://www.monsterasp.net/ oraz https://help.monsterasp.net/ (linki przy każdej sekcji).

## Tożsamość platformy

- Hosting Windows: **Windows Server 2025 + IIS**, AMD EPYC + NVMe Gen4, HTTP/3, TLS 1.3.
- Panel administracyjny: **https://admin.monsterasp.net/**
- Dokumentacja: https://help.monsterasp.net/
- Lokalizacje: **EU (Niemcy)** i USA (Salt Lake City). Plan Free = tylko EU.

## Plan Free (najważniejsze dla darmowych projektów)

- **1× witryna**, 5 GB miejsca, **256 MB dedykowanego RAM**, **1× baza (1 GB)**
- Brak własnych domen — darmowe subdomeny **`*.runasp.net`** i **`*.tryasp.net`**
- Brak kont e-mail; karta płatnicza niewymagana
- Premium od $1.95/mc: własne domeny, 512 MB RAM, 2×2 GB bazy, USA+EU

## Obsługiwane stosy

- **.NET Core 10/9/8/7/6/5**, .NET Framework 4.x/3.x, Classic ASP
- Blazor, Razor, Web API, MVC, SignalR, gRPC, WebSockets, EF, WebForms
- **Node.js**, **Angular SPA/SSR**, **PHP 8.x/7.x**
- Bazy: **SQL Server 2025**, **MySQL/MariaDB**
- One-click apps: Oqtane, Umbraco, nopCommerce itd.
- HTTPS: Let's Encrypt jednym kliknięciem

## FTP/SFTP (wdrażanie)

Źródło: https://help.monsterasp.net/books/deploy/page/how-to-deploy-website-content-via-ftpsftp

- Dane: panel → `<witryna>` → **Deploy (FTP/WebDeploy/Git)**
- **Host: `siteXXXXX.siteasp.net`**, **użytkownik: `siteXXXXX`**, hasło z panelu, **port 21**
- Katalog docelowy: **`/wwwroot`** (root witryny)
- Zablokowane pliki (IIS trzyma DLL/pliki w użyciu): witryna **Stop/Restart** w panelu
  albo wgranie pliku **`app_offline.htm`** do roota na czas transferu.

## WebDeploy (najszybszy, tylko Windows)

Źródło: https://help.monsterasp.net/books/deploy/page/how-to-deploy-website-content-from-command-line

- Włącz **WebDeploy** w panelu dla witryny.
- URL publikacji: `https://siteXXXXX.siteasp.net:8172/msdeploy.axd?site=siteXXXXX`
- Użytkownik: `siteXXXXX`, hasło WebDeploy z panelu; `authtype="Basic"`, `-allowUntrusted`.
- Narzędzie: `msdeploy.exe` (C:\Program Files (x86)\IIS\Microsoft Web Deploy V3) — **brak w piaskownicy Linux**.
- Zaleta: synchronizacja „tylko zmienione pliki" — dobra dla aplikacji z dużą liczbą plików
  (Node.js z node_modules, Laravel itp.).

## ZIP przez File Manager (bez narzędzi)

Źródło: https://help.monsterasp.net/books/deploy/page/how-to-deploy-website-content-from-zip-file

- Panel → `<witryna>` → **Files** → **Upload file** (ZIP) → **Unzip** → cel `/wwwroot`.
- Przy nadpisywaniu działającej aplikacji zaznacz **Overwrite files in target path**
  i **Restart application pool before unzip** (omija blokady plików).

## Git / GitHub (continuous deployment)

- Książka: https://help.monsterasp.net/books/github — integracja GitHub z deployem z panelu.

## Node.js na tej platformie (KLUCZOWE dla skilla)

Źródło: https://help.monsterasp.net/books/nodejs/page/how-to-run-nodejs-application

- Hosting **bez linii poleceń**: nie uruchamiamy `npm`/`node` na serwerze.
- Node działa przez **`httpPlatformHandler`** (NIE iisnode) — wymagany `web.config` w `/wwwroot`:

```xml
<configuration>
  <system.webServer>
    <handlers>
      <add name="httpPlatformHandler" path="*" verb="*" modules="httpPlatformHandler" resourceType="Unspecified" />
    </handlers>
    <httpPlatform processPath="node" arguments=".\server.js" startupTimeLimit="20"
                  stdoutLogEnabled="false" stdoutLogFile=".\logs\node">
      <environmentVariables>
        <environmentVariable name="PORT" value="%HTTP_PLATFORM_PORT%" />
        <environmentVariable name="NODE_ENV" value="production" />
      </environmentVariables>
    </httpPlatform>
  </system.webServer>
</configuration>
```

- Aplikacja **MUSI nasłuchiwać na `process.env.PORT`** (port/named pipe nadawany dynamicznie):
  `app.listen(process.env.PORT || 3000)`
- **`node_modules` trzeba zainstalować lokalnie (`npm install`) i wgrać razem z aplikacją.**
- Zmienne środowiskowe produkcyjne ustawia się w sekcji `<environmentVariables>` w `web.config`.

### Logi Node.js (debugowanie)

Źródło: https://help.monsterasp.net/books/nodejs/page/nodejs-debug-logging

- Panel → Detailed Settings witryny → **Logs** → sekcja **HttpPlatform logs** → włącz **Debug logs** → zapisz → restart AppPool.
- Logi lądują w **`/wwwroot/logs/node`**; podgląd przez **WebFTP** (Files → WebFTP → Edit).
- **Po diagnozie wyłącz** debug (koszt wydajności/dysku).
- Dodatkowo ogólne **Logs** (Application & Access logs) w panelu: CPU/RAM/dysk/requests na żywo.

## Bazy danych

Źródła: książka https://help.monsterasp.net/books/databases + strony Create database / Remote Access / SSMS.

- Tworzenie: panel → **Databases** → **Add database** → wybór Free/Premium → typ **MySQL** albo **MSSQL** → kreator.
  (Baza nie wymaga istnienia witryny; nazwy typu `dbXXXXX`.)
- **Remote Access jest domyślnie WYŁĄCZONY.** Włączenie: szczegóły bazy → **Users and remote** → **Enabled**.
  Tamże pokazane są **Server / Login / Hasło** do połączeń zewnętrznych (SSMS, klient MySQL, skrypty z piaskownicy).
- MSSQL: zdalnie przez **SQL Server Management Studio**; jest też artykuł o **SSL/TLS do MSSQL**
  (https://help.monsterasp.net/books/databases/page/secure-connection-ssltls-to-mssql).
- Backup/Restore: z panelu (klik); automatyczne **dzienne backupy**; eksport lokalnej bazy do `.BAK` (artykuł w docs).
- Zarządzanie z poziomu panelu + web interface; Power BI — osobny artykuł.

## Piaskownica (środowisko, w którym działa agent)

Dostępne: **Node.js v20** (npm z dostępem do registry), **Python 3.13** (ftplib+ssl, sqlite3),
`curl`, `git`, `zip/unzip`. Brak: `dotnet`, `php`, lokalny serwer MySQL/MariaDB, `msdeploy` (Windows-only).
→ Stąd domyślny stos skilla: **Node.js + MySQL + deploy FTP**, a baza dev = zdalna baza MonsterASP z włączonym Remote Access.
