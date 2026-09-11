# ioBroker FileSync

FileSync ist ein ioBroker-Daemon für sichere Synchronisation zwischen lokalen Verzeichnissen, SMB2/3 und SFTP. Die Verwaltung ist eine **eigenständige, vom Adapter bereitgestellte Webanwendung** und benötigt weder einen Admin-iframe noch `sendTo`, Admin Socket oder Materialize.

## Installation und erster realer Test

Voraussetzung ist Node.js 22 (Beta-Baseline), js-controller >= 7.2 und Admin >= 7.9. Installation über **Admin → Adapter → Aus eigener URL installieren** mit `https://github.com/DerHausmeisterKrause/iobroker.filesync` und Branch `main`, danach eine Instanz anlegen.

1. In den Adaptereinstellungen Webserver aktivieren, Port `8095`, Protokoll HTTP und Bind-Adresse `0.0.0.0` wählen.
2. Eine aktive Gruppe `Test` mit stabiler ID anlegen.
3. Benutzer `marcel`, ein mindestens acht Zeichen langes neues Passwort, Gruppe `Test`, aktiv und **Web-Admin** anlegen. Ohne aktiven Web-Admin mit Passwort startet der Webserver absichtlich nicht.
4. Speichern und die Instanz neu starten. Das eingegebene Klartextpasswort wird unmittelbar mit Node.js `scrypt` und zufälligem Salt gehasht; nur Salt, Hash, Algorithmus und Parameter bleiben gespeichert.
5. Auf dem ioBroker-Host Testdaten vorbereiten:

   ```sh
   mkdir -p /tmp/filesync-source /tmp/filesync-target
   echo "Hello FileSync" > /tmp/filesync-source/test.txt
   ```

6. `http://IOBROKER-IP:8095` in einem neuen Browser-Tab öffnen und anmelden.
7. Unter **Datenorte** zwei lokale Datenorte für `/tmp/filesync-source` und `/tmp/filesync-target` mit Gruppe `Test` erstellen.
8. Unter **Jobs** einen manuellen, inkrementellen Job mit denselben Gruppen anlegen. Erst **Preview** ausführen: das Ziel bleibt leer. Danach **Run** ausführen und `cat /tmp/filesync-target/test.txt` prüfen.

> HTTP überträgt Anmeldedaten unverschlüsselt und ist nur für ein vertrauenswürdiges LAN empfohlen. Für HTTPS eine ioBroker Certificate Collection auswählen; private Schlüssel werden nicht in FileSync-Konfigurationsfelder kopiert.

## Standalone API und Sicherheit

Die Web-App verwendet ausschließlich same-origin `fetch('/api/...')`. Verfügbar sind Login/Logout/Current User, CRUD und Test/Browse für Locations, CRUD/Preview/Run für Jobs, Run-History/-Details sowie Diagnose. API-Fehler haben ein einheitliches `{ok:false,error:{code,message}}`-Format.

Sessions werden nur serverseitig gehalten und gehen bei einem Adapter-Neustart verloren. Das Cookie enthält ausschließlich eine kryptografisch zufällige ID und ist `HttpOnly`, `SameSite=Strict`, `Path=/`, zeitlich begrenzt sowie bei HTTPS `Secure`. Schreibzugriffe benötigen zusätzlich das zur Session gehörende CSRF-Token und eine passende Origin. Login-Fehler verraten nicht, ob ein Benutzer existiert; zeitlich begrenztes Rate Limiting gilt pro IP/Benutzername.

Web-Admins sehen alle Ressourcen. Normale Benutzer sehen eine Location, einen Job oder Run nur bei einer Gruppenschnittmenge. Diese Regeln werden vor Providerzugriffen und Jobstarts serverseitig geprüft. Gruppenlose migrierte Ressourcen sind dadurch ausschließlich für Web-Admins sichtbar. Neue Jobs normaler Benutzer müssen sichtbare Source-/Target-Locations verwenden und mit beiden mindestens eine Gruppe teilen. Provider-Secrets werden nie von der API ausgegeben.

## Konfiguration und Daten

Die ioBroker-`native`-Konfiguration enthält die statische Adapterkonfiguration: Webserver- und TLS-Einstellungen, Gruppen, Web-Benutzer sowie allgemeine Runtime-Einstellungen. Locations und Jobs werden dagegen atomar in `runtime-config.json` im offiziellen Instance-Data-Verzeichnis gespeichert. Normale CRUD-Aktionen ändern deshalb nicht `native` und starten weder Adapter noch Webserver neu.

SMB-/SFTP-Secrets liegen getrennt in `credentials.enc`. Der Inhalt wird mit der vom js-controller bereitgestellten System-Secret-Implementierung des Adapters verschlüsselt; `runtime-config.json` enthält ausschließlich die `credentialId`. Beim ersten Start nach einem Update werden bestehende `native.locations`, `native.jobs` und `native.credentialVault` einmalig und unter Erhalt aller IDs übernommen. Die bestehenden History- und Index-Stores bleiben für Runs beziehungsweise Sync-Snapshots verantwortlich.

`configVersion: 2` ergänzt `web`, `webGroups`, `webUsers` und `groupIds` an Locations/Jobs. Der bestehende `SyncEngine`-/Provider-/RunManager-/Snapshot-Core bleibt erhalten.

Runtime-States: `info.connection`, `info.webServerRunning`, `info.webServerPort`, `info.webServerSecure`, `info.webServerUrl`, Job-/Queue-Zähler und bestehende Job-States. Keine Credentials werden in States geschrieben.

## Entwicklung

```sh
npm ci
npm run typecheck
npm test
npm run build:web
npm run build
npm run test:package
```

`npm run build` baut Backend und das nach `web-dist/` ausgelieferte Frontend; das npm-Paket enthält beide. Die CI prüft Node 20/22/24, wobei Node 22 die Integrations-Baseline ist.

## Sicherheitsgrenzen

Lokale Pfad- und Symlink-Confinement, Streaming, Filter, Retry, Transfer-Limits, Dry-Run, atomare Snapshots und Run-History werden weiterverwendet. Mirror und Move sollten zunächst ausschließlich mit Testdaten und Preview geprüft werden. Das Legacy-Message-API kann intern vorerst bestehen, ist aber keine UI-Abhängigkeit.

## Lizenz

MIT. Siehe [LICENSE](LICENSE).
