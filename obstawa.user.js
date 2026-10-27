// ==UserScript==
// @name         Obstawa herosa eventowego SI + NI
// @namespace    https://github.com/Maatras/HerosEve
// @version      0.6.0
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

    function normalize(value) {
        return String(value || '')
            .normalize('NFC')
            .trim()
            .toLocaleLowerCase('pl-PL');
    }

    function isCoordinate(value) {
        return value !== null &&
            value !== undefined &&
            value !== '' &&
            Number.isInteger(Number(value)) &&
            Number(value) >= 0;
    }

    /*
     * Kordy zapisujemy razem z informacją o postaci,
     * żeby nie trzeba było zmieniać konfiguracji bazy.
     */
    function makePlayerInfo(nick, level, x, y) {
        const name = String(nick || '').trim();

        if (!name) return '';

        const displayName =
            name + (level ? ' ' + level : '');

        if (isCoordinate(x) && isCoordinate(y)) {
            return displayName +
                ' ⟦' + Number(x) + ',' + Number(y) + '⟧';
        }

        return displayName;
    }

    function readPlayerInfo(value) {
        const raw = String(value || '');
        const match = raw.match(/\s*⟦(\d+),(\d+)⟧$/);

        if (!match) {
            return {
                name: raw,
                coordinates: null
            };
        }

        return {
            name: raw.slice(0, match.index).trim(),
            coordinates: match[1] + ', ' + match[2]
        };
    }

    let clanKey = '';

    try {
        clanKey = String(
            GM_getValue(STORAGE_KEY, '') || ''
        );
    } catch (error) {
        console.error(
            '[Obstawa] Nie udało się odczytać klucza.'
        );
    }

    let snapshot = null;
    let lastSuccess = 0;
    let serverOffset = 0;

    let busy = false;
    let lastSent = 0;
    let lastLocation = '';
    let lastError = '';
    let keyRevision = 0;

    let hoveredMap = null;
    let pointerX = 0;
    let pointerY = 0;

    // ── Panel ──

    const panel = document.createElement('section');

    panel.id = 'event-hunt-panel';

    panel.style.cssText = `
        position: fixed;
        left: 12px;
        top: 120px;

        width: 310px;
        height: 240px;

        min-width: 210px;
        min-height: 90px;

        max-width: 95vw;
        max-height: 80vh;

        display: flex;
        flex-direction: column;

        box-sizing: border-box;
        overflow: hidden;
        resize: both;

        z-index: 2147483647;

        background: rgba(13, 16, 18, 0.97);
        color: #eee;

        border: 1px solid #777;
        border-radius: 8px;

        box-shadow: 0 3px 12px #000b;

        font: 11px/1.15 Arial, sans-serif;
        text-align: left;
    `;

    // ── Nagłówek ──

    const header = document.createElement('div');

    header.title =
        'Przeciągnij, aby przesunąć dodatek';

    header.style.cssText = `
        flex: none;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 5px;

        padding: 4px 5px;

        background: #303030;
        color: #eee;

        border-bottom: 1px solid #666;

        font-weight: bold;
        cursor: move;
        touch-action: none;
        user-select: none;
    `;

    const headerTitle = document.createElement('span');

    headerTitle.textContent = 'OBSTAWA HEROSA';

    const minimizeButton = document.createElement('button');

    minimizeButton.type = 'button';
    minimizeButton.textContent = '−';
    minimizeButton.title = 'Zminimalizuj';

    minimizeButton.style.cssText = `
        flex: none;

        width: 20px;
        height: 17px;
        padding: 0;

        background: #222;
        color: #fff;

        border: 1px solid #777;
        border-radius: 4px;

        font: bold 12px Arial, sans-serif;
        line-height: 12px;

        cursor: pointer;
    `;

    header.appendChild(headerTitle);
    header.appendChild(minimizeButton);
    panel.appendChild(header);

    // ── Status ──

    const status = document.createElement('div');

    status.style.cssText = `
        flex: none;

        padding: 2px 5px;

        background: #171a1c;
        color: #ffbd73;

        font-size: 10px;
    `;

    panel.appendChild(status);

    // ── Klucz klanu ──

    const settings = document.createElement('div');

    settings.style.cssText = `
        flex: none;
        display: flex;
        gap: 3px;

        padding: 3px 4px;

        background: #181b1d;
        border-bottom: 1px solid #444;
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
        padding: 2px 5px;

        background: #080a0c;
        color: #fff;

        border: 1px solid #666;
        border-radius: 4px;

        font: 10px Arial, sans-serif;
    `;

    const saveButton = document.createElement('button');

    saveButton.type = 'button';
    saveButton.textContent = 'Zapisz';

    saveButton.style.cssText = `
        flex: none;

        padding: 2px 6px;

        background: #383838;
        color: #fff;

        border: 1px solid #777;
        border-radius: 4px;

        font: 10px Arial, sans-serif;
        cursor: pointer;
    `;

    settings.appendChild(keyInput);
    settings.appendChild(saveButton);
    panel.appendChild(settings);

    // ── Lista map ──

    const list = document.createElement('div');

    list.style.cssText = `
        flex: 1;
        min-height: 0;

        overflow-y: auto;
        overflow-x: hidden;

        padding: 3px;

        scrollbar-width: thin;
    `;

    panel.appendChild(list);
    document.body.appendChild(panel);

    // ── Okienko po najechaniu ──

    const tooltip = document.createElement('div');

    tooltip.style.cssText = `
        position: fixed;
        display: none;

        min-width: 160px;
        max-width: 260px;
        max-height: 70vh;

        box-sizing: border-box;
        overflow: auto;

        padding: 8px 10px;

        background: rgba(10, 10, 10, 0.98);
        color: #eee;

        border: 1px solid #777;
        border-radius: 9px;

        box-shadow: 0 3px 12px #000d;

        font: 11px/1.4 Arial, sans-serif;
        text-align: left;

        pointer-events: none;
        z-index: 2147483647;
    `;

    document.body.appendChild(tooltip);

    function hideTooltip() {
        hoveredMap = null;
        tooltip.style.display = 'none';
    }

    function positionTooltip() {
        const margin = 8;

        const left = Math.min(
            pointerX + 14,
            innerWidth - tooltip.offsetWidth - margin
        );

        const top = Math.min(
            pointerY + 14,
            innerHeight - tooltip.offsetHeight - margin
        );

        tooltip.style.left =
            Math.max(margin, left) + 'px';

        tooltip.style.top =
            Math.max(margin, top) + 'px';
    }

    function updateTooltip() {
        if (!hoveredMap) {
            tooltip.style.display = 'none';
            return;
        }

        const connected =
            snapshot &&
            Date.now() - lastSuccess < 15000;

        if (!connected) {
            tooltip.style.display = 'none';
            return;
        }

        const players = snapshot.players.filter(
            player =>
                normalize(player.map) ===
                normalize(hoveredMap)
        );

        tooltip.replaceChildren();

        const title = document.createElement('div');

        title.textContent = hoveredMap;

        title.style.cssText = `
            padding-bottom: 5px;
            margin-bottom: 5px;

            border-bottom: 1px solid #555;

            color: #fff;
            font-weight: bold;

            overflow-wrap: anywhere;
        `;

        tooltip.appendChild(title);

        if (!players.length) {
            const empty = document.createElement('div');

            empty.textContent =
                'Nikt z dodatkiem tu nie stoi.';

            empty.style.color = '#aaa';

            tooltip.appendChild(empty);
        } else {
            players.forEach((player, index) => {
                const info = readPlayerInfo(player.nick);

                const entry = document.createElement('div');

                entry.style.cssText = `
                    padding: 3px 0;
                    ${
                        index > 0
                            ? 'border-top: 1px solid #333;'
                            : ''
                    }
                `;

                const name = document.createElement('div');

                name.textContent = info.name || 'Nieznana postać';

                name.style.cssText = `
                    color: #fff;
                    font-weight: bold;
                    overflow-wrap: anywhere;
                `;

                const coordinates = document.createElement('div');

                coordinates.textContent =
                    'Kordy: ' +
                    (info.coordinates || 'brak danych');

                coordinates.style.color = '#bbb';

                entry.appendChild(name);
                entry.appendChild(coordinates);
                tooltip.appendChild(entry);
            });
        }

        tooltip.style.display = 'block';
        positionTooltip();
    }

    // ── Zapisywanie klucza ──

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

            hideTooltip();
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

    // ── Minimalizowanie ──

    let minimized = false;
    let previousHeight = '';

    minimizeButton.addEventListener('pointerdown', event => {
        event.stopPropagation();
    });

    minimizeButton.addEventListener('click', event => {
        event.stopPropagation();

        minimized = !minimized;

        if (minimized) {
            previousHeight = panel.style.height;

            status.style.display = 'none';
            settings.style.display = 'none';
            list.style.display = 'none';

            panel.style.minHeight = '0';
            panel.style.height = 'auto';
            panel.style.resize = 'none';

            minimizeButton.textContent = '+';
            minimizeButton.title = 'Przywróć';

            hideTooltip();
        } else {
            status.style.display = '';
            settings.style.display = '';
            list.style.display = '';

            panel.style.minHeight = '90px';
            panel.style.height = previousHeight || '240px';
            panel.style.resize = 'both';

            minimizeButton.textContent = '−';
            minimizeButton.title = 'Zminimalizuj';
        }
    });

    // ── Przewijanie kółkiem ──

    panel.addEventListener('wheel', event => {
        if (list.scrollHeight <= list.clientHeight) return;

        let amount = event.deltaY;

        if (event.deltaMode === 1) {
            amount *= 16;
        } else if (event.deltaMode === 2) {
            amount *= list.clientHeight;
        }

        list.scrollTop += amount;

        hideTooltip();

        event.preventDefault();
        event.stopPropagation();
    }, {
        passive: false
    });

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

        hideTooltip();
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

    panel.addEventListener('pointerleave', () => {
        hideTooltip();
    });

    // ── Odczyt danych gry ──

    function getContext() {
        // Nowy interfejs

        const niHero = W.Engine?.hero?.d;
        const niMap = W.Engine?.map?.d;

        if (niHero?.id && niMap?.name) {
            let observed = null;

            try {
                const players =
                    W.Engine.others.getDrawableList();

                if (Array.isArray(players)) {
                    observed = [
                        ...new Set(
                            players
                                .filter(player =>
                                    player?.isPlayer === true &&
                                    player.d?.id != null
                                )
                                .map(player =>
                                    String(player.d.id)
                                )
                        )
                    ];
                }
            } catch (error) {
                // Gra nie udostępniła listy graczy.
            }

            return {
                id: String(niHero.id),

                nick: makePlayerInfo(
                    niHero.nick || niHero.n,
                    niHero.lvl,
                    niHero.x,
                    niHero.y
                ),

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
                            .filter(id =>
                                /^\d+$/.test(id)
                            )
                    )
                ];
            }

            return {
                id: String(siHero.id),

                nick: makePlayerInfo(
                    siHero.nick || siHero.n,
                    siHero.lvl,
                    siHero.x,
                    siHero.y
                ),

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
            .map(value =>
                String(value).padStart(2, '0')
            )
            .join(':');
    }

    // ── Wyświetlanie listy ──

    function paint() {
        const oldScrollTop = list.scrollTop;

        list.replaceChildren();

        const age = Date.now() - lastSuccess;

        const connected = Boolean(
            snapshot && age < 15000
        );

        if (!clanKey) {
            status.textContent =
                'Wpisz i zapisz klucz klanu';

            status.style.color = '#ffbd73';
        } else if (lastError) {
            status.textContent = lastError;
            status.style.color = '#ff8f80';
        } else if (connected) {
            status.textContent =
                'Połączono · nasze, inni';

            status.style.color = '#80df97';
        } else if (snapshot) {
            status.textContent =
                'Brak połączenia · dane nieaktualne';

            status.style.color = '#ff8f80';
        } else {
            status.textContent =
                'Łączenie / czekam na dane gry…';

            status.style.color = '#ffbd73';
        }

        for (const mapName of MAPS) {
            const row = document.createElement('div');

            row.style.cssText = `
                display: flex;
                align-items: center;
                gap: 4px;

                min-height: 17px;
                box-sizing: border-box;

                margin-bottom: 3px;
                padding: 1px 4px;

                overflow: hidden;
                white-space: nowrap;

                background: #202427;

                border: 1px solid #5e6568;
                border-radius: 6px;
            `;

            const ownPlayers =
                snapshot?.players?.filter(
                    player =>
                        normalize(player.map) ===
                        normalize(mapName)
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
                            ? '#83ee92'
                            : '#ff8980'
                        : '#aaa'
                };
            `;

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
                        ownPlayers.map(player =>
                            String(player.id)
                        )
                    );

                    otherCount = new Set(
                        observer.observed
                            .map(String)
                            .filter(id =>
                                !ownIds.has(id)
                            )
                    ).size;
                }
            }

            const counts = document.createElement('span');

            counts.textContent = connected
                ? ownPlayers.length + ', ' + otherCount
                : '—, —';

            counts.title =
                'Nasze osoby z dodatkiem, pozostali widoczni gracze';

            counts.style.cssText = `
                flex: none;
                min-width: 32px;

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

            row.addEventListener('pointerenter', event => {
                hoveredMap = mapName;
                pointerX = event.clientX;
                pointerY = event.clientY;

                updateTooltip();
            });

            row.addEventListener('pointermove', event => {
                hoveredMap = mapName;
                pointerX = event.clientX;
                pointerY = event.clientY;

                updateTooltip();
            });

            row.addEventListener('pointerleave', event => {
                const next = event.relatedTarget;

                if (!next || !list.contains(next)) {
                    hideTooltip();
                }
            });

            list.appendChild(row);
        }

        list.scrollTop = oldScrollTop;

        if (hoveredMap) {
            updateTooltip();
        }
    }

    // ── Synchronizacja z bazą ──

    function sync() {
        if (!clanKey) return;

        const current = getContext();

        if (!current || !current.nick) return;

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
                    lastError =
                        'Błąd bazy HTTP ' + response.status;

                    paint();
                    return;
                }

                try {
                    const data = JSON.parse(
                        response.responseText
                    );

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
