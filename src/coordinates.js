/**
 * Coordinate parsing and polygon quality checks for EGSA '87-style tables.
 */

const toNumber = (raw) => parseFloat(String(raw).replace(/,/g, '.'));

const integerDigits = (value) => String(Math.trunc(Math.abs(value))).length;

const formatCoord = (value, decimals = 2) => Number(value).toFixed(Math.min(4, Math.max(2, decimals)));

const decimalPlaces = (raw) => {
    const part = String(raw).split(/[.,]/)[1] || '';
    return part.length;
};

const EGSA_NUMBER = /(\d{5,7}[.,]\d{1,4})/g;

const asEgsaPair = (a, b) => {
    const da = integerDigits(a);
    const db = integerDigits(b);
    const inGreece = (x, y) => x >= 100000 && x <= 1000000 && y >= 3500000 && y <= 4800000;
    if (da === 6 && db === 7 && inGreece(a, b)) return { x: a, y: b };
    if (da === 7 && db === 6 && inGreece(b, a)) return { x: b, y: a };
    return null;
};

const dedupeConsecutive = (coordinates) =>
    coordinates.filter((c, i, arr) => i === 0 || c.x !== arr[i - 1].x || c.y !== arr[i - 1].y);

const collectEgsaNumbers = (text) => {
    const nums = [];
    EGSA_NUMBER.lastIndex = 0;
    let match;
    while ((match = EGSA_NUMBER.exec(text)) !== null) {
        const value = toNumber(match[1]);
        if (!Number.isNaN(value)) {
            nums.push({ value, decimals: decimalPlaces(match[1]) });
        }
    }
    return nums;
};

const pairsFromNumbers = (nums) => {
    const coordinates = [];
    for (let i = 0; i < nums.length - 1; i++) {
        const pair = asEgsaPair(nums[i].value, nums[i + 1].value);
        if (!pair) continue;
        const decimals = Math.max(nums[i].decimals, nums[i + 1].decimals, 2);
        coordinates.push({ x: formatCoord(pair.x, decimals), y: formatCoord(pair.y, decimals) });
        i += 1;
    }
    return dedupeConsecutive(coordinates);
};

const parseFromLines = (text) => {
    const coordinates = [];
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
        let cleanLine = line.trim().replace(/^[\s`|*+>-]+/, '');
        if (!cleanLine) continue;
        coordinates.push(...pairsFromNumbers(collectEgsaNumbers(cleanLine)));
    }
    return dedupeConsecutive(coordinates);
};

const parseFromStream = (text) => pairsFromNumbers(collectEgsaNumbers(text));

export const dropClosingDuplicate = (coordinates, tol = 0.05) => {
    if (!coordinates || coordinates.length < 4) return coordinates || [];
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (
        Math.abs(parseFloat(first.x) - parseFloat(last.x)) <= tol &&
        Math.abs(parseFloat(first.y) - parseFloat(last.y)) <= tol
    ) {
        return coordinates.slice(0, -1);
    }
    return coordinates;
};

const rankParsed = (coordinates) => {
    const analysis = analyzeCoordinates(coordinates);
    return analysis.count - analysis.warnings.length * 1000;
};

export const uniqueVerticesInOrder = (coordinates, tol = 0.05) => {
    const out = [];
    for (const p of coordinates || []) {
        const px = parseFloat(p.x);
        const py = parseFloat(p.y);
        const dup = out.some((q) => Math.abs(parseFloat(q.x) - px) <= tol && Math.abs(parseFloat(q.y) - py) <= tol);
        if (!dup) out.push(p);
    }
    return out;
};

/**
 * Parses model/OCR/PDF text into { x, y } pairs.
 * Accepts only EGSA-like pairs (6-digit X, 7-digit Y), ignores A/A and L columns.
 * Also pairs X/Y that appear on separate lines (CAD text). Drops a repeated closing vertex.
 */
export const parseCoordinates = (text) => {
    if (!text) return [];
    const cleaned = String(text).replace(/^\s*AREA\b.*$/gim, '').replace(/^\s*COUNT\b.*$/gim, '');
    const candidates = [
        dropClosingDuplicate(parseFromLines(cleaned)),
        dropClosingDuplicate(parseFromStream(cleaned)),
    ];
    candidates.push(dropClosingDuplicate(uniqueVerticesInOrder(candidates[0])));
    candidates.push(dropClosingDuplicate(uniqueVerticesInOrder(candidates[1])));
    return candidates.reduce((best, cur) => (rankParsed(cur) > rankParsed(best) ? cur : best));
};

export const parseGreekNumber = (raw) => {
    const s = String(raw).trim().replace(/\s/g, '');
    if (!s) return NaN;
    if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s) || (s.includes('.') && s.includes(','))) {
        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
    }
    if (s.includes(',')) return parseFloat(s.replace(',', '.'));
    return parseFloat(s);
};

export const parsePrintedArea = (text) => {
    if (!text) return null;
    const patterns = [
        /(?:^|\n)\s*AREA[:\s]+([0-9][0-9., ]*)/i,
        /ΕΜΒΑΔΟΝ[^0-9]{0,160}?([0-9]{1,3}(?:\.[0-9]{3})+,[0-9]{2})/i,
        /ΕΜΒΑΔΟΝ[^0-9]{0,160}?([0-9]+[.,][0-9]{2,3})/i,
        /Ε\s*=\s*([0-9]+[.,][0-9]{2,3})/,
        /εμβαδ[όο]ν[^0-9]{0,60}?([0-9]+[.,][0-9]{2,3})/i,
    ];
    for (const re of patterns) {
        const match = text.match(re);
        if (!match) continue;
        const value = parseGreekNumber(match[1]);
        if (!Number.isNaN(value) && value >= 5 && value <= 5e8) return value;
    }
    return null;
};

export const parsePrintedCount = (text) => {
    if (!text) return null;
    const tagged = text.match(/(?:^|\n)\s*COUNT[:\s]+(\d{1,4})/i);
    if (tagged) return parseInt(tagged[1], 10);
    const polygon = text.match(/\(1\s*,\s*2\s*,\s*3\s*,\s*\.\.\.\s*,\s*\d+\s*,\s*(\d{1,4})\s*,\s*1\)/);
    if (polygon) return parseInt(polygon[1], 10);
    return null;
};

const parseLengthToken = (raw) => {
    const token = String(raw);
    if (!/[.,]/.test(token)) return null;
    const value = toNumber(token);
    if (Number.isNaN(value) || value <= 0 || value >= 5000) return null;
    if (integerDigits(value) >= 5) return null;
    return value;
};

/**
 * Reads optional printed side lengths L from "A/A X Y L" lines, aligned to parsed vertices.
 */
export const parseSideLengths = (text, coordinates) => {
    if (!text || !coordinates?.length) return [];
    const lengths = [];
    const lineNumber = /(?:^|\s)(\d+[.,]\d+|\d+)(?=\s|$)/g;
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
        const pairs = pairsFromNumbers(collectEgsaNumbers(line));
        if (pairs.length !== 1) continue;
        const tokens = [];
        lineNumber.lastIndex = 0;
        let match;
        while ((match = lineNumber.exec(line)) !== null) tokens.push(match[1]);
        let length = null;
        for (let i = tokens.length - 1; i >= 0; i--) {
            const maybe = parseLengthToken(tokens[i]);
            if (maybe != null) {
                length = maybe;
                break;
            }
        }
        lengths.push({ x: pairs[0].x, y: pairs[0].y, length });
    }
    return coordinates.map((c) => {
        const hit = lengths.find((row) => row.x === c.x && row.y === c.y && row.length != null);
        return hit ? hit.length : null;
    });
};

export const parseVertexIndices = (text, coordinates) => {
    if (!text || !coordinates?.length) return [];
    const found = [];
    for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
        const pairs = pairsFromNumbers(collectEgsaNumbers(line));
        if (pairs.length !== 1) continue;
        const lead = line.trim().match(/^(\d{1,4})(?:\s|$)/);
        const index = lead ? parseInt(lead[1], 10) : null;
        found.push({ x: pairs[0].x, y: pairs[0].y, index });
    }
    return coordinates.map((c) => {
        const hit = found.find((row) => row.x === c.x && row.y === c.y && row.index != null);
        return hit ? hit.index : null;
    });
};

export const mergeCoordinateLists = (first, second, tol = 0.05) => {
    const out = [...(first || [])];
    for (const p of second || []) {
        const px = parseFloat(p.x);
        const py = parseFloat(p.y);
        const dup = out.some((q) => Math.abs(parseFloat(q.x) - px) <= tol && Math.abs(parseFloat(q.y) - py) <= tol);
        if (!dup) out.push({ x: px.toFixed(2), y: py.toFixed(2) });
    }
    return out;
};

const toPoints = (coordinates) =>
    coordinates.map((c) => ({ x: parseFloat(c.x), y: parseFloat(c.y) }));

const hypotPts = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const polygonArea = (coordinates) => {
    const pts = toPoints(coordinates);
    const n = pts.length;
    if (n < 3) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        sum += a.x * b.y - b.x * a.y;
    }
    return Math.abs(sum) / 2;
};

export const closureGap = (coordinates) => {
    const pts = toPoints(coordinates);
    if (pts.length < 2) return 0;
    return hypotPts(pts[0], pts[pts.length - 1]);
};

const median = (values) => {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const areaTolerance = (printedArea) => Math.max(1, printedArea * 0.0008);

const indexSpanOk = (knownIdx) => {
    if (knownIdx.length < 2) return true;
    const sorted = [...knownIdx].sort((a, b) => a - b);
    return sorted[sorted.length - 1] - sorted[0] + 1 <= knownIdx.length + 1;
};

export const analyzeCoordinates = (coordinates, meta = {}) => {
    const pts = toPoints(coordinates);
    const count = pts.length;
    const area = polygonArea(coordinates);
    const gap = closureGap(coordinates);
    const segments = [];
    for (let i = 0; i < Math.max(0, pts.length - 1); i++) {
        segments.push(hypotPts(pts[i], pts[i + 1]));
    }
    const medSeg = median(segments);
    const jumpLimit = Math.max(40, medSeg * 6);
    const longJumps = segments
        .map((length, index) => ({ index, length }))
        .filter((s) => s.length > jumpLimit);

    const printedArea = meta.printedArea ?? null;
    const printedCount = meta.printedCount ?? null;
    const sideLengths = meta.sideLengths || [];
    const indices = meta.indices || [];

    const looksEgsa = pts.length > 0 && pts.every((p) => integerDigits(p.x) === 6 && integerDigits(p.y) === 7);
    const outOfRange = looksEgsa
        ? pts
              .map((p, index) => ({ index, p }))
              .filter(({ p }) => p.x < 100000 || p.x > 1000000 || p.y < 3500000 || p.y > 4800000)
        : [];

    const duplicateKeys = new Map();
    const duplicates = [];
    pts.forEach((p, index) => {
        const key = `${p.x.toFixed(2)}|${p.y.toFixed(2)}`;
        if (duplicateKeys.has(key)) duplicates.push({ index, first: duplicateKeys.get(key) });
        else duplicateKeys.set(key, index);
    });

    const warnings = [];
    const checks = [];

    if (count > 0 && count < 3) {
        warnings.push('Fewer than 3 points were extracted, so this cannot be a closed parcel.');
    }
    checks.push({
        id: 'count',
        ok: printedCount ? count + 1 >= printedCount : count >= 3,
        label: printedCount
            ? `Vertex count ${count} (drawing lists ${printedCount})`
            : `Vertex count ${count}`,
    });

    if (count >= 8 && gap > Math.max(25, medSeg * 4)) {
        warnings.push(
            `Closing side is ${gap.toFixed(1)} m (typical sides ≈ ${medSeg.toFixed(1)} m). The first/last vertices may be wrong or missing.`
        );
    }
    checks.push({
        id: 'closure',
        ok: count < 8 ? null : gap <= Math.max(25, medSeg * 4),
        label: `Closing side ${gap.toFixed(2)} m`,
    });

    if (count >= 8 && longJumps.length) {
        const areaMatches = printedArea != null && Math.abs(area - printedArea) <= areaTolerance(printedArea);
        if (!areaMatches) {
            const first = longJumps[0];
            warnings.push(
                `Unusually long jump of ${first.length.toFixed(1)} m between points ${first.index + 1} and ${first.index + 2}. Some vertices may be missing or invented.`
            );
        }
    }
    checks.push({
        id: 'jumps',
        ok: count < 8 ? null : (longJumps.length === 0 || (printedArea != null && Math.abs(area - printedArea) <= areaTolerance(printedArea))),
        label: longJumps.length
            ? (printedArea != null && Math.abs(area - printedArea) <= areaTolerance(printedArea)
                ? `Long side present, but area still matches ΕΜΒΑΔΟΝ`
                : `Long jump between vertices`)
            : 'No missing-vertex jumps',
    });

    if (printedCount && count + 1 < printedCount) {
        warnings.push(
            `The drawing lists ${printedCount} vertices but only ${count} were extracted. The table is incomplete.`
        );
    }

    let areaOk = null;
    if (printedArea != null && count >= 3) {
        const diff = Math.abs(area - printedArea);
        areaOk = diff <= areaTolerance(printedArea);
        if (!areaOk) {
            warnings.push(
                `Computed area ${formatArea(area)} m² does not match printed ΕΜΒΑΔΟΝ ${formatArea(printedArea)} m².`
            );
        }
    }
    checks.push({
        id: 'area',
        ok: printedArea == null ? null : areaOk,
        label: printedArea == null
            ? 'Printed ΕΜΒΑΔΟΝ not found on the drawing'
            : `Area ${formatArea(area)} vs printed ${formatArea(printedArea)} m²`,
    });

    const lengthMismatches = [];
    if (count >= 3 && sideLengths.length === count) {
        const known = sideLengths.filter((v) => v != null).length;
        if (known >= Math.max(3, Math.floor(count * 0.5))) {
            for (let i = 0; i < count; i++) {
                const printed = sideLengths[i];
                if (printed == null) continue;
                const next = pts[(i + 1) % count];
                const computed = hypotPts(pts[i], next);
                if (Math.abs(computed - printed) > 0.25) {
                    lengthMismatches.push({ index: i, printed, computed });
                }
            }
            if (lengthMismatches.length) {
                const first = lengthMismatches[0];
                warnings.push(
                    `Printed side length L after point ${first.index + 1} is ${first.printed.toFixed(2)} m but the extracted vertices are ${first.computed.toFixed(2)} m apart.`
                );
            }
        }
    }
    const knownLengths = sideLengths.filter((v) => v != null).length;
    checks.push({
        id: 'sides',
        ok: knownLengths < Math.max(3, Math.floor(count * 0.5)) ? null : lengthMismatches.length === 0,
        label: knownLengths ? `Side lengths L (${knownLengths} printed)` : 'No printed L column',
    });

    if (outOfRange.length) {
        const first = outOfRange[0];
        warnings.push(
            `Point ${first.index + 1} is outside the EGSA ’87 range for Greece (X ${first.p.x.toFixed(2)}, Y ${first.p.y.toFixed(2)}). A digit may have been misread.`
        );
    }
    checks.push({
        id: 'range',
        ok: !looksEgsa ? null : outOfRange.length === 0,
        label: 'Coordinates inside EGSA ’87 Greece range',
    });

    if (duplicates.length) {
        warnings.push(
            `Point ${duplicates[0].index + 1} duplicates point ${duplicates[0].first + 1}. A row may have been copied twice.`
        );
    }
    checks.push({
        id: 'duplicates',
        ok: count < 3 ? null : duplicates.length === 0,
        label: 'No duplicate vertices',
    });

    const knownIdx = indices.filter((v) => v != null);
    if (knownIdx.length >= Math.max(4, Math.floor(count * 0.5))) {
        const sorted = [...knownIdx].sort((a, b) => a - b);
        const span = sorted[sorted.length - 1] - sorted[0] + 1;
        if (span > knownIdx.length + 1) {
            warnings.push(
                `A/A numbers skip values (${sorted[0]}…${sorted[sorted.length - 1]} but only ${knownIdx.length} rows). Part of the table was missed.`
            );
        }
    }
    checks.push({
        id: 'index',
        ok: knownIdx.length < Math.max(4, Math.floor(count * 0.5))
            ? null
            : indexSpanOk(knownIdx),
        label: 'A/A numbers are consecutive',
    });

    let quality = 'review';
    if (count >= 3 && warnings.length === 0) {
        const matchedPrintedArea = printedArea != null && Math.abs(area - printedArea) <= areaTolerance(printedArea);
        const lengthsOk = lengthMismatches.length === 0 && sideLengths.filter((v) => v != null).length >= Math.max(3, Math.floor(count * 0.5));
        quality = matchedPrintedArea || lengthsOk ? 'verified' : 'consistent';
    }

    return {
        count,
        area,
        gap,
        longJumps,
        warnings,
        printedArea,
        printedCount,
        lengthMismatches,
        checks,
        quality,
    };
};

export const shouldContinueExtraction = (coordinates, meta = {}) => {
    const { count, quality } = analyzeCoordinates(coordinates, meta);
    return count > 0 && quality === 'review';
};

export const extractionMetaFromText = (text) => ({
    printedArea: parsePrintedArea(text),
    printedCount: parsePrintedCount(text),
    sideLengths: [],
});

export const buildExtractionMeta = (text, coordinates) => ({
    printedArea: parsePrintedArea(text),
    printedCount: parsePrintedCount(text),
    sideLengths: parseSideLengths(text, coordinates),
    indices: parseVertexIndices(text, coordinates),
});

export const formatArea = (area) =>
    area.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
