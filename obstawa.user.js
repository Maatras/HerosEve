// ==UserScript==
// @name         Obstawa herosa eventowego SI + NI
// @namespace    https://github.com/Maatras/HerosEve
// @version      0.3.0
// @description  Wspólna lista obstawy map dla klanu.
// @match        https://*.margonem.pl/*
// @match        http://*.margonem.pl/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      wrtanjmzcdmtdaraisjr.supabase.co
// @updateURL    https://raw.githubusercontent.com/Maatras/HerosEve/main/obstawa.user.js
// @downloadURL  https://raw.githubusercontent.com/Maatras/HerosEve/main/obstawa.user.js
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const W = unsafeWindow;

    const URL =
        'https://wrtanjmzcdmtdaraisjr.supabase.co/rest/v1/rpc/event_sync';

    const API =
        'sb_publishable_DKLtQZ5c3RF6eU-kLGp52A_FfKKmSkD';

    const STORAGE_KEY = 'obstawa-herosa-klucz-klanu';

    const MAPS = [
        'Wyspa Magradit',
        'Wulkan Politraki p.1 - sala 1',
        'Wulkan Politraki p.1 - sala 2',
        'Wulkan Politraki p.1 - sala 3',
        'Wulkan Politraki p.2 - sala 1',
        'Wulkan Politraki p.2 - sala 2',
        'Wyspa Rem',
        'Latarniane Wybrzeże',
        'Korsarska Nora - sala 1',
        'Korsarska Nora - sala 2',
        'Korsarska Nora - sala 3',
        'Korsarska Nora - sala 4',
        'Korsarska Nora - sala 5',
        'Korsarska Nora - sala 6',
        'Ukryta Grota Morskich Diabłów - korytarz',
        'Ukryta Grota Morskich Diabłów - arsenał',
        'Ukryta Grota Morskich Diabłów',
        'Kopalnia Żółtego Kruszcu p.1 - sala 1',
        'Kopalnia Żółtego Kruszcu p.1 - sala 2',
        'Kopalnia Żółtego Kruszcu p.2 - sala 1'
    ];

    if (document.getElementById('event-hunt-panel')) return;

    const normalize = value =>
        String(value || '')
            .normalize('NFC')
            .trim()
            .toLocaleLowerCase('pl-PL');

    let clanKey = '';

    try {
        clanKey = String(GM_getValue(STORAGE_KEY, '') || '');
    } catch (error) {
        console.error('[Obstawa] Błąd odczytu klucza.');
    }

    let snapshot = null;
    let lastSuccess = 0;
    let serverOffset = 0;
    let busy = false;
    let lastSent = 0;
    let lastLocation = '';
    let lastError = '';
    let keyRevision = 0;

    // ── Panel ──

    const panel = document.createElement('section');

    panel.id = 'event-hunt-panel';

    panel.style.cssText = `
        position: fixed;
        left: 12px;
        top: 120px;

        width: 300px;
        height: 230px;

        min-width: 200px;
        min-height: 90px;

        max-width: 95vw;
        max-height: 80vh;

        display: flex;
        flex-direction: column;

        box-sizing: border-box;
        overflow: hidden;
        resize: both;

        z-index: 2147483647;

        background: #0d1012;
        color: #eee;

        border: 2px solid #747474;
        box-shadow: 0 3px 12px #000b;

        font: 11px/1.15 Arial, sans-serif;
        text-align: left;
    `;

    const header = document.createElement('div');

    header.textContent = 'OBSTAWA HEROSA';

    header.title = 'Przeciągnij, aby przesunąć dodatek';

    header.style.cssText = `
        flex: none;
        padding: 3px 5px;

        background: #303030;
        color: #eee;

        border-bottom: 1px solid #777;

        font-weight: bold;
        cursor: move;
        touch-action: none;
        user-select: none;
    `;

    panel.appendChild(header);

    const status = document.createElement('div');

    status.style.cssText = `
        flex: none;
        padding: 2px 5px;

        background: #171a1c;
        color: #ffbd73;

        font-size: 10px;
    `;

    panel.appendChild(status);

    // ── Ustawianie klucza ──

    const settings = document.createElement('div');

    settings.style.cssText = `
        flex: none;
        display: flex;
        gap: 3px;

        padding: 3px;

        background: #181b1d;
        border-bottom: 1px solid #555;
    `;

    const keyInput = document.createElement('input');

    keyInput.type = 'password';
    keyInput.placeholder = 'Klucz klanu';
    keyInput.autocomplete = 'off';
    keyInput.spellcheck = false;
    keyInput.value = clanKey;

    keyInput.style.cssText = `
        flex: 1;
        min-width: 0;

        box-sizing: border-box;
        padding: 2px 4px;

        background: #080a0c;
        color: #fff;

        border: 1px solid #777;

        font: 10px Arial, sans-serif;
    `;

    const saveButton = document.createElement('button');

    saveButton.type = 'button';
    saveButton.textContent = 'Zapisz';

    saveButton.style.cssText = `
        flex: none;
        padding: 2px 5px;

        background: #383838;
        color: #fff;

        border: 1px solid #777;

        font: 10px Arial, sans-serif;
        cursor: pointer;
    `;

    settings.appendChild(keyInput);
    settings.appendChild(saveButton);
    panel.appendChild(settings);

    const list = document.createElement('div');

    list.style.cssText = `
        flex: 1;
        min-height: 0;

        overflow-y: auto;
        overflow-x: hidden;

        padding: 2px;

        scrollbar-width: thin;
    `;

    panel.appendChild(list);
    document.body.appendChild(panel);

    saveButton.addEventListener('click', () => {
        const newKey = keyInput.value.trim();

        try {
            GM_setValue(STORAGE_KEY, newKey);

            clanKey = newKey;
            keyRevision++;

            snapshot = null;
            lastSuccess = 0;
            lastSent = 0;
            lastLocation = '';
            lastError = '';

            paint();
            sync();
        } catch (error) {
            lastError = 'Nie udało się zapisać klucza.';
            paint();
        }
    });

    keyInput.addEventListener('keydown', event => {
        event.stopPropagation();

        if (event.key === 'Enter') {
            event.preventDefault();
            saveButton.click();
        }
    });

    // ── Przewijanie kółkiem myszy ──

    panel.addEventListener('wheel', event => {
        if (list.scrollHeight <= list.clientHeight) return;

        let amount = event.deltaY;

        if (event.deltaMode === 1) {
            amount *= 16;
        } else if (event.deltaMode === 2) {
            amount *= list.clientHeight;
        }

        list.scrollTop += amount;

        event.preventDefault();
        event.stopPropagation();
    }, { passive: false });

    // ── Przesuwanie panelu ──

    let dragging = null;

    header.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;

        const rect = panel.getBoundingClientRect();

        dragging = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };

        header.setPointerCapture(event.pointerId);
        event.preventDefault();
    });

    header.addEventListener('pointermove', event => {
        if (!dragging) return;

        panel.style.left = Math.max(
            0,
            Math.min(
                innerWidth - panel.offsetWidth,
                event.clientX - dragging.x
            )
        ) + 'px';

        panel.style.top = Math.max(
            0,
            Math.min(
                innerHeight - panel.offsetHeight,
                event.clientY - dragging.y
            )
        ) + 'px';
    });

    header.addEventListener('pointerup', () => {
        dragging = null;
    });

    header.addEventListener('pointercancel', () => {
        dragging = null;
    });

    // ── Odczyt danych gry ──

    function getContext() {
        // Nowy interfejs

        const niHero = W.Engine?.hero?.d;
        const niMap = W.Engine?.map?.d;

        if (niHero?.id && niMap?.name) {
            let observed = null;

            try {
                const players = W.Engine.others.getDrawableList();

                if (Array.isArray(players)) {
                    observed = [
                        ...new Set(
                            players
                                .filter(player =>
                                    player?.isPlayer === true &&
                                    player.d?.id != null
                                )
                                .map(player => String(player.d.id))
                        )
                    ];
                }
            } catch (error) {
                // Gra nie udostępniła aktualnej listy graczy.
            }

            return {
                id: String(niHero.id),
                nick: String(niHero.nick || niHero.n || ''),
                map: String(niMap.name),
                observed
            };
        }

        // Stary interfejs

        const siHero = W.hero;
        const siMap = W.map;

        if (siHero?.id && siMap?.name) {
            let observed = null;

            if (
                W.g?.other &&
                typeof W.g.other === 'object'
            ) {
                observed = [
                    ...new Set(
                        Object.entries(W.g.other)
                            .filter(([key, player]) =>
                                player &&
                                typeof player === 'object'
                            )
                            .map(([key, player]) =>
                                String(player.id ?? key)
                            )
                            .filter(id => /^\d+$/.test(id))
                    )
                ];
            }

            return {
                id: String(siHero.id),
                nick: String(siHero.nick || siHero.n || ''),
                map: String(siMap.name),
                observed
            };
        }

        return null;
    }

    function formatTime(milliseconds) {
        const totalSeconds = Math.max(
            0,
            Math.floor(milliseconds / 1000)
        );

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor(totalSeconds % 3600 / 60);
        const seconds = totalSeconds % 60;

        return [hours, minutes, seconds]
            .map(value => String(value).padStart(2, '0'))
            .join(':');
    }

    // ── Wygląd listy ──

    function paint() {
        const oldScrollTop = list.scrollTop;

        list.replaceChildren();

        const age = Date.now() - lastSuccess;
        const connected = Boolean(snapshot && age < 15000);

        if (!clanKey) {
            status.textContent = 'Wpisz i zapisz klucz klanu';
            status.style.color = '#ffbd73';
        } else if (lastError) {
            status.textContent = lastError;
            status.style.color = '#ff8f80';
        } else if (connected) {
            status.textContent = 'Połączono · nasze, inni';
            status.style.color = '#80df97';
        } else if (snapshot) {
            status.textContent = 'Brak połączenia · dane nieaktualne';
            status.style.color = '#ff8f80';
        } else {
            status.textContent = 'Łączenie / czekam na dane gry…';
            status.style.color = '#ffbd73';
        }

        for (const mapName of MAPS) {
            const row = document.createElement('div');

            row.style.cssText = `
                display: flex;
                align-items: center;
                gap: 3px;

                min-height: 15px;
                box-sizing: border-box;

                margin-bottom: 2px;
                padding: 0 3px;

                overflow: hidden;
                white-space: nowrap;

                background: #171a1c;
                border: 1px solid #686868;
            `;

            const ownPlayers = snapshot?.players?.filter(
                player =>
                    normalize(player.map) === normalize(mapName)
            ) || [];

            const mapLabel = document.createElement('span');

            mapLabel.textContent = mapName;

            mapLabel.style.cssText = `
                flex: 1;
                min-width: 0;

                overflow: hidden;
                text-overflow: ellipsis;

                color: ${
                    connected
                        ? ownPlayers.length
                            ? '#81ef83'
                            : '#ff7f78'
                        : '#aaa'
                };
            `;

            mapLabel.title = mapName + (
                ownPlayers.length
                    ? '\n' +
                      ownPlayers
                          .map(player => player.nick)
                          .join(', ')
                    : ''
            );

            row.appendChild(mapLabel);

            let otherCount = '—';

            if (connected && ownPlayers.length) {
                const observer = [...ownPlayers]
                    .filter(player =>
                        Array.isArray(player.observed)
                    )
                    .sort((a, b) =>
                        Date.parse(b.updated) -
                        Date.parse(a.updated)
                    )[0];

                if (observer) {
                    const ownIds = new Set(
                        ownPlayers.map(player => String(player.id))
                    );

                    otherCount = new Set(
                        observer.observed
                            .map(String)
                            .filter(id => !ownIds.has(id))
                    ).size;
                }
            }

            const counts = document.createElement('span');

            counts.textContent = connected
                ? ownPlayers.length + ', ' + otherCount
                : '—, —';

            counts.title =
                'Nasze postacie z dodatkiem, pozostali widoczni gracze';

            counts.style.cssText = `
                flex: none;
                min-width: 30px;

                color: ${connected ? '#00ef90' : '#aaa'};

                font-weight: bold;
                text-align: right;
            `;

            row.appendChild(counts);

            const lastSeen =
                snapshot?.visits?.[mapName] ||
                Object.entries(snapshot?.visits || {})
                    .find(([name]) =>
                        normalize(name) === normalize(mapName)
                    )?.[1];

            const time = document.createElement('span');

            time.style.cssText = `
                flex: none;
                min-width: 66px;

                color: ${connected ? '#eee' : '#aaa'};

                text-align: right;
                font-variant-numeric: tabular-nums;
            `;

            if (!connected) {
                time.textContent = '—';
            } else if (ownPlayers.length) {
                time.textContent = 'OBSTAWIONA';
            } else if (lastSeen) {
                time.textContent = formatTime(
                    Date.now() +
                    serverOffset -
                    Date.parse(lastSeen)
                );
            } else {
                time.textContent = 'brak danych';
            }

            row.appendChild(time);
            list.appendChild(row);
        }

        list.scrollTop = oldScrollTop;
    }

    // ── Synchronizacja z bazą ──

    function sync() {
        if (!clanKey) return;

        const current = getContext();

        if (!current || !current.nick) {
            return;
        }

        const locationSignature =
            current.id + '|' + current.map;

        if (
            busy ||
            (
                Date.now() - lastSent < 5000 &&
                locationSignature === lastLocation
            )
        ) {
            return;
        }

        busy = true;
        lastSent = Date.now();
        lastLocation = locationSignature;

        const started = Date.now();
        const requestRevision = keyRevision;

        GM_xmlhttpRequest({
            method: 'POST',
            url: URL,

            headers: {
                apikey: API,
                'Content-Type': 'application/json'
            },

            data: JSON.stringify({
                p_key: clanKey,
                p_world: location.hostname.split('.')[0],
                p_id: current.id,
                p_nick: current.nick,
                p_map: current.map,
                p_observed: current.observed
            }),

            timeout: 8000,

            onload(response) {
                busy = false;

                if (requestRevision !== keyRevision) return;

                if (
                    response.status < 200 ||
                    response.status >= 300
                ) {
                    lastError = 'Błąd bazy HTTP ' + response.status;
                    paint();
                    return;
                }

                try {
                    const data = JSON.parse(response.responseText);

                    if (!Array.isArray(data.players)) {
                        throw new Error('Nieprawidłowy format');
                    }

                    snapshot = data;
                    lastSuccess = Date.now();
                    lastError = '';

                    serverOffset =
                        Date.parse(data.server_time) -
                        (started + Date.now()) / 2;

                    paint();
                } catch (error) {
                    lastError = 'Błąd odpowiedzi bazy';
                    paint();
                }
            },

            onerror() {
                busy = false;

                if (requestRevision !== keyRevision) return;

                lastError = 'Błąd połączenia';
                paint();
            },

            ontimeout() {
                busy = false;

                if (requestRevision !== keyRevision) return;

                lastError = 'Przekroczono czas połączenia';
                paint();
            },

            onabort() {
                busy = false;
            }
        });
    }

    paint();
    sync();

    setInterval(() => {
        sync();
        paint();
    }, 1000);
})();
