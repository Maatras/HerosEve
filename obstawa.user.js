// ==UserScript==
// @name         Obstawa herosa eventowego SI + NI
// @namespace    https://github.com/Maatras/HerosEve
// @version      0.8.0
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

    const KEY_STORAGE = 'obstawa-herosa-klucz-klanu';

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

    const norm = value =>
        String(value || '')
            .normalize('NFC')
            .trim()
            .toLocaleLowerCase('pl-PL');

    const world = location.hostname.toLowerCase();

    const positionKey = id =>
        'obstawa-pozycja-' + world + '-' + id;

    const nicknameKey = id =>
        'obstawa-nick-' + world + '-' + id;

    function readValue(key, fallback) {
        try {
            return GM_getValue(key, fallback);
        } catch (_) {
            return fallback;
        }
    }

    let clanKey = String(
        readValue(KEY_STORAGE, '') || ''
    );

    let displayNick = '';
    let currentCharacter = '';

    let snapshot = null;
    let lastSuccess = 0;
    let serverOffset = 0;

    let busy = false;
    let lastSent = 0;
    let lastSignature = '';
    let lastError = '';
    let revision = 0;

    let hoveredMap = null;
    let pointerX = 0;
    let pointerY = 0;

    let dragging = null;
    let minimized = false;
    let previousHeight = '';

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

    const title = document.createElement('span');

    title.textContent = 'OBSTAWA HEROSA';

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

    header.append(title, minimizeButton);
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

    // ── Klucz i wyświetlany nick ──

    const settings = document.createElement('div');

    settings.style.cssText = `
        flex: none;
        display: flex;
        flex-direction: column;
        gap: 3px;

        padding: 3px 4px;

        background: #181b1d;
        border-bottom: 1px solid #444;
    `;

    function makeInput(placeholder, type) {
        const input = document.createElement('input');

        input.type = type;
        input.placeholder = placeholder;
        input.autocomplete = 'off';
        input.spellcheck = false;

        input.style.cssText = `
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

        input.addEventListener('keydown', event => {
            event.stopPropagation();

            if (event.key === 'Enter') {
                event.preventDefault();
                saveButton.click();
            }
        });

        return input;
    }

    const keyInput = makeInput(
        'Klucz klanu',
        'password'
    );

    keyInput.value = clanKey;

    const nameInput = makeInput(
        'Wyświetlany nick (opcjonalnie)',
        'text'
    );

    nameInput.maxLength = 20;

    const firstLine = document.createElement('div');

    firstLine.style.cssText = `
        display: flex;
        gap: 3px;
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

    firstLine.append(keyInput, saveButton);
    settings.append(firstLine, nameInput);
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
        overflow: hidden;

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

    // ── Odczyt danych gry ──

    function isCoordinate(value) {
        return (
            value !== null &&
            value !== undefined &&
            value !== '' &&
            Number.isInteger(Number(value)) &&
            Number(value) >= 0
        );
    }

    function getContext() {
        // Nowy interfejs

        const ni = W.Engine?.hero?.d;
        const mapNI = W.Engine?.map?.d;

        if (ni?.id && mapNI?.name) {
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
            } catch (_) {
                // Brak aktualnej listy graczy.
            }

            return {
                id: String(ni.id),
                nick: String(ni.nick || ni.n || ''),
                level: ni.lvl,
                x: ni.x,
                y: ni.y,
                map: String(mapNI.name),
                observed
            };
        }

        // Stary interfejs

        const si = W.hero;
        const mapSI = W.map;

        if (si?.id && mapSI?.name) {
            let observed = null;

            if (
                W.g?.other &&
                typeof W.g.other === 'object'
            ) {
                observed = [
                    ...new Set(
                        Object.entries(W.g.other)
                            .filter(([, player]) =>
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
                id: String(si.id),
                nick: String(si.nick || si.n || ''),
                level: si.lvl,
                x: si.x,
                y: si.y,
                map: String(mapSI.name),
                observed
            };
        }

        return null;
    }

    /*
     * Baza przechowuje nazwę, kordy i wyświetlany nick
     * razem — dzięki temu nie trzeba zmieniać SQL.
     */
    function encodePlayer(current) {
        const name = current.nick
            .trim()
            .replace(/[⟦⟧⟪⟫]/g, '');

        if (!name) return '';

        const level = current.level
            ? ' ' + String(current.level)
            : '';

        const coordinates =
            isCoordinate(current.x) &&
            isCoordinate(current.y)
                ? ' ⟦' +
                  Number(current.x) +
                  ',' +
                  Number(current.y) +
                  '⟧'
                : '';

        const alias = displayNick
            .replace(/[⟦⟧⟪⟫]/g, '')
            .trim()
            .slice(0, 20);

        const aliasPart = alias
            ? ' ⟪' + alias + '⟫'
            : '';

        const suffix =
            level + coordinates + aliasPart;

        return (
            name.slice(
                0,
                Math.max(
                    0,
                    80 - Array.from(suffix).length
                )
            ) + suffix
        );
    }

    function decodePlayer(raw) {
        let text = String(raw || '');
        let alias = '';

        const aliasMatch = text.match(
            /\s*⟪([^⟪⟫]*)⟫$/
        );

        if (aliasMatch) {
            alias = aliasMatch[1];
            text = text.slice(0, aliasMatch.index);
        }

        let coords = null;

        const coordsMatch = text.match(
            /\s*⟦(\d+),(\d+)⟧$/
        );

        if (coordsMatch) {
            coords =
                coordsMatch[1] + ', ' + coordsMatch[2];

            text = text.slice(0, coordsMatch.index);
        }

        const fullName =
            text.trim() || 'Nieznana postać';

        const label =
            alias || fullName.replace(/\s+\d+$/, '');

        return {
            fullName,
            label,
            coords
        };
    }

    // ── Pozycja dodatku ──

    function constrain(left, top) {
        return {
            left: Math.max(
                0,
                Math.min(
                    Math.max(0, innerWidth - panel.offsetWidth),
                    left
                )
            ),

            top: Math.max(
                0,
                Math.min(
                    Math.max(0, innerHeight - panel.offsetHeight),
                    top
                )
            )
        };
    }

    function switchCharacter(current) {
        if (
            !current?.id ||
            currentCharacter === current.id
        ) {
            return;
        }

        currentCharacter = current.id;

        displayNick = String(
            readValue(nicknameKey(current.id), '') || ''
        );

        nameInput.value = displayNick;

        const saved = readValue(
            positionKey(current.id),
            null
        );

        const position = constrain(
            Number.isFinite(saved?.left)
                ? saved.left
                : 12,

            Number.isFinite(saved?.top)
                ? saved.top
                : 120
        );

        panel.style.left = position.left + 'px';
        panel.style.top = position.top + 'px';

        snapshot = null;
        lastSuccess = 0;
        lastError = '';
        lastSent = 0;
        lastSignature = '';

        revision++;
        hideTooltip();
    }

    // ── Zapisywanie ustawień ──

    saveButton.addEventListener('click', () => {
        const current = getContext();

        if (!current?.id) {
            lastError = 'Poczekaj na dane postaci';
            paint();
            return;
        }

        switchCharacter(current);

        const nextKey = keyInput.value.trim();

        const nextName = nameInput.value
            .replace(/[⟦⟧⟪⟫]/g, '')
            .trim()
            .slice(0, 20);

        try {
            GM_setValue(KEY_STORAGE, nextKey);

            GM_setValue(
                nicknameKey(current.id),
                nextName
            );

            clanKey = nextKey;
            displayNick = nextName;
            nameInput.value = nextName;

            revision++;
            snapshot = null;
            lastSuccess = 0;
            lastError = '';
            lastSent = 0;
            lastSignature = '';

            hideTooltip();
            paint();
            sync();
        } catch (_) {
            lastError = 'Nie udało się zapisać ustawień';
            paint();
        }
    });

    // ── Minimalizowanie ──

    minimizeButton.addEventListener(
        'pointerdown',
        event => event.stopPropagation()
    );

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

        const position = constrain(
            event.clientX - dragging.x,
            event.clientY - dragging.y
        );

        panel.style.left = position.left + 'px';
        panel.style.top = position.top + 'px';
    });

    header.addEventListener('pointerup', () => {
        if (!dragging) return;

        dragging = null;

        const current = getContext();

        if (!current?.id) return;

        const rect = panel.getBoundingClientRect();

        try {
            GM_setValue(
                positionKey(current.id),
                constrain(rect.left, rect.top)
            );
        } catch (_) {
            lastError = 'Nie udało się zapisać pozycji';
        }
    });

    header.addEventListener('pointercancel', () => {
        dragging = null;
    });

    window.addEventListener('resize', () => {
        const rect = panel.getBoundingClientRect();

        const position = constrain(
            rect.left,
            rect.top
        );

        panel.style.left = position.left + 'px';
        panel.style.top = position.top + 'px';
    });

    panel.addEventListener('pointerleave', hideTooltip);
    list.addEventListener('scroll', hideTooltip);

    // ── Okienko z postaciami i kordami ──

    function hideTooltip() {
        hoveredMap = null;
        tooltip.style.display = 'none';
    }

    function showTooltip(mapName, x, y) {
        hoveredMap = mapName;
        pointerX = x;
        pointerY = y;

        const connected =
            snapshot &&
            Date.now() - lastSuccess < 15000;

        if (!connected) {
            tooltip.style.display = 'none';
            return;
        }

        const players = snapshot.players.filter(
            player => norm(player.map) === norm(mapName)
        );

        tooltip.replaceChildren();

        const heading = document.createElement('div');

        heading.textContent = mapName;

        heading.style.cssText = `
            padding-bottom: 5px;
            margin-bottom: 5px;

            border-bottom: 1px solid #555;

            color: #fff;
            font-weight: bold;

            overflow-wrap: anywhere;
        `;

        tooltip.appendChild(heading);

        if (!players.length) {
            const empty = document.createElement('div');

            empty.textContent =
                'Nikt z dodatkiem tu nie stoi.';

            empty.style.color = '#aaa';

            tooltip.appendChild(empty);
        } else {
            players.forEach((player, index) => {
                const info = decodePlayer(player.nick);

                const entry = document.createElement('div');

                entry.style.cssText = `
                    padding: 3px 0;
                    ${
                        index
                            ? 'border-top: 1px solid #333;'
                            : ''
                    }
                `;

                const name = document.createElement('div');

                name.textContent = info.fullName;

                name.style.cssText = `
                    color: #fff;
                    font-weight: bold;
                    overflow-wrap: anywhere;
                `;

                const coords = document.createElement('div');

                coords.textContent =
                    'Kordy: ' +
                    (info.coords || 'brak danych');

                coords.style.color = '#bbb';

                entry.append(name, coords);
                tooltip.appendChild(entry);
            });
        }

        tooltip.style.display = 'block';

        tooltip.style.left = Math.max(
            8,
            Math.min(
                x + 14,
                innerWidth - tooltip.offsetWidth - 8
            )
        ) + 'px';

        tooltip.style.top = Math.max(
            8,
            Math.min(
                y + 14,
                innerHeight - tooltip.offsetHeight - 8
            )
        ) + 'px';
    }

    list.addEventListener('pointermove', event => {
        const row = event.target.closest('[data-event-map]');

        if (row && list.contains(row)) {
            showTooltip(
                row.dataset.eventMap,
                event.clientX,
                event.clientY
            );
        }
    });

    function formatTime(milliseconds) {
        const seconds = Math.max(
            0,
            Math.floor(milliseconds / 1000)
        );

        return [
            Math.floor(seconds / 3600),
            Math.floor(seconds % 3600 / 60),
            seconds % 60
        ]
            .map(value =>
                String(value).padStart(2, '0')
            )
            .join(':');
    }

    // ── Wyświetlanie listy ──

    function paint() {
        const scroll = list.scrollTop;

        list.replaceChildren();

        const connected = Boolean(
            snapshot &&
            Date.now() - lastSuccess < 15000
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
            const own =
                snapshot?.players?.filter(
                    player =>
                        norm(player.map) === norm(mapName)
                ) || [];

            const row = document.createElement('div');

            row.dataset.eventMap = mapName;

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

            const label = document.createElement('span');

            label.textContent = mapName;

            label.style.cssText = `
                flex: 1;
                min-width: 0;

                overflow: hidden;
                text-overflow: ellipsis;

                color: ${
                    connected
                        ? own.length
                            ? '#83ee92'
                            : '#ff8980'
                        : '#aaa'
                };
            `;

            row.appendChild(label);

            let others = '—';

            if (connected && own.length) {
                const observer = [...own]
                    .filter(player =>
                        Array.isArray(player.observed)
                    )
                    .sort((a, b) =>
                        Date.parse(b.updated) -
                        Date.parse(a.updated)
                    )[0];

                if (observer) {
                    const ids = new Set(
                        own.map(player => String(player.id))
                    );

                    others = new Set(
                        observer.observed
                            .map(String)
                            .filter(id => !ids.has(id))
                    ).size;
                }
            }

            const counts = document.createElement('span');

            counts.textContent = connected
                ? own.length + ', ' + others
                : '—, —';

            counts.title =
                'Nasze osoby z dodatkiem, pozostali widoczni gracze';

            counts.style.cssText = `
                flex: none;
                min-width: 32px;

                text-align: right;
                font-weight: bold;

                color: ${connected ? '#00ef90' : '#aaa'};
            `;

            row.appendChild(counts);

            const last =
                snapshot?.visits?.[mapName] ||
                Object.entries(snapshot?.visits || {})
                    .find(([name]) =>
                        norm(name) === norm(mapName)
                    )?.[1];

            const state = document.createElement('span');

            state.style.cssText = `
                flex: none;

                max-width: 110px;
                min-width: 66px;

                overflow: hidden;
                text-overflow: ellipsis;

                text-align: right;

                color: ${connected ? '#eee' : '#aaa'};
            `;

            state.textContent = !connected
                ? '—'
                : own.length
                    ? own
                        .map(player =>
                            decodePlayer(player.nick).label
                        )
                        .join(', ')
                    : last
                        ? formatTime(
                            Date.now() +
                            serverOffset -
                            Date.parse(last)
                        )
                        : 'brak danych';

            row.appendChild(state);
            list.appendChild(row);
        }

        list.scrollTop = scroll;

        if (hoveredMap) {
            const under = document.elementFromPoint(
                pointerX,
                pointerY
            );

            const row = under?.closest('[data-event-map]');

            if (row && list.contains(row)) {
                showTooltip(
                    row.dataset.eventMap,
                    pointerX,
                    pointerY
                );
            } else {
                hideTooltip();
            }
        }
    }

    // ── Synchronizacja z bazą ──

    function sync() {
        const current = getContext();

        if (!current?.id) return;

        switchCharacter(current);

        if (!clanKey) return;

        const info = encodePlayer(current);

        if (!info) return;

        const signature =
            current.id + '|' + current.map;

        if (
            busy ||
            (
                Date.now() - lastSent < 5000 &&
                signature === lastSignature
            )
        ) {
            return;
        }

        busy = true;
        lastSent = Date.now();
        lastSignature = signature;

        const started = Date.now();
        const requestRevision = revision;

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
                p_nick: info,
                p_map: current.map,
                p_observed: current.observed
            }),

            timeout: 8000,

            onload(response) {
                busy = false;

                if (requestRevision !== revision) return;

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
                        throw new Error('format');
                    }

                    snapshot = data;
                    lastSuccess = Date.now();
                    lastError = '';

                    serverOffset =
                        Date.parse(data.server_time) -
                        (started + Date.now()) / 2;

                    paint();
                } catch (_) {
                    lastError = 'Błąd odpowiedzi bazy';
                    paint();
                }
            },

            onerror() {
                busy = false;

                if (requestRevision === revision) {
                    lastError = 'Błąd połączenia';
                    paint();
                }
            },

            ontimeout() {
                busy = false;

                if (requestRevision === revision) {
                    lastError =
                        'Przekroczono czas połączenia';

                    paint();
                }
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
