# ioBroker FileSync

<img src="admin/filesync.png" alt="FileSync" width="96" height="96">

## Installation

**Über ioBroker Admin:** Adapter → Aus eigener URL installieren → folgende URL eintragen:

```text
https://github.com/DerHausmeisterKrause/iobroker.filesync
```

**Alternativ über die Konsole auf dem ioBroker-Host:**

```bash
iobroker url https://github.com/DerHausmeisterKrause/iobroker.filesync --debug
```

Falls noch keine Instanz existiert, einmalig `iobroker add filesync` ausführen oder die Instanz im Admin anlegen.

Voraussetzungen: Node.js 22 (empfohlene Beta-Baseline; package.json erlaubt >= 20), js-controller >= 7.2 und Admin >= 7.9.

**Ersteinrichtung:** In den Instanzeinstellungen einen aktiven Web-Administrator mit Passwort anlegen, Webserver aktivieren und speichern. Danach `http://IOBROKER-IP:8095` im Browser öffnen. HTTP nur in einem vertrauenswürdigen LAN verwenden, andernfalls HTTPS konfigurieren.

## Update einer vorhandenen Instanz

Vorher Konfiguration und Instance-Data-Verzeichnis sichern. Keine neue Instanz anlegen.

```bash
cd /opt/iobroker
iobroker stop filesync.0 &&
iobroker url https://github.com/DerHausmeisterKrause/iobroker.filesync --debug &&
iobroker upload filesync &&
iobroker start filesync.0
```

Falls ein älterer Stand wiederverwendet wird, die URL durch `https://github.com/DerHausmeisterKrause/iobroker.filesync/tarball/COMMIT` ersetzen (COMMIT = vollständiger gewünschter Merge-Commit). Nach dem Update die Weboberfläche mit Strg+F5 neu laden. Die installierte Version lässt sich mit `node -p 'require("/opt/iobroker/node_modules/iobroker.filesync/package.json").version'` prüfen. Bei einem fehlgeschlagenen Update den Installationsfehler beheben, bevor die Instanz wieder gestartet wird.

## Was ist FileSync?

FileSync ist ein ioBroker-Daemon für sichere Synchronisation zwischen lokalen Verzeichnissen, SMB2/3 und SFTP. Die Verwaltung ist eine **eigenständige, vom Adapter bereitgestellte Webanwendung** und benötigt weder einen Admin-iframe noch `sendTo`, Admin Socket oder Materialize.

## Ersteinrichtung und Funktionstest

1. In den Adaptereinstellungen Webserver aktivieren, Port `8095`, Protokoll HTTP und Bind-Adresse `0.0.0.0` wählen.
2. Eine aktive Gruppe `Test` mit stabiler ID anlegen.
3. Einen eigenen Benutzer, ein mindestens acht Zeichen langes neues Passwort, Gruppe `Test`, aktiv und **Web-Admin** anlegen. Ohne aktiven Web-Admin mit Passwort startet der Webserver absichtlich nicht.
4. Speichern und die Instanz neu starten. Das eingegebene Klartextpasswort wird unmittelbar mit Node.js `scrypt` und zufälligem Salt gehasht; nur Salt, Hash, Algorithmus und Parameter bleiben gespeichert.
5. Auf dem ioBroker-Host Testdaten vorbereiten:

   ```sh
   sudo -u iobroker mkdir -p /tmp/filesync-source /tmp/filesync-target
   sudo -u iobroker sh -c 'echo "Hello FileSync" > /tmp/filesync-source/test.txt'
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

## Update prüfen

Auf dem Host der vorhandenen Instanz installieren (Standardpfad: /opt/iobroker). Ein konkreter GitHub-Commit vermeidet die Wiederverwendung eines unveränderten Branch-Installationsziels. Vorher die Instanz und ihr Datenverzeichnis sichern; nicht löschen oder neu anlegen.

```sh
cd /opt/iobroker
iobroker stop filesync.0
iobroker url https://github.com/DerHausmeisterKrause/iobroker.filesync/tarball/COMMIT --debug
iobroker upload filesync
iobroker start filesync.0
node -p 'require("./node_modules/iobroker.filesync/package.json").version'
grep -m1 frontendVersion node_modules/iobroker.filesync/web-dist/app.js
```

`COMMIT` durch den gewünschten vollständigen Merge-Commit ersetzen. Im Browser nach einem Reload müssen Frontend- und Backend-Version übereinstimmen. Die Run-Übersicht zeigt ab 0.1.2 Filter und farbige Statuszeilen. Bei einem Neustart werden unterbrochene Runs als abgebrochen markiert; sie werden nicht automatisch erneut gestartet. Ein manueller Neustart verwendet die aktuelle Job-Konfiguration.

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

## Persönliche E-Mail-Benachrichtigungen

1. Den ioBroker-Adapter `email` installieren und SMTP, Absender und Zugangsdaten dort konfigurieren.
2. In den FileSync-Instanzeinstellungen im Reiter **Benachrichtigungen** die gewünschte E-Mail-Instanz (z. B. `email.0`) auswählen und den Versand aktivieren. Standardmäßig ist der Versand deaktiviert.
3. Jeder angemeldete Benutzer kann unter **Benachrichtigungen** seine eigene E-Mail-Adresse, Ereignisse (Fehler, Erfolg, Wiederherstellung), sichtbare Jobs und eine Sperrzeit einstellen. Die Einstellungen werden im Instanzdatenverzeichnis gespeichert.

Nur berechtigte Benutzer erhalten Meldungen zu freigegebenen Jobs. E-Mails enthalten Status, Jobname, Run-ID und Zeit, keine Dateipfade, Inhalte oder Zugangsdaten. Vorschauen versenden keine E-Mails. Pro Benutzer sind höchstens zehn Versandversuche pro Stunde und je Job/Ereignis die eingestellte Sperrzeit vorgesehen; die Sperrzeit je Job/Ereignis wird beim Adapter-Neustart zurückgesetzt. Die eingetragene E-Mail-Adresse wird syntaktisch geprüft, aber nicht durch einen Bestätigungslink verifiziert. Daher nur für vertrauenswürdige Benutzer aktivieren. Fehlgeschlagene Versandversuche werden protokolliert und nicht automatisch wiederholt.

### Testmail und Versandhistorie

Seit 0.2.6 kann jeder Benutzer eine Testmail an seine gespeicherte Adresse anfordern und die letzten 100 eigenen Versandversuche einsehen. Status „Übergeben“ bedeutet, dass die E-Mail-Schnittstelle den Auftrag angenommen hat, nicht dass die Nachricht zugestellt wurde. Die Historie sowie das Limit von zehn Versuchen pro Stunde und der fünfminütige Testmail-Abstand überstehen Neustarts. Der separate Job/Ereignis-Cooldown bleibt im Arbeitsspeicher. Eine Warnmeldung kann bei gekürzten Dateiaktionsdetails eines erfolgreichen Runs angefordert werden; Wiederherstellungsmeldungen haben Vorrang.

Tagesberichte werden ab 08:00 Uhr Serverzeit für den Vortag, Wochenberichte ab Montag 08:00 Uhr für die vorherige Kalenderwoche erzeugt. Ein Bericht kann im laufenden Zeitraum nachgeholt werden, ältere Zeiträume werden nicht rückwirkend versendet. Die Berichte berücksichtigen maximal 500 gespeicherte Runs, aktuelle Jobberechtigungen und die persönliche Jobauswahl; Dry Runs sind ausgeschlossen. Berichte werden je Zeitraum höchstens einmal versucht, auch nach einem Neustart. E-Mail-Adressbesitz und tatsächliche Zustellung werden nicht verifiziert. Fehlgeschlagene Mailversuche werden nicht automatisch wiederholt.

## Zugriffsprüfung

Der Button **Verbindung testen** prüft ab 0.2.4 den Basisordner. Bei beschreibbaren Datenorten wird eine eigene temporäre Datei geschrieben, zurückgelesen, umbenannt und gelöscht. Die Ergebnisse werden je Schritt angezeigt. Bei einem als nur lesbar konfigurierten Datenort wird lediglich das Auflisten des Ordners geprüft. Der Test garantiert keine Rechte in Unterordnern oder auf bestehende Dateien. Kann eine Testdatei nicht entfernt werden, wird dies ausdrücklich gemeldet. Hintergrund-Healthchecks bleiben unverändert und führen keinen Schreibtest aus.

## Sofortige Synchronisation

Seit 0.2.3 werden vorhandene Dateien ohne vorherige Stabilitätswartezeit verarbeitet, unabhängig von der alten Job-Einstellung. Dry Run bleibt schreibfrei. Änderungen während einer Übertragung werden weiterhin anhand der Dateimetadaten geprüft; Provider-Zugriffsfehler bleiben Fehler und werden nicht unterdrückt. Ein plattformübergreifender Nachweis, dass eine Datei von keinem anderen Programm geöffnet ist, ist nicht möglich.

## Natives SMB (ab 0.2.9)

FileSync verwendet `smb3-client` 0.2.0 für direkte SMB-Verbindungen ohne CIFS-Mount und ohne zusätzliche Systempakete. SMB 2.1 bis 3.1.1 und NTLMv2 werden durch die Bibliothek unterstützt. Signing ist verpflichtend; verschlüsselte Freigaben werden unterstützt, wenn vom Server verlangt. Es gibt keinen NTLMv1-Fallback und keinen OpenSSL-Legacy-Modus. Der SMB-Worker begrenzt einzelne Operationen durch das konfigurierte Timeout und isoliert Bibliotheksfehler vom Adapter.

Ab 0.2.10 genügt im Datenort **SMB** ein Netzwerkpfad wie `\\server\Daten$\Backup` oder `10.10.22.34\testshare`. Der Host, Freigabename und optionale Unterordner werden automatisch getrennt; die Freigabewurzel ist ebenfalls zulässig. Als Benutzername entweder `DOMÄNE\Benutzer` oder den einfachen Benutzernamen und das Passwort angeben. Port (Standard 445), Timeout und Beschreibung stehen unter **Erweiterte Einstellungen**. Beim Bearbeiten werden bestehende SMB-Datenorte automatisch im neuen Format angezeigt; das gespeicherte Passwort bleibt erhalten, wenn das Passwortfeld leer bleibt. Die Datenortliste zeigt den vollständigen Netzwerkpfad. Der Server muss NTLMv2 erlauben; Kerberos-only, DFS-Weiterleitungen und SMB1 sind nicht unterstützt. Für Firmenserver wird eine separate Testfreigabe empfohlen.

Die neue Bibliothek befindet sich noch im Alpha-Stadium. Die Integration muss gegen echte Windows-/Samba-Server geprüft werden. Ein automatisierter CI-Test mit einer signierten und verschlüsselten Samba-Freigabe ist vorhanden. Vor produktiven Mirror-/Move-Jobs zuerst eine kleine und eine große Datei in beide Richtungen auf einer Testfreigabe übertragen und Prüfsummen vergleichen. Erkennbare Reparse-Points werden abgelehnt; vollständige Absicherung gegen serverseitig aufgelöste Verknüpfungen ist nicht garantiert. Keine untrusted SMB-Server anbinden.

## Sicherheitsgrenzen

Lokale Pfad- und Symlink-Confinement, Streaming, Filter, Retry, Transfer-Limits, Dry-Run, atomare Snapshots und Run-History werden weiterverwendet. Mirror und Move sollten zunächst ausschließlich mit Testdaten und Preview geprüft werden. Das Legacy-Message-API kann intern vorerst bestehen, ist aber keine UI-Abhängigkeit.

## Lizenz

MIT. Siehe [LICENSE](LICENSE).
